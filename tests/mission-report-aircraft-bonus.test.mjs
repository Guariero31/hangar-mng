import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'aircraft-bonus-isolated-tests-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const reports = await import('../server/src/services/mission-reports.ts');
const missions = await import('../server/src/services/missions.ts');
const scoring = await import('../server/src/services/scoring.ts');
const users = await import('../server/src/services/users.ts');
let admin, pilot, free;
before(async () => {
  await migrate(); await seed();
  const make = async (name, role = 'player') => (await db.query('insert into users(google_sub,email,nickname,role) values ($1,$2,$1,$3) returning *', [name, `${name}@example.invalid`, role])).rows[0];
  admin = await make('BonusAdmin', 'admin'); pilot = await make('BonusPilot');
  free = (await db.query('select a.id,a.tier from aircraft a join tiers t on t.tier=a.tier where t.cost=0 limit 1')).rows[0];
});
after(async () => { await db.close(); });
const payload = (report) => ({ version: report.version, rulesFingerprint: report.rulesFingerprint, summary: '', source: '',
  pilots: report.pilots.map(({ userId, aircraftId, attended, survived, counts, notes, reviewed }) => ({ userId, aircraftId, attended, survived, counts, notes, reviewed })) });
async function run(survived, multiplier) {
  await db.query('update tiers set multiplier=$1 where tier=$2', [multiplier, free.tier]);
  const id = (await db.query("insert into missions(title,starts_at,created_by) values ('Bonus','2030-01-01',$1) returning id", [admin.id])).rows[0].id;
  await missions.signUp(pilot, id, free.id);
  const body = payload(await reports.getMissionReport(admin, id, true));
  body.pilots[0] = { ...body.pilots[0], attended: true, survived, reviewed: true, counts: { ...body.pilots[0].counts, airborneAircraft: 5 } };
  return { id, saved: await reports.saveMissionReport(admin, id, body) };
}

test('bônus da aeronave e de sobrevivência se somam sobre os 1.000 pontos de abate', async () => {
  const { saved } = await run(true, 1.33);
  const p = saved.pilots[0];
  assert.equal(p.subtotal, 1000); assert.equal(p.aircraftMultiplier, 1.33); assert.equal(p.aircraftBonus, 330);
  assert.equal(p.survivalBonus, 500); assert.equal(p.total, 1830);
});

test('abatido recebe só o bônus da aeronave; aeronave 1,0× e sobreviveu recebe só o de sobrevivência', async () => {
  assert.equal((await run(false, 1.33)).saved.pilots[0].total, 1330);
  assert.equal((await run(true, 1)).saved.pilots[0].total, 1500);
});

test('o bônus incide também sobre objetivos de transporte', () => {
  const rules = scoring.DEFAULT_SCORING_RULES;
  const counts = { airborneAircraft: 2, groundAircraft: 0, armoredVehicle: 0, antiAircraft: 0, helicopter: 0, ship: 0, sam: 0, helicopterTransport: 0, cargoTransport: 1 };
  const result = reports.calculatePilot({ attended: true, survived: false, counts }, rules, 1.33);
  assert.equal(result.subtotal, 900); assert.equal(result.aircraftBonus, 297); assert.equal(result.total, 1197);
});

test('piloto ausente não recebe bônus e a publicação paga o total com os bônus', async () => {
  const absent = reports.calculatePilot({ attended: false, survived: null, counts: Object.fromEntries(reports.REPORT_TARGETS.map(([k]) => [k, 0])) }, scoring.DEFAULT_SCORING_RULES, 1.33);
  assert.equal(absent.total, 0);
  const { id, saved } = await run(true, 1.33);
  const before = await users.getBalance(pilot.id);
  await reports.saveMissionReport(admin, id, payload(saved), true);
  assert.equal(await users.getBalance(pilot.id), before + 1830);
  // mudar o tier depois não altera o relatório publicado
  await db.query('update tiers set multiplier=3 where tier=$1', [free.tier]);
  assert.equal((await reports.getMissionReport(pilot, id)).pilots[0].total, 1830);
});
