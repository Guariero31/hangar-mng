-- Condecorações concedidas aos pilotos em cada missão (somente honra, sem PM).
create table ribbon_awards (
  mission_id uuid not null references missions(id) on delete cascade,
  ribbon_id  uuid not null references ribbons(id) on delete restrict,
  user_id    uuid not null references users(id) on delete cascade,
  valor      boolean not null default false,
  awarded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (mission_id, ribbon_id, user_id)
);
create index ribbon_awards_user_idx on ribbon_awards (user_id, ribbon_id);
