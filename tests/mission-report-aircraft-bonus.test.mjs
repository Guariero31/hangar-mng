import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'aircraft-bonus-isolated-tests-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const reports = await import('../server/src/services/mission-reports.ts');
const missions = await import('../server/src/services/missions.ts');
const scoring = await import('../server/src/services/scoring.ts');
const users = await import('../server/src/services/users.ts');
let admin, pilot, byTier;
before(async () => {
  await migrate(); await seed();
  const make = async (name, role = 'player') => (await db.query('insert into users(google_sub,email,nickname,role) values ($1,$2,$1,$3) returning *', [name, `${name}@example.invalid`, role])).rows[0];
  admin = await make('BonusAdmin', 'admin'); pilot = await make('BonusPilot');
  byTier = {};
  for (const t of [1, 2, 3]) byTier[t] = (await db.query('select id from aircraft where tier=$1 and active limit 1', [t])).rows[0].id;
  // dá a aeronave paga ao piloto para poder se inscrever
  for (const t of [2, 3]) await db.query("insert into user_aircraft(user_id,aircraft_id,paid_amount,acquisition_kind) values ($1,$2,0,'purchase')", [pilot.id, byTier[t]]);
});
after(async () => { await db.close(); });
const payload = (report) => ({ version: report.version, rulesFingerprint: report.rulesFingerprint, summary: '', source: '',
  pilots: report.pilots.map(({ userId, aircraftId, attended, survived, counts, notes, reviewed }) => ({ userId, aircraftId, attended, survived, counts, notes, reviewed })) });
async function run({ missionTier, aircraftTier, survived }) {
  const id = (await db.query("insert into missions(title,starts_at,created_by,tier) values ('Bonus','2030-01-01',$1,$2) returning id", [admin.id, missionTier])).rows[0].id;
  await missions.signUp(pilot, id, byTier[aircraftTier]);
  const body = payload(await reports.getMissionReport(admin, id, true));
  body.pilots[0] = { ...body.pilots[0], attended: true, survived, reviewed: true, counts: { ...body.pilots[0].counts, airborneAircraft: 5 } };
  return { id, saved: await reports.saveMissionReport(admin, id, body) };
}

test('a função de bônus segue a regra: tier igual ou maior = 1,0×, abaixo = tabela, sem tier = 1,0×', () => {
  const t = scoring.DEFAULT_TIER_BONUSES, f = scoring.aircraftMultiplier;
  assert.deepEqual([f(3, 5, t), f(3, 4, t), f(3, 3, t), f(3, 2, t), f(3, 1, t)], [1, 1, 1, 1.14, 1.2]);
  assert.equal(f(5, 1, t), 1.28);   // diferença 4
  assert.equal(f(9, 1, t), 1.28);   // acima da tabela usa o último valor
  assert.equal(f(null, 1, t), 1);
});

test('missão de Tier 3: aeronave Tier 2 recebe 1,14× e soma o bônus de sobrevivência', async () => {
  const p = (await run({ missionTier: 3, aircraftTier: 2, survived: true })).saved.pilots[0];
  assert.equal(p.subtotal, 1000); assert.equal(p.aircraftMultiplier, 1.14); assert.equal(p.aircraftBonus, 140);
  assert.equal(p.survivalBonus, 500); assert.equal(p.total, 1640);
});

test('missão de Tier 3: Tier 1 recebe 1,20× e Tier 3 recebe 1,0×; abatido não recebe o bônus de sobrevivência', async () => {
  assert.equal((await run({ missionTier: 3, aircraftTier: 1, survived: false })).saved.pilots[0].total, 1200);
  assert.equal((await run({ missionTier: 3, aircraftTier: 3, survived: false })).saved.pilots[0].total, 1000);
});

test('aeronave de tier maior que o da missão e missão sem tier não recebem bônus', async () => {
  assert.equal((await run({ missionTier: 2, aircraftTier: 3, survived: true })).saved.pilots[0].total, 1500);
  assert.equal((await run({ missionTier: null, aircraftTier: 1, survived: true })).saved.pilots[0].total, 1500);
});

test('o administrador edita a tabela, o relatório publicado guarda o bônus usado e o padrão restaura', async () => {
  await scoring.saveScoringRules(admin, { ...scoring.DEFAULT_SCORING_RULES, tierBonuses: [1.3, 1.5] });
  const { id, saved } = await run({ missionTier: 3, aircraftTier: 1, survived: false });
  assert.equal(saved.pilots[0].aircraftMultiplier, 1.5); assert.equal(saved.pilots[0].total, 1500);
  const before = await users.getBalance(pilot.id);
  await reports.saveMissionReport(admin, id, payload(saved), true);
  assert.equal(await users.getBalance(pilot.id), before + 1500);
  await scoring.saveScoringRules(admin, scoring.DEFAULT_SCORING_RULES);
  assert.equal((await reports.getMissionReport(pilot, id)).pilots[0].total, 1500);
  await assert.rejects(scoring.saveScoringRules(admin, { ...scoring.DEFAULT_SCORING_RULES, tierBonuses: [0.9] }));
  await assert.rejects(scoring.saveScoringRules(admin, { ...scoring.DEFAULT_SCORING_RULES, tierBonuses: [11.4] }));
});
