// Ranking do esquadrão: posição por PM ganhos, frota e medalhas. Não expõe saldo, e-mail nem histórico.
import { db } from '../db.js';
import { achievementCount, syncAchievements, topMedals } from './achievements.js';
import type { User } from './users.js';

let lastSync = 0;

export async function getRanking(me: User) {
  const { rows } = await db.query<any>(
    `with base as (
       select u.id, u.nickname, u.avatar_url as "avatarUrl", u.created_at as "createdAt",
              coalesce(sum(l.amount) filter (where l.amount > 0 and l.source in ('manual', 'server')), 0)::int as earned
         from users u left join points_ledger l on l.user_id = u.id
        where u.status = 'active' and u.nickname is not null
        group by u.id)
     select b.*, rank() over (order by b.earned desc)::int as pos,
            ((select count(*) from user_aircraft ua where ua.user_id = b.id)
             + (select count(*) from aircraft a join tiers t on t.tier = a.tier
                 where t.cost = 0 and a.active
                   and not exists (select 1 from user_aircraft x where x.user_id = b.id and x.aircraft_id = a.id)))::int as fleet
       from base b order by b.earned desc, b.nickname limit 200`);
  // garante que as medalhas de quem ainda não abriu o perfil estejam calculadas
  // (no máximo 1 vez por minuto no esquadrão todo; o próprio jogador é sempre atualizado)
  if (Date.now() - lastSync > 60_000) {
    lastSync = Date.now();
    const { rows: users } = await db.query<User>('select * from users where id = any($1)', [rows.map((r) => r.id)]);
    for (const u of users) await syncAchievements(u);
  } else {
    await syncAchievements(me);
  }
  const ids = rows.map((r) => r.id);
  const [medals, counts, total] = await Promise.all([
    topMedals(ids), achievementCount(ids),
    db.query<{ n: number }>('select count(*)::int as n from aircraft where active'),
  ]);
  return {
    meId: me.id,
    aircraftTotal: total.rows[0].n,
    items: rows.map((r) => ({ ...r, medals: medals.get(r.id) ?? [], medalCount: counts.get(r.id) ?? 0 })),
  };
}
