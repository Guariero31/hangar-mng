import type { Queryable } from '../db.js';

export const UUID_ADDRESS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function nextMissionSlug(query: Queryable, title: string) {
  let base = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'missao';
  if (UUID_ADDRESS.test(base)) base = `missao-${base}`;
  const { rows } = await query.query<{ slug: string }>("select slug from missions where slug=$1 or slug like $1 || '-%'", [base]);
  const taken = new Set(rows.map(row => row.slug));
  let slug = base;
  for (let suffix = 2; taken.has(slug); suffix++) slug = `${base}-${suffix}`;
  return slug;
}
