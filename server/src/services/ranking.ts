// Ranking do esquadrão: posição por PM ganhos, frota e medalhas. Não expõe saldo, e-mail nem histórico.
import { db } from '../db.js';
import { achievementCount, topMedals } from './achievements.js';
import type { User } from './users.js';

export type RankingPeriod = 'all' | 'month';

interface RankedPilot {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: Date;
  earned: number;
  pos: number;
  fleet: number;
  ordinal: number;
  tied: number;
  total: number;
  inPage: boolean;
  inPodium: boolean;
  isNext: boolean;
}

/** Keep the podium and the caller's position independent of the requested page. */
export async function getRanking(me: User, limit = 50, offset = 0, period: RankingPeriod = 'all', now = new Date()) {
  const { rows } = await db.query<RankedPilot>(
    `with bounds as (
       select date_trunc('month', $3::timestamptz at time zone 'America/Cuiaba') as local_start
     ), base as (
       select u.id, u.nickname, u.avatar_url as "avatarUrl", u.created_at as "createdAt",
              coalesce(sum(l.amount), 0)::float8 as earned
         from users u
         cross join bounds
         left join points_ledger l on l.user_id = u.id and l.amount > 0 and l.source in ('manual', 'server')
          and ($4::text = 'all' or (
            l.created_at >= (bounds.local_start at time zone 'America/Cuiaba')
            and l.created_at < ((bounds.local_start + interval '1 month') at time zone 'America/Cuiaba')))
        where u.status = 'active' and u.nickname is not null
        group by u.id
     ), ranked as (
       select base.*, rank() over (order by earned desc)::float8 as pos,
              row_number() over (order by earned desc, nickname, id)::float8 as ordinal,
              count(*) over (partition by earned)::float8 as tied,
              count(*) over ()::float8 as total from base
     ), nearest as (
       select id from ranked where earned > (select earned from ranked where id = $5)
        order by earned, nickname, id limit 1
     )
     select ranked.*, ordinal > $2 and ordinal <= $2 + $1 as "inPage",
            ordinal <= 3 as "inPodium", id in (select id from nearest) as "isNext",
            ((select count(*) from user_aircraft ua where ua.user_id = ranked.id)
             + (select count(*) from aircraft a join tiers t on t.tier = a.tier
                 where t.cost = 0 and a.active and not exists (
                   select 1 from user_aircraft owned where owned.user_id = ranked.id and owned.aircraft_id = a.id)))::float8 as fleet
       from ranked
      where (ordinal > $2 and ordinal <= $2 + $1) or ordinal <= 3 or id = $5 or id in (select id from nearest)
      order by ordinal`, [limit, offset, now.toISOString(), period, me.id]);
  const ids = rows.map(pilot => pilot.id);
  const [medals, counts, aircraft] = await Promise.all([
    topMedals(ids), achievementCount(ids),
    db.query<{ n: number }>('select count(*)::float8 as n from aircraft where active'),
  ]);
  const present = (pilot: RankedPilot) => ({
    id: pilot.id, nickname: pilot.nickname, avatarUrl: pilot.avatarUrl, createdAt: pilot.createdAt,
    earned: pilot.earned, pos: pilot.pos, fleet: pilot.fleet, tied: pilot.tied,
    medals: medals.get(pilot.id) ?? [], medalCount: counts.get(pilot.id) ?? 0,
  });
  const mine = rows.find(pilot => pilot.id === me.id);
  const next = rows.find(pilot => pilot.isNext);
  return {
    meId: me.id,
    period,
    periodLabel: period === 'month'
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', month: 'long', year: 'numeric' }).format(now)
      : 'Todo o histórico',
    total: rows[0]?.total ?? 0,
    aircraftTotal: aircraft.rows[0].n,
    podium: rows.filter(pilot => pilot.inPodium).map(present),
    personal: mine ? {
      pilot: present(mine),
      next: next ? { nickname: next.nickname, earned: next.earned, pos: next.pos } : null,
      gap: next ? next.earned - mine.earned : 0,
      progress: next ? Math.min(100, mine.earned / next.earned * 100) : 100,
      pageOffset: Math.floor((mine.ordinal - 1) / limit) * limit,
    } : null,
    items: rows.filter(pilot => pilot.inPage).map(present),
  };
}
