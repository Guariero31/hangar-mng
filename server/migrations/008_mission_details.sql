alter table missions add column map_name text not null default '' check (length(map_name) <= 80);
alter table missions add column briefing_image_url text not null default '' check (length(briefing_image_url) <= 2000);
