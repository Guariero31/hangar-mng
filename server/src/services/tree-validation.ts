import { fail } from '../errors.js';
import { evaluate, type Tree } from './techtree.js';

/** Validate OR-family and AND-bound requirements by computing reachable aircraft. */
export function validateTree(tree: Tree) {
  const aircraftById = new Map(tree.aircraft.map(aircraft => [aircraft.id, aircraft]));
  for (const aircraft of tree.aircraft) {
    for (const parentId of aircraft.parents) {
      const parent = aircraftById.get(parentId);
      if (!parent || parent.tier !== aircraft.tier - 1) {
        throw fail('VALIDATION', `As mães de ${aircraft.name} devem pertencer ao tier anterior.`);
      }
    }
    if (aircraft.active && aircraft.bound.some(requiredId => !aircraftById.get(requiredId)?.active)) {
      throw fail('VALIDATION', `Os requisitos Bound de ${aircraft.name} devem estar ativos.`);
    }
  }
  const activeTree = { ...tree, aircraft: tree.aircraft.filter(aircraft => aircraft.active) };
  const freeTiers = new Set(tree.tiers.filter(tier => tier.cost === 0).map(tier => tier.tier));
  const reachable = new Set(activeTree.aircraft.filter(aircraft => freeTiers.has(aircraft.tier)).map(aircraft => aircraft.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const aircraft of evaluate(activeTree, reachable, Number.MAX_SAFE_INTEGER)) {
      if (aircraft.available) { reachable.add(aircraft.id); changed = true; }
    }
  }
  const blocked = activeTree.aircraft.filter(aircraft => !reachable.has(aircraft.id));
  if (blocked.length) throw fail('VALIDATION', `Estes requisitos impedem a progressão: ${blocked.map(aircraft => aircraft.name).join(', ')}.`);
}
