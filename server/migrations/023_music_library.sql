-- Existing audio assets form the library; missions already reference them by ID.
create index missions_audio_asset_idx on missions(audio_asset_id) where audio_asset_id is not null;
