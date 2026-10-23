alter table missions add column slug text;
with names as (
  select id, coalesce(nullif(trim(both '-' from regexp_replace(lower(translate(title,
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g')), ''), 'missao') as base,
    row_number() over (order by created_at, id) as number
  from missions
)
update missions m set slug=names.base || '-' || names.number from names where m.id=names.id;
create unique index missions_slug_unique on missions(slug);
