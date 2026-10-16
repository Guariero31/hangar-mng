// Dados iniciais: a tech tree completa (se o catálogo estiver vazio) e, em desenvolvimento,
// alguns pilotos de exemplo para o painel admin não começar vazio.
import { db } from './db.js';
import { config } from './config.js';

const TIERS: [tier: number, label: string, cost: number, multiplier: number][] = [
  [1, 'I', 0, 1.33],
  [2, 'II', 500, 1.25],
  [3, 'III', 1500, 1.14],
  [4, 'IV', 3000, 1.05],
  [5, 'V', 4000, 1.0],
];

const BANDS: [name: string, rowStart: number, rowEnd: number][] = [
  ['Leste: Su e MiG', 0, 2],
  ['Ocidente: caças', 3, 6],
  ['Ataque e apoio', 8, 12],
  ['Asas rotativas', 14, 16],
];

// id, nome, tier, linha, famílias (requisito: uma das mães), restrição de armamento
const AIRCRAFT: [string, string, number, number, string[], string?][] = [
  ['mig21', 'MiG-21bis', 1, 0, []], ['su25a', 'Su-25A', 2, 1, ['mig21']], ['mig29a', 'MiG-29A', 3, 0, ['su25a']], ['su25t', 'Su-25T', 3, 1, ['su25a']],
  ['mig29s', 'MiG-29S', 4, 0, ['mig29a', 'su25t']], ['su27', 'Su-27', 4, 1, ['mig29a', 'su25t']], ['jf17', 'JF-17', 5, 0, ['mig29s', 'su27']], ['j11', 'J-11', 5, 1, ['mig29s', 'su27']], ['su33', 'Su-33', 5, 2, ['mig29s', 'su27']],
  ['f15a', 'F-15A', 3, 3, ['f4e', 'f100'], 'Máx. 4 AIM-7 + 4 AIM-9'], ['f15c', 'F-15C', 4, 3, ['f15a']], ['f15e', 'F-15E', 5, 3, ['f15c']],
  ['f5e', 'F-5E', 1, 4, []], ['f4e', 'F-4E', 2, 4, ['f5e']], ['f14a', 'F-14A', 3, 4, ['f4e']], ['f14b', 'F-14B', 4, 4, ['f14a']], ['f14bu', 'F-14B(U)', 5, 4, ['f14b']],
  ['f100', 'F-100D', 2, 5, ['f5e']], ['f16a', 'F-16A', 3, 5, ['f4e', 'f100'], 'Máx. 4 AIM-9'], ['f16adf', 'F-16ADF', 4, 5, ['f16a'], 'Máx. 2 AIM-120B + 4 AIM-9'], ['f16c', 'F-16C Blk 50', 5, 5, ['f16adf']],
  ['f18a', 'F-18A', 4, 6, ['f16a'], 'Máx. 4 AIM-7 + 2 AIM-9'], ['f18c', 'F/A-18C', 5, 6, ['f18a']],
  ['a10a', 'A-10A', 1, 8, []], ['a10c', 'A-10C', 2, 8, ['a10a']], ['av8b', 'AV-8B', 3, 8, ['a10c']],
  ['ajs37', 'AJS-37', 1, 10, []], ['mirf1', 'Mirage F1', 2, 10, ['ajs37']], ['m2000', 'Mirage 2000C', 3, 10, ['mirf1', 'mb339', 'c101']], ['mb339', 'MB-339', 2, 11, ['ajs37']], ['c101', 'C-101', 2, 12, ['ajs37']],
  ['mi8', 'Mi-8', 1, 14, []], ['mi24p', 'Mi-24P', 2, 14, ['mi8']], ['ka50', 'Ka-50', 3, 14, ['mi24p']], ['ka50iii', 'Ka-50 III', 4, 14, ['ka50']],
  ['uh1h', 'UH-1H', 1, 15, []], ['gazelle', 'Gazelle', 2, 15, ['uh1h']], ['kiowa', 'Kiowa', 3, 15, ['gazelle']], ['ah64d', 'AH-64D', 4, 15, ['kiowa']],
  ['ch47d', 'CH-47D', 2, 16, ['uh1h']], ['c130j', 'C-130J', 3, 16, ['ch47d']],
];

const BOUND: Record<string, string[]> = {
  su25t: ['su25a'], mig29s: ['mig29a'], j11: ['su27'], su33: ['su27'], f15c: ['f15a'], f15e: ['f15c'], f14b: ['f14a'],
  f14bu: ['f14b'], f16adf: ['f16a'], f16c: ['f16adf'], f18c: ['f18a'], a10c: ['a10a'],
};

const ROLES: Record<string, string[]> = {
  multi: ['ajs37', 'jf17', 'f4e', 'f16c', 'f14bu', 'f18c', 'm2000'],
  attack: ['su25a', 'su25t', 'f15e', 'f14b', 'a10a', 'a10c', 'av8b', 'mb339', 'c101'],
  aheli: ['mi24p', 'ka50', 'ka50iii', 'gazelle', 'kiowa', 'ah64d'],
  theli: ['mi8', 'uh1h', 'ch47d'],
  tplane: ['c130j'],
};

const ICON: Record<string, string> = {
  mig21: 'mig21', su25a: 'su25', su25t: 'su25', mig29a: 'mig29', mig29s: 'mig29_b', su27: 'su27', j11: 'su27', su33: 'su34', jf17: 'jf17',
  f15a: 'f15', f15c: 'f15', f15e: 'f15e', f5e: 'f5', f4e: 'f4_phantom', f14a: 'f14', f14b: 'f14', f14bu: 'f14', f100: 'jato_enflechado',
  f16a: 'f16_b', f16adf: 'f16_b', f16c: 'f16', f18a: 'fa18_hornet', f18c: 'fa18e_super_hornet', a10a: 'a10', a10c: 'a10', av8b: 'harrier',
  ajs37: 'draken', mirf1: 'mirage_f1', m2000: 'mirage2000', mb339: 'l39', c101: 'c101',
  mi8: 'heli_azul', mi24p: 'mi24', ka50: 'ka50', ka50iii: 'ka50', uh1h: 'uh1', gazelle: 'esquilo', kiowa: 'heli_leve', ah64d: 'apache', ch47d: 'chinook', c130j: 'c130',
};

const roleOf = (id: string) => Object.keys(ROLES).find((r) => ROLES[r].includes(id)) ?? 'fighter';

// Pilotos de exemplo (só em desenvolvimento): nickname, lançamentos de PM, aeronaves compradas
const DEMO_PILOTS: [nick: string, points: [number, string][], aircraft: string[], banned?: boolean][] = [
  ['Viper_01', [[2500, 'Op. Red Flag — noite 1'], [3200, 'Campanha Syria — missão 3']], ['f4e', 'f16a', 'f15a']],
  ['Ghost', [[2400, 'Op. Red Flag — noite 1']], ['su25a', 'mig29a']],
  ['Rookie', [[650, 'Treinamento de pouso']], []],
  ['Maverick', [[4000, 'Op. Red Flag — noite 1']], ['f4e'], true],
];

export async function seed() {
  return db.tx(async query => {
    if (db.kind === 'postgres') await query.query('select pg_advisory_xact_lock(721406, 2)');
    const { rows: [{ n }] } = await query.query<{ n: number }>('select count(*)::int as n from tiers');
    if (n === 0) {
      {
        const q = query;
        for (const [tier, label, cost, mult] of TIERS) {
          await q.query('insert into tiers (tier, label, cost, multiplier) values ($1, $2, $3, $4)', [tier, label, cost, mult]);
        }
        for (const [name, r0, r1] of BANDS) {
          await q.query('insert into tree_bands (name, row_start, row_end) values ($1, $2, $3)', [name, r0, r1]);
        }
        for (const [id, name, tier, row, , restriction] of AIRCRAFT) {
          await q.query(
            'insert into aircraft (id, name, tier, role, row, icon, restriction) values ($1, $2, $3, $4, $5, $6, $7)',
            [id, name, tier, roleOf(id), row, ICON[id] ?? null, restriction ?? null]);
        }
        for (const [id, , , , parents] of AIRCRAFT) {
          for (const p of parents) await q.query('insert into aircraft_family (aircraft_id, parent_id) values ($1, $2)', [id, p]);
        }
        for (const [id, reqs] of Object.entries(BOUND)) {
          for (const r of reqs) await q.query('insert into aircraft_bound (aircraft_id, requires_id) values ($1, $2)', [id, r]);
        }
        await q.query(`insert into settings (key, value) values ('base_mission_points', '500') on conflict do nothing`);
      }
      console.log(`  tech tree criada: ${AIRCRAFT.length} aeronaves em ${TIERS.length} tiers`);
    }

    if (!config.seedDemo) return;
    const { rows: [{ u }] } = await query.query<{ u: number }>('select count(*)::int as u from users');
    if (u > 0) return;

    {
      const q = query;
      for (const [nick, points, aircraft, banned] of DEMO_PILOTS) {
        const email = `${nick.toLowerCase()}@exemplo.com`;
        const { rows: [user] } = await q.query<{ id: string }>(
          `insert into users (google_sub, email, name, nickname, status) values ($1, $2, $3, $4, $5) returning id`,
          [`demo:${email}`, email, nick, nick, banned ? 'banned' : 'active']);
        for (const [amount, reason] of points) {
          await q.query(`insert into points_ledger (user_id, amount, reason, source) values ($1, $2, $3, 'manual')`,
            [user.id, amount, reason]);
        }
        for (const id of aircraft) {
          const { rows: [ac] } = await q.query<{ cost: number }>(
            'select t.cost from aircraft a join tiers t on t.tier = a.tier where a.id = $1', [id]);
          if (!ac) continue;
          let purchaseLedgerId: string | null = null;
          if (ac.cost > 0) {
            const { rows: [purchase] } = await q.query<{ id: string }>(`insert into points_ledger (user_id, amount, reason, source, aircraft_id) values ($1, $2, $3, 'unlock', $4) returning id::text`,
              [user.id, -ac.cost, `Desbloqueio: ${id}`, id]);
            purchaseLedgerId = purchase.id;
          }
          await q.query(`insert into user_aircraft (user_id, aircraft_id, paid_amount, purchase_ledger_id, acquisition_kind) values ($1, $2, $3, $4, 'purchase')`, [user.id, id, ac.cost, purchaseLedgerId]);
        }
      }
    }
    console.log('  pilotos de exemplo criados');
  });
}
