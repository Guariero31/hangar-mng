-- Upgrade databases that received the first, single-column attachment schema.
-- Copy existing bytes into bounded chunks before accepting new uploads.
alter table mission_asset_files add column if not exists chunks int not null default 0;

create table if not exists mission_asset_chunks (
  asset_id uuid not null,
  path text not null,
  chunk_index int not null,
  content bytea not null,
  primary key (asset_id, path, chunk_index),
  foreign key (asset_id, path) references mission_asset_files(asset_id, path) on delete cascade
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mission_asset_files' and column_name = 'content'
  ) then
    insert into mission_asset_chunks(asset_id, path, chunk_index, content)
      select file.asset_id, file.path, part.chunk_index,
        substring(file.content from part.chunk_index * 262144 + 1 for 262144)
      from mission_asset_files file
      cross join lateral generate_series(0, ceil(octet_length(file.content)::numeric / 262144)::int - 1) as part(chunk_index)
      where file.content is not null
      on conflict (asset_id, path, chunk_index) do nothing;
    update mission_asset_files set chunks = ceil(octet_length(content)::numeric / 262144)::int where content is not null;
    alter table mission_asset_files alter column content drop not null;
  end if;
end $$;
