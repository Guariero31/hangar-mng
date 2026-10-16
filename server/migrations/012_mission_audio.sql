-- Música do briefing: arquivo de áudio enviado separadamente do HTML.
alter table mission_assets drop constraint if exists mission_assets_kind_check;
alter table mission_assets add constraint mission_assets_kind_check check (kind in ('image', 'briefing', 'audio'));
alter table missions add column if not exists audio_asset_id uuid references mission_assets(id);
