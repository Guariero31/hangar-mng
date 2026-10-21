-- Condecorações que podem ser concedidas em cada missão.
create table mission_ribbons (
  mission_id uuid not null references missions(id) on delete cascade,
  ribbon_id  uuid not null references ribbons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mission_id, ribbon_id)
);
create index mission_ribbons_ribbon_idx on mission_ribbons (ribbon_id);
