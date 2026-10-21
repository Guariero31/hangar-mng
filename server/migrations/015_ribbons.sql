-- Catálogo de condecorações (ribbons). A imagem é um PNG enviado pelo admin.
create table ribbons (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 2 and 80),
  description   text not null default '' check (length(description) <= 500),
  category      text not null default 'campanha' check (category in ('campanha','combate','servico','honra')),
  precedence    int  not null default 100,
  allows_valor  boolean not null default false,
  active        boolean not null default true,
  image         bytea,
  image_version int not null default 0,
  created_at    timestamptz not null default now()
);
create unique index ribbons_name_idx on ribbons (lower(name));
