-- Meta do piloto, controle de novidades e vínculo do lançamento com a aeronave (para desfazer compras)
alter table users add column goal_aircraft_id text references aircraft(id) on delete set null;
alter table users add column news_seen_at timestamptz not null default now();
alter table points_ledger add column aircraft_id text references aircraft(id);
