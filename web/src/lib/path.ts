// Caminho de compras até uma aeronave: a sequência mais barata que satisfaz
// a Regra 1 (ter uma das aeronaves mãe da linha; sem mãe, qualquer do tier anterior) e a Regra 2 (Bound) de cada passo.
import type { Tier, TreeAircraft } from '../api/types';

export interface PathPlan {
  /** aeronaves a comprar, na ordem */
  steps: TreeAircraft[];
  /** custo total em PM */
  cost: number;
}

export function planPath(aircraft: TreeAircraft[], tiers: Tier[], targetId: string): PathPlan | null {
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const costOf = new Map(tiers.map((t) => [t.tier, t.cost]));
  const tierNums = new Set(tiers.map((t) => t.tier));
  const target = byId.get(targetId);
  if (!target) return null;

  const owned = new Set(aircraft.filter((a) => a.owned).map((a) => a.id));
  const total = (list: TreeAircraft[]) => list.reduce((s, a) => s + (costOf.get(a.tier) ?? 0), 0);

  // retorna as compras necessárias para ter `id`, dado o que já se tem (`have`)
  function plan(id: string, have: Set<string>, depth: number): TreeAircraft[] | null {
    if (have.has(id)) return [];
    const a = byId.get(id);
    if (!a || depth > aircraft.length) return null;
    const got = new Set(have);
    const steps: TreeAircraft[] = [];
    const take = (list: TreeAircraft[]) => { for (const x of list) { if (!got.has(x.id)) { steps.push(x); got.add(x.id); } } };

    for (const b of a.bound) {
      const sub = plan(b, got, depth + 1);
      if (!sub) return null;
      take(sub);
    }

    const prev = a.tier - 1;
    if (tierNums.has(prev)) {
      const mothers = a.parents.map((id) => byId.get(id)).filter((x): x is TreeAircraft => !!x);
      const pool = mothers.length ? mothers : aircraft.filter((x) => x.tier === prev);
      if (!pool.some((x) => got.has(x.id))) {
        let best: TreeAircraft[] | null = null;
        for (const c of pool) {
          const sub = plan(c.id, got, depth + 1);
          if (sub && (!best || total(sub) < total(best) || (total(sub) === total(best) && sub.length < best.length))) best = sub;
        }
        if (!best) return null;
        take(best);
      }
    }

    take([a]);
    return steps;
  }

  const steps = plan(targetId, owned, 0);
  if (!steps) return null;
  return { steps, cost: total(steps) };
}
