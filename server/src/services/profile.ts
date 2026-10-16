// Perfil do piloto: resumo, ranking, progresso por tier e por papel, próximos objetivos,
// linha do tempo e PM ganhos por semana. Tudo calculado a partir do que o banco já guarda.
import { db } from '../db.js';
import { getBalance, type User } from './users.js';
import { topMedals } from './achievements.js';
import { evaluate, getOwnedIds, getTree } from './techtree.js';

const EARNED = `amount > 0 and source in ('manual', 'server')`;

export async function getProfile(user: User) {
  const [tree, owned, balance, totals, rank, timeline, weekly, ownedRows] = await Promise.all([
    getTree({ onlyActive: true }),
    getOwnedIds(user.id),
    getBalance(user.id),
    db.query<{ earned: number; spent: number; refunded: number }>(
      `select coalesce(sum(amount) filter (where ${EARNED}), 0)::float8 as earned,
              (coalesce(-sum(amount) filter (where source = 'unlock'), 0) - coalesce(sum(amount) filter (where source = 'refund'), 0))::float8 as spent,
              coalesce(sum(amount) filter (where source = 'refund'), 0)::float8 as refunded
         from points_ledger where user_id = $1`, [user.id]),
    // posição no ranking por PM ganhos, entre pilotos ativos com nickname
    db.query<{ position: number; total: number }>(
      `with r as (
         select u.id, rank() over (order by coalesce(sum(l.amount) filter (where l.amount > 0 and l.source in ('manual', 'server')), 0) desc) as pos
           from users u left join points_ledger l on l.user_id = u.id
          where u.status = 'active' and u.nickname is not null
          group by u.id)
       select (select pos from r where id = $1)::float8 as position, (select count(*) from r)::float8 as total`, [user.id]),
    // histórico de PM + aeronaves liberadas pelo admin (as compras já aparecem no histórico)
    db.query(
      `select * from (
         select 'points' as kind, l.id::text as id, l.amount, l.reason, l.source, l.created_at as "createdAt", null as "aircraftId"
           from points_ledger l where l.user_id = $1
         union all
         select 'grant' as kind, ua.aircraft_id as id, 0 as amount, 'Liberada pelo admin: ' || a.name as reason, 'grant' as source,
                ua.unlocked_at as "createdAt", ua.aircraft_id as "aircraftId"
           from user_aircraft ua join aircraft a on a.id = ua.aircraft_id
          where ua.user_id = $1 and ua.granted_by is not null
       ) t order by "createdAt" desc limit 100`, [user.id]),
    // PM ganhos por semana nas últimas 12 semanas
    db.query<{ week: string; earned: number }>(
      `select to_char(w.week, 'YYYY-MM-DD') as week, coalesce(sum(l.amount), 0)::float8 as earned
         from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as w(week)
         left join points_ledger l
           on l.user_id = $1 and l.amount > 0 and l.source in ('manual', 'server')
          and date_trunc('week', l.created_at) = w.week
        group by w.week order by w.week`, [user.id]),
    db.query<{ aircraft_id: string; unlocked_at: Date }>('select aircraft_id, unlocked_at from user_aircraft where user_id = $1', [user.id]),
  ]);

  const state = evaluate(tree, owned, balance);

  const byTier = tree.tiers.map((t) => {
    const list = state.filter((a) => a.tier === t.tier);
    return { tier: t.tier, label: t.label, cost: t.cost, multiplier: t.multiplier, owned: list.filter((a) => a.owned).length, total: list.length };
  });

  const roles = ['fighter', 'multi', 'attack', 'aheli', 'theli', 'tplane'] as const;
  const byRole = roles.map((role) => {
    const list = state.filter((a) => a.role === role);
    return { role, owned: list.filter((a) => a.owned).length, total: list.length };
  }).filter((r) => r.total > 0);

  const tierLabel = new Map(tree.tiers.map((t) => [t.tier, t.label]));
  const nextGoals = state
    .filter((a) => a.available)
    .sort((a, b) => a.cost - b.cost || a.tier - b.tier)
    .slice(0, 6)
    .map((a) => ({ id: a.id, name: a.name, role: a.role, icon: a.icon, tierLabel: tierLabel.get(a.tier), cost: a.cost, missing: Math.max(0, a.cost - balance) }));

  const unlockedAt = new Map(ownedRows.rows.map((r) => [r.aircraft_id, r.unlocked_at]));
  const fleet = state
    .filter((a) => a.owned)
    .map((a) => ({ id: a.id, name: a.name, role: a.role, icon: a.icon, tier: a.tier, tierLabel: tierLabel.get(a.tier), unlockedAt: unlockedAt.get(a.id) ?? null }));

  const bestMultiplier = fleet.reduce((m, a) => Math.max(m, tree.tiers.find((t) => t.tier === a.tier)?.multiplier ?? 1), 1);

  return {
    user: { medals: (await topMedals([user.id])).get(user.id) ?? [], nickname: user.nickname, email: user.email, avatarUrl: user.avatar_url, role: user.role, createdAt: user.created_at },
    rank: rank.rows[0],
    totals: { balance, ...totals.rows[0], fleet: fleet.length, aircraftTotal: state.length },
    estimate: { baseMissionPoints: tree.baseMissionPoints, bestMultiplier, perMission: Math.round(tree.baseMissionPoints * bestMultiplier) },
    byTier,
    byRole,
    nextGoals,
    fleet,
    weekly: weekly.rows,
    timeline: timeline.rows,
  };
}
