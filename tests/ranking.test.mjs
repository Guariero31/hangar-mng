import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'ranking-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const { getRanking } = await import('../server/src/services/ranking.ts');
const now = new Date('2026-10-16T12:00:00Z');
const pilots = [];
before(async () => {
  await migrate(); await seed();
  for (const [nickname, amount] of [['Alpha', 1000], ['Bravo', 800], ['Charlie', 800], ['Delta', 350], ['Echo', 0]]) {
    const { rows: [pilot] } = await db.query(`insert into users (google_sub,email,nickname)
      values ($1,$2,$1) returning *`, [nickname, `${nickname}@example.invalid`]);
    pilots.push(pilot);
    if (amount) await db.query(`insert into points_ledger (user_id,amount,reason,source,created_at)
      values ($1,$2,'Training','manual','2026-10-10T12:00:00Z')`, [pilot.id, amount]);
  }
});
after(async () => { await db.close(); });

test('podium and personal position remain available outside the requested page', async () => {
  const ranking = await getRanking(pilots[3], 1, 4, 'all', now);
  assert.equal(ranking.items[0].nickname, 'Echo');
  assert.deepEqual(ranking.podium.map(pilot => pilot.nickname), ['Alpha', 'Bravo', 'Charlie']);
  assert.equal(ranking.personal.pilot.pos, 4);
  assert.equal(ranking.personal.pageOffset, 3);
  assert.equal(ranking.personal.next.nickname, 'Bravo');
  assert.equal(ranking.personal.gap, 450);
  assert.equal(ranking.total, 5);
  assert.ok(!JSON.stringify(ranking).includes('@example.invalid'));
});

test('ties share a rank and target the next strictly higher score', async () => {
  const ranking = await getRanking(pilots[2], 20, 0, 'all', now);
  assert.deepEqual(ranking.items.map(pilot => pilot.pos), [1, 2, 2, 4, 5]);
  assert.equal(ranking.personal.pilot.tied, 2);
  assert.equal(ranking.personal.next.nickname, 'Alpha');
  assert.equal(ranking.personal.gap, 200);
  const leader = await getRanking(pilots[0], 20, 0, 'all', now);
  assert.equal(leader.personal.next, null);
  assert.equal(leader.personal.progress, 100);
});

test('monthly ranking observes Cuiaba month boundaries and counts only earned points', async () => {
  await db.query(`insert into points_ledger (user_id,amount,reason,source,created_at) values
    ($1,5000,'Previous month','manual','2026-10-01T03:59:59Z'),
    ($1,50,'Month begins','server','2026-10-01T04:00:00Z'),
    ($1,6000,'Next month','manual','2026-11-01T04:00:00Z'),
    ($1,7000,'Refund is not earned','refund','2026-10-11T12:00:00Z'),
    ($1,-100,'Purchase','unlock','2026-10-12T12:00:00Z')`, [pilots[3].id]);
  const monthly = await getRanking(pilots[3], 20, 0, 'month', now);
  assert.equal(monthly.personal.pilot.earned, 400);
  assert.equal(monthly.periodLabel, 'outubro de 2026');
  assert.equal(monthly.items.find(pilot => pilot.nickname === 'Echo').earned, 0);
  const overall = await getRanking(pilots[3], 20, 0, 'all', now);
  assert.equal(overall.personal.pilot.earned, 11400);
});

test('empty months stay finite and banned players never appear', async () => {
  await db.query(`insert into users (google_sub,email,nickname,status) values ('banned','banned@example.invalid','Banned','banned')`);
  const empty = await getRanking(pilots[4], 20, 0, 'month', new Date('2027-01-16T12:00:00Z'));
  assert.equal(empty.total, 5);
  assert.ok(empty.items.every(pilot => pilot.earned === 0 && pilot.pos === 1));
  assert.equal(empty.personal.progress, 100);
  assert.equal(empty.personal.next, null);
  assert.equal(empty.personal.gap, 0);
});
