-- =====================================================================
--  Sistema de pontuação DCS — schema para Supabase
--  Fase 1: pontuação manual pelo admin
--  Já preparado para a Fase 2 (eventos automáticos do servidor DCS)
--
--  Como usar: cole tudo no SQL Editor do Supabase e rode de uma vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

-- Perfil do jogador (1:1 com auth.users, criado automaticamente no 1º login)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null default '',
  nickname    text,
  role        text not null default 'player' check (role in ('player','admin')),
  status      text not null default 'active' check (status in ('active','banned')),
  created_at  timestamptz not null default now(),
  constraint nickname_format check (nickname is null or nickname ~ '^[A-Za-z0-9_]{3,16}$')
);
-- nickname único sem diferenciar maiúsculas/minúsculas
create unique index profiles_nickname_unique on public.profiles (lower(nickname));

-- Catálogo de aviões (o que aparece na tech tree)
create table public.aircraft (
  id          text primary key,              -- ex.: 'f16c', 'fa18c'
  name        text not null,
  tier        int  not null default 1,
  cost        int  not null default 0 check (cost >= 0),
  description text,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

-- Pré-requisitos: para liberar aircraft_id é preciso ter TODOS os requires_id
create table public.aircraft_prereqs (
  aircraft_id  text references public.aircraft(id) on delete cascade,
  requires_id  text references public.aircraft(id) on delete cascade,
  primary key (aircraft_id, requires_id),
  check (aircraft_id <> requires_id)
);

-- Aviões liberados por jogador
create table public.user_aircraft (
  user_id      uuid references public.profiles(id) on delete cascade,
  aircraft_id  text references public.aircraft(id),
  unlocked_at  timestamptz not null default now(),
  granted_by   uuid references public.profiles(id),   -- preenchido quando um admin libera
  primary key (user_id, aircraft_id)
);

-- Histórico de pontos (o saldo é sempre a SOMA desta tabela)
create table public.points_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        int  not null check (amount <> 0),
  reason        text not null check (length(trim(reason)) > 0),
  source        text not null check (source in ('manual','unlock','refund','server')),
  created_by    uuid references public.profiles(id),
  external_ref  text unique,   -- Fase 2: id do evento do servidor DCS (evita lançar duas vezes)
  created_at    timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

-- Fase 2: vínculo conta do site <-> UCID do DCS (criada agora para não migrar depois)
create table public.dcs_links (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  ucid       text not null unique,
  linked_at  timestamptz not null default now()
);

-- Registro de tudo que os admins fazem
create table public.admin_audit_log (
  id              bigint generated always as identity primary key,
  admin_id        uuid not null references public.profiles(id),
  action          text not null,
  target_user_id  uuid references public.profiles(id),
  details         jsonb,
  created_at      timestamptz not null default now()
);

-- Saldo de cada jogador
create view public.player_balances with (security_invoker = true) as
select p.id as user_id,
       coalesce(sum(l.amount), 0)::int as balance
from public.profiles p
left join public.points_ledger l on l.user_id = p.id
group by p.id;


-- ---------------------------------------------------------------------
-- 2. CRIAÇÃO AUTOMÁTICA DO PERFIL NO PRIMEIRO LOGIN
-- ---------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 3. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create function public.assert_admin() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
end $$;


-- ---------------------------------------------------------------------
-- 4. FUNÇÕES DO JOGADOR  (chamadas pelo front com supabase.rpc(...))
-- ---------------------------------------------------------------------

-- Checa se um nickname está livre (para validação em tempo real)
create function public.nickname_available(p_nickname text) returns boolean
language sql stable security definer set search_path = public as $$
  select trim(p_nickname) ~ '^[A-Za-z0-9_]{3,16}$'
     and not exists (select 1 from public.profiles where lower(nickname) = lower(trim(p_nickname)));
$$;

-- Define o nickname (só uma vez)
create function public.set_nickname(p_nickname text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_nick text := trim(p_nickname);
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_nick !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'NICKNAME_INVALID'; end if;
  if lower(v_nick) = any (array['admin','administrador','adm','moderador','mod','staff','suporte','system','server'])
  then raise exception 'NICKNAME_RESERVED'; end if;

  update public.profiles set nickname = v_nick
   where id = auth.uid() and nickname is null;
  if not found then raise exception 'NICKNAME_ALREADY_SET'; end if;
exception
  when unique_violation then raise exception 'NICKNAME_TAKEN';
end $$;

-- Libera um avião: valida status, pré-requisitos e saldo, tudo numa transação
create function public.unlock_aircraft(p_aircraft_id text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_status  text;
  v_cost    int;
  v_balance int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  -- trava a linha do jogador: dois cliques simultâneos não gastam duas vezes
  select status into v_status from public.profiles where id = v_uid for update;
  if v_status is distinct from 'active' then raise exception 'PLAYER_NOT_ACTIVE'; end if;

  select cost into v_cost from public.aircraft where id = p_aircraft_id and active;
  if not found then raise exception 'AIRCRAFT_NOT_FOUND'; end if;

  if exists (select 1 from public.user_aircraft
             where user_id = v_uid and aircraft_id = p_aircraft_id)
  then raise exception 'ALREADY_UNLOCKED'; end if;

  if exists (select 1 from public.aircraft_prereqs pr
             where pr.aircraft_id = p_aircraft_id
               and not exists (select 1 from public.user_aircraft ua
                               where ua.user_id = v_uid and ua.aircraft_id = pr.requires_id))
  then raise exception 'PREREQS_MISSING'; end if;

  select coalesce(sum(amount), 0) into v_balance
    from public.points_ledger where user_id = v_uid;
  if v_balance < v_cost then raise exception 'INSUFFICIENT_POINTS'; end if;

  if v_cost > 0 then
    insert into public.points_ledger (user_id, amount, reason, source, created_by)
    values (v_uid, -v_cost, 'Desbloqueio: ' || p_aircraft_id, 'unlock', v_uid);
  end if;

  insert into public.user_aircraft (user_id, aircraft_id) values (v_uid, p_aircraft_id);

  return v_balance - v_cost;   -- novo saldo
end $$;


-- ---------------------------------------------------------------------
-- 5. FUNÇÕES DO ADMIN  (todas checam role = 'admin' e gravam auditoria)
-- ---------------------------------------------------------------------

-- Lança pontos (positivo = adicionar, negativo = remover). Retorna o novo saldo.
create function public.admin_add_points(p_user uuid, p_amount int, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  perform public.assert_admin();
  if p_amount = 0 then raise exception 'AMOUNT_ZERO'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.points_ledger (user_id, amount, reason, source, created_by)
  values (p_user, p_amount, trim(p_reason), 'manual', auth.uid());

  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'add_points', p_user, jsonb_build_object('amount', p_amount, 'reason', trim(p_reason)));

  select coalesce(sum(amount), 0) into v_balance from public.points_ledger where user_id = p_user;
  return v_balance;
end $$;

-- Libera um avião de graça para o jogador
create function public.admin_grant_aircraft(p_user uuid, p_aircraft_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  insert into public.user_aircraft (user_id, aircraft_id, granted_by)
  values (p_user, p_aircraft_id, auth.uid())
  on conflict do nothing;

  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'grant_aircraft', p_user, jsonb_build_object('aircraft', p_aircraft_id));
end $$;

-- Revoga um avião; com p_refund = true devolve o custo atual do avião
create function public.admin_revoke_aircraft(p_user uuid, p_aircraft_id text, p_refund boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cost int;
begin
  perform public.assert_admin();
  delete from public.user_aircraft where user_id = p_user and aircraft_id = p_aircraft_id;
  if not found then raise exception 'NOT_UNLOCKED'; end if;

  if p_refund then
    select cost into v_cost from public.aircraft where id = p_aircraft_id;
    if v_cost > 0 then
      insert into public.points_ledger (user_id, amount, reason, source, created_by)
      values (p_user, v_cost, 'Reembolso: ' || p_aircraft_id, 'refund', auth.uid());
    end if;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'revoke_aircraft', p_user,
          jsonb_build_object('aircraft', p_aircraft_id, 'refund', p_refund));
end $$;

-- Bane ou reativa um jogador
create function public.admin_set_status(p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if p_user = auth.uid() then raise exception 'CANNOT_CHANGE_OWN_STATUS'; end if;
  update public.profiles set status = p_status where id = p_user;
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'set_status', p_user, jsonb_build_object('status', p_status));
end $$;

-- Lista de jogadores para o painel (busca + paginação)
create function public.admin_list_players(
  p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  user_id uuid, nickname text, email text, role text, status text,
  balance int, total_earned int, aircraft_count int, dcs_linked boolean,
  created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
  select p.id, p.nickname, p.email, p.role, p.status,
         coalesce((select sum(l.amount) from public.points_ledger l
                   where l.user_id = p.id), 0)::int,
         coalesce((select sum(l.amount) from public.points_ledger l
                   where l.user_id = p.id and l.amount > 0 and l.source in ('manual','server')), 0)::int,
         (select count(*) from public.user_aircraft ua where ua.user_id = p.id)::int,
         exists (select 1 from public.dcs_links d where d.user_id = p.id),
         p.created_at,
         count(*) over ()
  from public.profiles p
  where p_search is null
     or p.nickname ilike '%' || p_search || '%'
     or p.email    ilike '%' || p_search || '%'
  order by p.created_at desc
  limit p_limit offset p_offset;
end $$;


-- ---------------------------------------------------------------------
-- 6. SEGURANÇA (RLS)
--    Leitura direta: o jogador vê só os próprios dados; o admin vê tudo.
--    Escrita: só pelas funções acima (não há policies de insert/update).
-- ---------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.aircraft         enable row level security;
alter table public.aircraft_prereqs enable row level security;
alter table public.user_aircraft    enable row level security;
alter table public.points_ledger    enable row level security;
alter table public.dcs_links        enable row level security;
alter table public.admin_audit_log  enable row level security;

create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy aircraft_select on public.aircraft
  for select to authenticated using (true);
create policy aircraft_admin_write on public.aircraft
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy prereqs_select on public.aircraft_prereqs
  for select to authenticated using (true);
create policy prereqs_admin_write on public.aircraft_prereqs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy user_aircraft_select on public.user_aircraft
  for select using (user_id = auth.uid() or public.is_admin());

create policy ledger_select on public.points_ledger
  for select using (user_id = auth.uid() or public.is_admin());

create policy dcs_links_select on public.dcs_links
  for select using (user_id = auth.uid() or public.is_admin());

create policy audit_select on public.admin_audit_log
  for select using (public.is_admin());


-- ---------------------------------------------------------------------
-- 7. PERMISSÕES DAS FUNÇÕES (só usuários logados podem chamar)
-- ---------------------------------------------------------------------

revoke execute on function public.handle_new_user()                          from public, anon, authenticated;
revoke execute on function public.is_admin()                                 from public, anon;
revoke execute on function public.assert_admin()                             from public, anon;
revoke execute on function public.nickname_available(text)                   from public, anon;
revoke execute on function public.set_nickname(text)                         from public, anon;
revoke execute on function public.unlock_aircraft(text)                      from public, anon;
revoke execute on function public.admin_add_points(uuid, int, text)          from public, anon;
revoke execute on function public.admin_grant_aircraft(uuid, text)           from public, anon;
revoke execute on function public.admin_revoke_aircraft(uuid, text, boolean) from public, anon;
revoke execute on function public.admin_set_status(uuid, text)               from public, anon;
revoke execute on function public.admin_list_players(text, int, int)         from public, anon;

grant execute on function public.is_admin()                                 to authenticated;
grant execute on function public.assert_admin()                             to authenticated;
grant execute on function public.nickname_available(text)                   to authenticated;
grant execute on function public.set_nickname(text)                         to authenticated;
grant execute on function public.unlock_aircraft(text)                      to authenticated;
grant execute on function public.admin_add_points(uuid, int, text)          to authenticated;
grant execute on function public.admin_grant_aircraft(uuid, text)           to authenticated;
grant execute on function public.admin_revoke_aircraft(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_status(uuid, text)               to authenticated;
grant execute on function public.admin_list_players(text, int, int)         to authenticated;


-- ---------------------------------------------------------------------
-- 8. DEPOIS DE RODAR
-- ---------------------------------------------------------------------
-- a) Faça login uma vez no site com a sua conta Google e depois rode:
--      update public.profiles set role = 'admin' where email = 'seu-email@gmail.com';
--
-- b) Cadastre os aviões da sua tech tree (exemplo):
--      insert into public.aircraft (id, name, tier, cost) values
--        ('tf51d', 'TF-51D Mustang', 1, 0),
--        ('f5e',   'F-5E Tiger II',  2, 100),
--        ('f16c',  'F-16C Viper',    3, 300);
--      insert into public.aircraft_prereqs (aircraft_id, requires_id) values
--        ('f5e', 'tf51d'),
--        ('f16c', 'f5e');
