create table mission_reports (
  mission_id uuid primary key references missions(id) on delete cascade,
  state text not null check (state in ('draft','published')),
  version int not null default 1,
  rules jsonb not null,
  pilots jsonb not null,
  summary text not null default '',
  source text not null default '',
  saved_by uuid references users(id) on delete set null,
  saved_at timestamptz not null default now(),
  published_by uuid references users(id) on delete set null,
  published_name text,
  published_at timestamptz
);
