// Regras da tech tree:
//  - Custo e bônus de PM são definidos por tier. Tiers com custo 0 ficam na frota de todos.
//  - Regra 1: para comprar uma aeronave do tier N é preciso ter ao menos uma aeronave do tier N-1.
//  - Regra 2 (Bound): é preciso ter também todas as aeronaves ligadas a ela por "bound".
//  - As linhas de família são só visuais.
import { db, type Queryable } from '../db.js';
import { fail } from '../errors.js';
import { getBalance } from './users.js';

export type Role = 'fighter' | 'multi' | 'attack' | 'aheli' | 'theli' | 'tplane';

export interface Tier { tier: number; label: string; cost: number; multiplier: number }
export interface Band { id: number; name: string; rowStart: number; rowEnd: number }
export interface Aircraft {
  id: string;
  name: string;
  tier: number;
  role: Role;
  row: number;
  icon: string | null;
  restriction: string | null;
  description: string | null;
  active: boolean;
  bound: string[];
  parents: string[];
}
export interface Tree { tiers: Tier[]; bands: Band[]; aircraft: Aircraft[]; baseMissionPoints: number }

export async function getTree(opts: { onlyActive?: boolean } = {}, q: Queryable = db): Promise<Tree> {
  const [tiers, bands, aircraft, settings] = await Promise.all([
    q.query<Tier>('select tier, label, cost, multiplier::float8 as multiplier from tiers order by tier'),
    q.query<Band>('select id, name, row_start as "rowStart", row_end as "rowEnd" from tree_bands order by row_start'),
    q.query<Aircraft>(
      `select a.id, a.name, a.tier, a.role, a.row, a.icon, a.restriction, a.description, a.active,
              coalesce((select array_agg(b.requires_id order by b.requires_id) from aircraft_bound b where b.aircraft_id = a.id), '{}') as bound,
              coalesce((select array_agg(f.parent_id order by f.parent_id) from aircraft_family f where f.aircraft_id = a.id), '{}') as parents
         from aircraft a
        ${opts.onlyActive ? 'where a.active' : ''}
        order by a.tier, a.row, a.name`),
    q.query<{ value: number }>(`select value from settings where key = 'base_mission_points'`),
  ]);
  return {
    tiers: tiers.rows,
    bands: bands.rows,
    aircraft: aircraft.rows,
    baseMissionPoints: Number(settings.rows[0]?.value ?? 500),
  };
}

/** Aeronaves que o jogador tem: compradas/liberadas + todas as de tiers gratuitos */
export async function getOwnedIds(userId: string, q: Queryable = db): Promise<Set<string>> {
  const { rows } = await q.query<{ id: string }>(
    `select aircraft_id as id from user_aircraft where user_id = $1
     union
     select a.id from aircraft a join tiers t on t.tier = a.tier where t.cost = 0 and a.active`, [userId]);
  return new Set(rows.map((r) => r.id));
}

type LockReason = 'previous_tier' | 'bound' | null;

/** Calcula o estado de cada aeronave para um jogador */
export function evaluate(tree: Tree, owned: Set<string>, balance: number) {
  const tierOf = new Map(tree.tiers.map((t) => [t.tier, t]));
  return tree.aircraft.map((a) => {
    const cost = tierOf.get(a.tier)?.cost ?? 0;
    const isOwned = owned.has(a.id);
    const hasPrevTier = tierOf.has(a.tier - 1);
    const prevTierOk = !hasPrevTier || tree.aircraft.some((x) => x.tier === a.tier - 1 && owned.has(x.id));
    const missingBound = a.bound.filter((b) => !owned.has(b));
    const available = !isOwned && prevTierOk && missingBound.length === 0;
    const lockReason: LockReason = isOwned || available ? null : !prevTierOk ? 'previous_tier' : 'bound';
    return {
      ...a,
      cost,
      owned: isOwned,
      available,
      affordable: available && balance >= cost,
      lockReason,
      missingBound,
    };
  });
}

export async function getTechTreeState(userId: string) {
  const [tree, owned, balance] = await Promise.all([getTree({ onlyActive: true }), getOwnedIds(userId), getBalance(userId)]);
  return {
    balance,
    tiers: tree.tiers,
    bands: tree.bands,
    baseMissionPoints: tree.baseMissionPoints,
    aircraft: evaluate(tree, owned, balance),
  };
}

/** Compra uma aeronave: tudo validado e gravado numa transação só */
export async function unlockAircraft(userId: string, aircraftId: string): Promise<number> {
  return db.tx(async (q) => {
    // trava a linha do jogador: dois cliques simultâneos não gastam duas vezes
    const { rows: [player] } = await q.query<{ status: string }>('select status from users where id = $1 for update', [userId]);
    if (!player || player.status !== 'active') throw fail('BANNED');

    const tree = await getTree({ onlyActive: true }, q);
    const [owned, balance] = await Promise.all([getOwnedIds(userId, q), getBalance(userId, q)]);
    const target = evaluate(tree, owned, balance).find((a) => a.id === aircraftId);

    if (!target) throw fail('AIRCRAFT_NOT_FOUND');
    if (target.owned) throw fail('ALREADY_UNLOCKED');
    if (target.lockReason === 'previous_tier') {
      const prev = tree.tiers.find((t) => t.tier === target.tier - 1);
      throw fail('PREV_TIER_MISSING', `Compre antes uma aeronave do tier ${prev?.label ?? target.tier - 1}.`);
    }
    if (target.lockReason === 'bound') {
      const names = target.missingBound.map((id) => tree.aircraft.find((a) => a.id === id)?.name ?? id);
      throw fail('BOUND_MISSING', `Bound: compre antes ${names.join(' e ')}.`);
    }
    if (balance < target.cost) throw fail('INSUFFICIENT_POINTS', `Faltam ${target.cost - balance} PM.`);

    if (target.cost > 0) {
      await q.query(
        `insert into points_ledger (user_id, amount, reason, source, created_by, aircraft_id) values ($1, $2, $3, 'unlock', $1, $4)`,
        [userId, -target.cost, `Desbloqueio: ${target.name}`, aircraftId]);
    }
    await q.query('insert into user_aircraft (user_id, aircraft_id) values ($1, $2)', [userId, aircraftId]);
    return balance - target.cost;
  });
}

/** Janela para desfazer uma compra */
export const UNDO_SECONDS = 15;

/** Desfaz a última compra do jogador, se feita há poucos segundos: devolve os PM e tira a aeronave da frota */
export async function undoUnlock(userId: string, aircraftId: string): Promise<number> {
  return db.tx(async (q) => {
    await q.query('select 1 from users where id = $1 for update', [userId]);
    const { rows: [last] } = await q.query<{ aircraft_id: string; age: number; granted_by: string | null }>(
      `select aircraft_id, extract(epoch from now() - unlocked_at)::float8 as age, granted_by
         from user_aircraft where user_id = $1 order by unlocked_at desc limit 1`, [userId]);
    if (!last || last.aircraft_id !== aircraftId || last.granted_by) throw fail('UNDO_UNAVAILABLE');
    if (last.age > UNDO_SECONDS) throw fail('UNDO_EXPIRED');

    const { rows: [paid] } = await q.query<{ amount: number; name: string }>(
      `select -l.amount as amount, a.name from points_ledger l join aircraft a on a.id = l.aircraft_id
        where l.user_id = $1 and l.aircraft_id = $2 and l.source = 'unlock' order by l.id desc limit 1`, [userId, aircraftId]);
    await q.query('delete from user_aircraft where user_id = $1 and aircraft_id = $2', [userId, aircraftId]);
    if (paid && paid.amount > 0) {
      await q.query(
        `insert into points_ledger (user_id, amount, reason, source, created_by, aircraft_id) values ($1, $2, $3, 'refund', $1, $4)`,
        [userId, paid.amount, `Compra desfeita: ${paid.name}`, aircraftId]);
    }
    return getBalance(userId, q);
  });
}
