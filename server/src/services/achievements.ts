// Conquistas: regras fixas calculadas com dados que já existem (frota, PM, tiers, meta).
// Ao cumprir uma regra, a conquista é gravada com a data e passa a ser permanente.
import { db } from '../db.js';
import { evaluate, getOwnedIds, getTree, type Tree } from './techtree.js';
import type { User } from './users.js';

type Rarity = 'common' | 'rare' | 'legendary';
type Ctx = {
  state: ReturnType<typeof evaluate>;
  tiers: { tier: number; cost: number }[];
  maxBalance: number;
  goalOwned: boolean;
  ageDays: number;
};
type Progress = { current: number; target: number; hint?: string };
type Def = { key: string; name: string; desc: string; rarity: Rarity; icon: string; progress: (c: Ctx) => Progress };

const owned = (c: Ctx) => c.state.filter((a) => a.owned);
const bought = (c: Ctx) => owned(c).filter((a) => a.cost > 0); // fora o Tier I (de graça para todos)
const ratio = (list: { owned: boolean }[]): Progress => ({ current: list.filter((a) => a.owned).length, target: list.length });
const atLeast = (n: number, t: number): Progress => ({ current: Math.min(n, t), target: t });

export const ACHIEVEMENTS: Def[] = [
  { key: 'first_flight', name: 'Primeiro Voo', rarity: 'common', icon: 'wing', desc: 'Faça a sua primeira compra na tech tree.',
    progress: (c) => atLeast(bought(c).length, 1) },
  { key: 'full_hangar5', name: 'Hangar Cheio', rarity: 'common', icon: 'hangar', desc: 'Tenha 5 aeronaves além das do Tier I.',
    progress: (c) => atLeast(bought(c).length, 5) },
  { key: 'saver', name: 'Poupador', rarity: 'common', icon: 'coin', desc: 'Chegue a 3.000 PM de saldo ao mesmo tempo.',
    progress: (c) => atLeast(c.maxBalance, 3000) },
  { key: 'goal_done', name: 'Meta Definida', rarity: 'common', icon: 'target', desc: 'Marque uma aeronave como meta e conquiste-a.',
    progress: (c) => atLeast(c.goalOwned ? 1 : 0, 1) },
  { key: 'tier2_complete', name: 'Tier II Completo', rarity: 'rare', icon: 'tier', desc: 'Tenha todas as aeronaves do Tier II.',
    progress: (c) => ratio(c.state.filter((a) => a.tier === 2)) },
  { key: 'heli_ace', name: 'Ás dos Helicópteros', rarity: 'rare', icon: 'heli', desc: 'Tenha todos os helicópteros de ataque (Attack Chopper).',
    progress: (c) => ratio(c.state.filter((a) => a.role === 'aheli')) },
  { key: 'hunter', name: 'Caçador', rarity: 'rare', icon: 'fighter', desc: 'Tenha todos os caças (Fighter).',
    progress: (c) => ratio(c.state.filter((a) => a.role === 'fighter')) },
  { key: 'perfect_pair', name: 'Par Perfeito', rarity: 'rare', icon: 'link', desc: 'Tenha uma aeronave Bound junto com a aeronave "mãe" dela.',
    progress: (c) => atLeast(owned(c).some((a) => a.bound.length > 0 && a.bound.every((b) => c.state.find((x) => x.id === b)?.owned)) ? 1 : 0, 1) },
  { key: 'fleet15', name: 'Frota de 15', rarity: 'rare', icon: 'fleet', desc: 'Tenha 15 aeronaves no total.',
    progress: (c) => atLeast(owned(c).length, 15) },
  { key: 'elite_t4', name: 'Elite Tier IV', rarity: 'legendary', icon: 'star', desc: 'Desbloqueie qualquer aeronave do Tier IV.',
    progress: (c) => atLeast(owned(c).some((a) => a.tier === 4) ? 1 : 0, 1) },
  { key: 'full_tier', name: 'Hangar Completo', rarity: 'legendary', icon: 'crown', desc: 'Tenha todas as aeronaves de um tier inteiro, do Tier III em diante.',
    progress: (c) => {
      const per = c.tiers.filter((t) => t.tier >= 3).map((t) => ratio(c.state.filter((a) => a.tier === t.tier)))
        .filter((p) => p.target > 0);
      return per.sort((a, b) => b.current / b.target - a.current / a.target || b.target - a.target)[0] ?? { current: 0, target: 1 };
    } },
  { key: 'veteran', name: 'Veterano MNG', rarity: 'legendary', icon: 'shield', desc: 'Mais de 90 dias no esquadrão e pelo menos 25 aeronaves.',
    progress: (c) => {
      const days = Math.min(Math.floor(c.ageDays), 90), fleet = Math.min(owned(c).length, 25);
      return { current: days + fleet, target: 115, hint: `${days}/90 dias · ${fleet}/25 aeronaves` };
    } },
];

export type MedalLite = { key: string; name: string; icon: string; rarity: Rarity };
const lite = (d: Def): MedalLite => ({ key: d.key, name: d.name, icon: d.icon, rarity: d.rarity });
const RANK: Record<Rarity, number> = { common: 0, rare: 1, legendary: 2 };

/** As medalhas "de vitrine" de cada piloto: as mais raras, e entre iguais as mais recentes. */
export async function topMedals(userIds: string[], n = 3) {
  const out = new Map<string, MedalLite[]>(userIds.map((id) => [id, []]));
  if (!userIds.length) return out;
  const { rows } = await db.query<{ user_id: string; key: string; earned_at: Date }>(
    'select user_id, key, earned_at from user_achievements where user_id = any($1) order by earned_at desc', [userIds]);
  for (const r of rows) {
    const d = ACHIEVEMENTS.find((x) => x.key === r.key);
    if (d) out.get(r.user_id)!.push(lite(d));
  }
  for (const [id, list] of out) out.set(id, list.sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).slice(0, n));
  return out;
}

export async function achievementCount(userIds: string[]) {
  const { rows } = await db.query<{ user_id: string; n: number }>(
    'select user_id, count(*)::float8 as n from user_achievements where user_id = any($1) group by user_id', [userIds]);
  return new Map(rows.map((r) => [r.user_id, r.n]));
}

async function buildCtx(user: User, catalog?: Tree): Promise<Ctx> {
  const [tree, ownedIds, run, goal] = await Promise.all([
    catalog ?? getTree({ onlyActive: true }),
    getOwnedIds(user.id),
    db.query<{ m: number }>(
      `select coalesce(max(run), 0)::float8 as m from (
         select sum(amount) over (order by created_at, id) as run from points_ledger where user_id = $1) t`, [user.id]),
    db.query<{ goal_aircraft_id: string | null }>('select goal_aircraft_id from users where id = $1', [user.id]),
  ]);
  const state = evaluate(tree, ownedIds, 0);
  const g = goal.rows[0]?.goal_aircraft_id;
  return {
    state,
    tiers: tree.tiers,
    maxBalance: run.rows[0]?.m ?? 0,
    goalOwned: !!g && ownedIds.has(g),
    ageDays: (Date.now() - new Date(user.created_at).getTime()) / 86_400_000,
  };
}

/** Confere todas as regras e grava as que acabaram de ser cumpridas. Também apaga as recém-ganhas que deixaram de valer (compra desfeita). */
export async function syncAchievements(user: User, catalog?: Tree) {
  const ctx = await buildCtx(user, catalog);
  const met = new Map(ACHIEVEMENTS.map((d) => { const p = d.progress(ctx); return [d.key, p.target > 0 && p.current >= p.target]; }));
  const { rows } = await db.query<{ key: string; earned_at: Date }>('select key, earned_at from user_achievements where user_id = $1', [user.id]);
  const have = new Set(rows.map((r) => r.key));
  for (const r of rows) {
    if (!met.get(r.key) && Date.now() - new Date(r.earned_at).getTime() < 2 * 60_000) {
      await db.query('delete from user_achievements where user_id = $1 and key = $2', [user.id, r.key]);
      have.delete(r.key);
    }
  }
  const fresh: MedalLite[] = [];
  for (const [key, ok] of met) {
    if (ok && !have.has(key)) {
      await db.query('insert into user_achievements (user_id, key) values ($1, $2) on conflict do nothing', [user.id, key]);
      fresh.push(lite(ACHIEVEMENTS.find((d) => d.key === key)!));
    }
  }
  return { ctx, fresh };
}

export async function getAchievements(user: User) {
  const { ctx } = await syncAchievements(user);
  const { rows } = await db.query<{ key: string; earned_at: Date }>('select key, earned_at from user_achievements where user_id = $1', [user.id]);
  const at = new Map(rows.map((r) => [r.key, r.earned_at]));
  const items = ACHIEVEMENTS.map((d) => ({
    key: d.key, name: d.name, desc: d.desc, rarity: d.rarity, icon: d.icon,
    earnedAt: at.get(d.key) ?? null, ...d.progress(ctx),
  }));
  return { earned: items.filter((i) => i.earnedAt).length, total: items.length, items };
}
