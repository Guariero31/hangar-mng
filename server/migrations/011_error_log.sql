-- Registro de erros do sistema (servidor, navegador e e-mail). Erros iguais são agrupados por fingerprint.
create table error_log (
  id           bigint generated always as identity primary key,
  fingerprint  text not null unique,
  source       text not null check (source in ('server', 'client', 'mail')),
  message      text not null,
  stack        text,
  route        text,
  method       text,
  status       int,
  user_id      uuid references users(id) on delete set null,
  user_agent   text,
  count        int not null default 1,
  resolved     boolean not null default false,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index error_log_last_seen_idx on error_log (last_seen desc);
