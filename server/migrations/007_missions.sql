-- Missões (eventos agendados pelos admins)
create table missions (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 80),
  briefing    text not null default '' check (length(briefing) <= 2000),
  starts_at   timestamptz not null,
  default_pm  int check (default_pm is null or (default_pm >= 0 and default_pm <= 1000000)),
  status      text not null default 'scheduled' check (status in ('scheduled', 'closed', 'cancelled')),
  series_id   uuid,
  created_by  uuid references users(id) on delete set null,
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index missions_starts_idx on missions (starts_at desc);

create table mission_signups (
  mission_id  uuid not null references missions(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  aircraft_id text not null references aircraft(id),
  attended    boolean not null default false,
  pm_awarded  int not null default 0,
  created_at  timestamptz not null default now(),
  primary key (mission_id, user_id)
);
