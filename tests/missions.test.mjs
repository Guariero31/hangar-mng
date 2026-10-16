import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'missions-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const m = await import('../server/src/services/missions.ts');
let adm, p1, p2, paid;
before(async () => {
  await migrate(); await seed();
  const mk = async (n, role = 'player') => (await db.query(
    `insert into users (google_sub,email,nickname,role) values ($1,$2,$1,$3) returning *`, [n, `${n}@example.invalid`, role])).rows[0];
  adm = await mk('Adm', 'admin'); p1 = await mk('Pilot1'); p2 = await mk('Pilot2');
  paid = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost>0 and a.active limit 1`)).rows[0].id;
});
after(async () => { await db.close(); });

test('weekly repeat, owned-only signup, close awards PM once', async () => {
  const { ids } = await m.createMission(adm, { title: 'Op Teste', briefing: '', startsAt: '2030-01-01T20:00:00Z', defaultPm: null }, 2);
  assert.equal(ids.length, 3);
  const free = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 and a.active limit 1`)).rows[0].id;
  await assert.rejects(m.signUp(p1, ids[0], paid), /possui/);
  await m.signUp(p1, ids[0], free); await m.signUp(p2, ids[0], free);
  await m.cancelSignup(p2, ids[0]);
  await assert.rejects(m.closeMission(adm, ids[0], [{ userId: p2.id, pm: 100 }]));
  await m.closeMission(adm, ids[0], [{ userId: p1.id, pm: 300 }]);
  const bal = (await db.query(`select sum(amount)::int s from points_ledger where user_id=$1`, [p1.id])).rows[0].s;
  assert.equal(bal, 300);
  await assert.rejects(m.closeMission(adm, ids[0], [{ userId: p1.id, pm: 300 }]), /alterações/);
  await assert.rejects(m.signUp(p1, ids[0], free), /alterações/);
});

test('new mission shows in the bell once per series', async () => {
  const users = await import('../server/src/services/users.ts');
  const fresh = (await db.query(`insert into users (google_sub,email,nickname,created_at) values ('Old','old@example.invalid','Old', now() - interval '1 day') returning *`)).rows[0];
  const series = await m.createMission(adm, { title: 'Serie Sino', briefing: '', startsAt: '2031-01-01T20:00:00Z', defaultPm: null }, 3);
  const news = await users.getNews(fresh);
  assert.equal(news.items.filter((i) => i.kind === 'mission' && i.reason.includes('Serie Sino')).length, 1);
  assert.equal(news.items.find((i) => i.kind === 'mission' && i.reason.includes('Serie Sino')).missionId, series.ids[0]);
});

test('operation detail persists briefing metadata and personal signup across lifecycle', async () => {
  const input = { title: 'Operação detalhada', briefing: 'Contexto\n\nObjetivo: proteger a base.', startsAt: '2032-02-03T21:00:00Z', defaultPm: 250, mapName: 'Syria', briefingImageUrl: 'https://example.invalid/map.png' };
  const { ids } = await m.createMission(adm, input, 1);
  const free = (await db.query(`select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 and a.active limit 1`)).rows[0].id;
  let detail = await m.getMission(p1, ids[0]);
  assert.equal(detail.mapName, input.mapName);
  assert.equal(detail.briefing, input.briefing);
  assert.equal(detail.briefingImageUrl, input.briefingImageUrl);
  assert.equal(detail.mine, null);
  assert.equal((await m.getMission(p1, ids[1])).mapName, 'Syria');
  await m.signUp(p1, ids[0], free);
  detail = await m.getMission(p1, ids[0]);
  assert.equal(detail.mine.aircraftId, free);
  assert.equal(detail.signups.length, 1);
  assert.equal((await m.getMission(p2, ids[0])).mine, null);
  assert.equal('email' in detail.signups[0], false);
  await m.cancelSignup(p1, ids[0]);
  assert.equal((await m.getMission(p1, ids[0])).mine, null);
  await m.updateMission(adm, ids[0], { ...input, mapName: 'Caucasus', briefingImageUrl: '' });
  detail = await m.getMission(p1, ids[0]);
  assert.equal(detail.mapName, 'Caucasus');
  assert.equal(detail.briefingImageUrl, '');
  await m.cancelMission(adm, ids[0]);
  assert.equal((await m.getMission(p1, ids[0])).status, 'cancelled');
  await assert.rejects(m.getMission(p1, '00000000-0000-4000-8000-000000000000'), /encontrada/);
});
