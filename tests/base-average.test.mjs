import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'base-average-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const m = await import('../server/src/services/missions.ts');
const { getTree } = await import('../server/src/services/techtree.ts');
let admin, pilots, free;
before(async () => {
  await migrate(); await seed();
  const mk = async (n, role = 'player') => (await db.query(
    `insert into users (google_sub,email,nickname,role) values ($1,$2,$1,$3) returning *`, [n, `${n}@example.invalid`, role])).rows[0];
  admin = await mk('Adm', 'admin');
  pilots = [];
  for (let i = 0; i < 6; i++) pilots.push(await mk(`Pilot${i}`));
  free = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 and a.active limit 1`)).rows[0].id;
});
after(async () => { await db.close(); });

async function closedMission(title, awards) {
  const { ids } = await m.createMission(admin, { title, briefing: '', startsAt: '2030-01-01T20:00:00Z', defaultPm: null }, 0);
  for (const [i] of awards) await m.signUp(pilots[i], ids[0], free);
  await m.closeMission(admin, ids[0], awards.map(([i, pm]) => ({ userId: pilots[i].id, pm })));
}

test('sem missão encerrada não há média, e não existe valor de referência', async () => {
  const tree = await getTree();
  assert.equal(tree.baseMissionSample, 0);
  assert.equal(tree.baseMissionPoints, 0);
  assert.equal('baseMissionConfigured' in tree, false);
  assert.equal('baseMissionSource' in tree, false);
});

test('a média vale desde a primeira missão encerrada, sem mínimo de participações', async () => {
  await closedMission('Primeira', [[0, 1000], [1, 500]]);
  const tree = await getTree();
  assert.equal(tree.baseMissionSample, 2);
  assert.equal(tree.baseMissionPoints, 750);
});

test('a média inclui todos os pilotos, até quem fez 0', async () => {
  await closedMission('Segunda', [[2, 600], [3, 0], [4, 800]]);
  const tree = await getTree();
  // 1000, 500, 600, 0, 800 → soma 2900 em 5 participações → 580
  assert.equal(tree.baseMissionSample, 5);
  assert.equal(tree.baseMissionPoints, 580);
});

test('missão agendada e quem não participou ficam fora da média', async () => {
  await m.createMission(admin, { title: 'Futura', briefing: '', startsAt: '2031-01-01T20:00:00Z', defaultPm: null }, 0);
  const { ids } = await m.createMission(admin, { title: 'Faltou', briefing: '', startsAt: '2030-02-01T20:00:00Z', defaultPm: null }, 0);
  await m.signUp(pilots[5], ids[0], free);
  await m.closeMission(admin, ids[0], []);
  const tree = await getTree();
  assert.equal(tree.baseMissionSample, 5);
  assert.equal(tree.baseMissionPoints, 580);
});

test('o administrador não tem mais como definir o valor', async () => {
  const admin = await import('../server/src/services/admin.ts');
  assert.equal('saveSettings' in admin, false);
});
