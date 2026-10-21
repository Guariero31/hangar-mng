-- Tier da missão: escolhido entre os tiers cadastrados na progressão. Nulo nas missões antigas.
alter table missions add column if not exists tier int references tiers(tier) on delete set null;
