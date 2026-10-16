create table mission_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image', 'briefing')),
  name text not null,
  entrypoint text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table mission_asset_files (
  asset_id uuid not null references mission_assets(id) on delete cascade,
  path text not null,
  mime text not null,
  chunks int not null,
  primary key (asset_id, path)
);
create table mission_asset_chunks (
  asset_id uuid not null,
  path text not null,
  chunk_index int not null,
  content bytea not null,
  primary key (asset_id, path, chunk_index),
  foreign key (asset_id, path) references mission_asset_files(asset_id, path) on delete cascade
);
alter table missions add column image_asset_id uuid references mission_assets(id);
alter table missions add column briefing_asset_id uuid references mission_assets(id);
