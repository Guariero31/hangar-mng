// Ranking do esquadrão: posição por PM ganhos, frota e medalhas. Não expõe saldo, e-mail nem histórico.
import { db } from '../db.js';
import { achievementCount, topMedals } from './achievements.js';
import type { User } from './users.js';

export async function getRanking(me: User, limit = 50, offset = 0) {
  const { rows } = await db.query<{ id: string; nickname: string; avatarUrl: string | null; createdAt: Date; earned: number; pos: number; fleet: number }>(
    `with base as (
       select u.id, u.nickname, u.avatar_url as "avatarUrl", u.created_at as "createdAt",
              coalesce(sum(l.amount) filter (where l.amount > 0 and l.source in ('manual', 'server')), 0)::float8 as earned
         from users u left join points_ledger l on l.user_id = u.id
        where u.status = 'active' and u.nickname is not null
        group by u.id)
     select b.*, rank() over (order by b.earned desc)::float8 as pos,
            ((select count(*) from user_aircraft ua where ua.user_id = b.id)
             + (select count(*) from aircraft a join tiers t on t.tier = a.tier
                 where t.cost = 0 and a.active
                   and not exists (select 1 from user_aircraft x where x.user_id = b.id and x.aircraft_id = a.id)))::float8 as fleet
       from base b order by b.earned desc, b.nickname, b.id limit $1 offset $2`, [limit, offset]);
  const ids = rows.map((r) => r.id);
  const [medals, counts, total, pilots] = await Promise.all([
    topMedals(ids), achievementCount(ids),
    db.query<{ n: number }>('select count(*)::float8 as n from aircraft where active'),
    db.query<{ n: number }>(`select count(*)::float8 as n from users where status = 'active' and nickname is not null`),
  ]);
  return {
    meId: me.id,
    total: pilots.rows[0].n,
    aircraftTotal: total.rows[0].n,
    items: rows.map((r) => ({ ...r, medals: medals.get(r.id) ?? [], medalCount: counts.get(r.id) ?? 0 })),
  };
}
