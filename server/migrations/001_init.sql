-- =====================================================================
--  Hangar DCS — estrutura do banco (PostgreSQL)
--  Aplicada automaticamente pelo servidor na primeira vez que ele sobe.
-- =====================================================================

-- Jogadores (contas do site)
create table users (
  id             uuid primary key default gen_random_uuid(),
  google_sub     text not null unique,          -- id estável da conta Google
  email          text not null,
  name           text,
  avatar_url     text,
  nickname       text,
  role           text not null default 'player' check (role in ('player', 'admin')),
  status         text not null default 'active' check (status in ('active', 'banned')),
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  constraint nickname_format check (nickname is null or nickname ~ '^[A-Za-z0-9_]{3,16}$')
);
-- nickname único sem diferenciar maiúsculas/minúsculas
create unique index users_nickname_lower_idx on users (lower(nickname));

-- ---------------------------------------------------------------- tech tree

-- Tiers: o custo e o bônus de PM são definidos por tier.
-- Tiers com custo 0 ficam na frota de todos os pilotos automaticamente.
create table tiers (
  tier        int primary key check (tier >= 1),
  label       text not null,                         -- 'I', 'II'…
  cost        int not null default 0 check (cost >= 0),
  multiplier  numeric(4, 2) not null default 1.00 check (multiplier > 0)  -- bônus de PM ao voar aeronaves do tier
);

-- Faixas horizontais da árvore (ex.: "Leste: Su e MiG" ocupa as linhas 0 a 2)
create table tree_bands (
  id         int generated always as identity primary key,
  name       text not null,
  row_start  int not null,
  row_end    int not null,
  check (row_end >= row_start)
);

create table aircraft (
  id           text primary key,                    -- ex.: 'f16c'
  name         text not null,
  tier         int not null references tiers(tier),
  role         text not null default 'fighter'
               check (role in ('fighter', 'multi', 'attack', 'aheli', 'theli', 'tplane')),
  row          int not null default 0,              -- linha na árvore (posição vertical)
  icon         text,                                -- id do ícone em web/public/aircraft-icons.svg
  restriction  text,                                -- restrição de armamento (época)
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Regra 2 (Bound): para comprar aircraft_id é obrigatório ter requires_id
create table aircraft_bound (
  aircraft_id  text not null references aircraft(id) on delete cascade,
  requires_id  text not null references aircraft(id) on delete cascade,
  primary key (aircraft_id, requires_id),
  check (aircraft_id <> requires_id)
);

-- Linhas de família (só visuais, não são requisito)
create table aircraft_family (
  aircraft_id  text not null references aircraft(id) on delete cascade,
  parent_id    text not null references aircraft(id) on delete cascade,
  primary key (aircraft_id, parent_id),
  check (aircraft_id <> parent_id)
);

-- Aeronaves compradas/liberadas por jogador (as de tiers gratuitos não precisam de linha aqui)
create table user_aircraft (
  user_id      uuid not null references users(id) on delete cascade,
  aircraft_id  text not null references aircraft(id),
  unlocked_at  timestamptz not null default now(),
  granted_by   uuid references users(id),           -- preenchido quando um admin libera
  primary key (user_id, aircraft_id)
);

-- ---------------------------------------------------------------- pontos

-- Histórico de Pontos de Missão. O saldo é sempre a SOMA desta tabela.
create table points_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references users(id) on delete cascade,
  amount        int  not null check (amount <> 0),
  reason        text not null check (length(trim(reason)) > 0),
  source        text not null check (source in ('manual', 'unlock', 'refund', 'server')),
  created_by    uuid references users(id),
  external_ref  text unique,                    -- Fase 2: id do evento vindo do servidor DCS
  created_at    timestamptz not null default now()
);
create index points_ledger_user_idx on points_ledger (user_id, created_at desc);

-- Configurações gerais (ex.: PM base por missão)
create table settings (
  key    text primary key,
  value  jsonb not null
);

-- ---------------------------------------------------------------- fase 2 (DCS)

-- Vínculo conta do site <-> UCID do DCS
create table dcs_links (
  user_id    uuid primary key references users(id) on delete cascade,
  ucid       text not null unique,
  linked_at  timestamptz not null default now()
);

-- Códigos temporários para vincular a conta pelo chat do DCS
create table link_codes (
  code        text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null
);

-- ---------------------------------------------------------------- auditoria

create table admin_audit_log (
  id              bigint generated always as identity primary key,
  admin_id        uuid not null references users(id),
  action          text not null,
  target_user_id  uuid references users(id),
  details         jsonb,
  created_at      timestamptz not null default now()
);
create index admin_audit_log_target_idx on admin_audit_log (target_user_id, created_at desc);
