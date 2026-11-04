-- Condecorações concedidas fora de missões (reconhecimentos avulsos). Somente honra, sem PM.
create table ribbon_grants (
  id         uuid primary key default gen_random_uuid(),
  ribbon_id  uuid not null references ribbons(id) on delete restrict,
  user_id    uuid not null references users(id) on delete cascade,
  valor      boolean not null default false,
  reason     text not null default '' check (length(reason) <= 200),
  awarded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ribbon_grants_user_idx on ribbon_grants (user_id, ribbon_id);
