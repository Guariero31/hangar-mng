-- Aviso "sua meta já pode ser comprada": guarda para qual meta o aviso foi dado, para não repetir.
alter table users add column goal_ready_for text;
alter table users add column goal_ready_at  timestamptz;
