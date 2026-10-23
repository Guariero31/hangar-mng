import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'mission-slug-test-secret-at-least-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false' });
const { db, migrate } = await import('../server/src/db.ts');
const missions = await import('../server/src/services/missions.ts');
let admin;
before(async () => {
  await migrate();
  admin = (await db.query("insert into users(google_sub,email,nickname,role,status) values('SlugAdmin','slug@example.invalid','SlugAdmin','admin','active') returning *")).rows[0];
});
after(async () => { await db.close(); });
const input = title => ({ title, briefing: '', startsAt: '2035-01-01T22:00:00Z', defaultPm: null });

test('readable address removes accents and punctuation and remains stable after renaming', async () => {
  const { ids: [id] } = await missions.createMission(admin, input('Operação: Estreito de Varkan!'), 0);
  const mission = await missions.getMission(admin, id);
  assert.equal(mission.slug, 'operacao-estreito-de-varkan');
  assert.equal((await missions.getMission(admin, mission.slug)).id, id);
  assert.equal(await missions.resolveMissionId(mission.slug), id);
  assert.equal(await missions.resolveMissionId(id), id);
  await missions.updateMission(admin, id, input('Outro nome'));
  assert.equal((await missions.getMission(admin, mission.slug)).title, 'Outro nome');
  assert.equal((await missions.getMission(admin, id)).slug, mission.slug);
  await assert.rejects(missions.getMission(admin, 'nao-existe'), error => error.code === 'MISSION_NOT_FOUND');
});

test('concurrent missions and weekly copies receive distinct human addresses', async () => {
  const results = await Promise.all([missions.createMission(admin, input('Missão X'), 1), missions.createMission(admin, input('Missão X'), 0)]);
  const all = await Promise.all(results.flatMap(result => result.ids).map(id => missions.getMission(admin, id)));
  assert.deepEqual(all.map(mission => mission.slug).sort(), ['missao-x', 'missao-x-2', 'missao-x-3']);
  const { ids: [collision] } = await missions.createMission(admin, input('Missão X 2'), 0);
  assert.equal((await missions.getMission(admin, collision)).slug, 'missao-x-2-2');
});

test('empty normalized titles and UUID-shaped titles remain accessible', async () => {
  const { ids: [fallback] } = await missions.createMission(admin, input('✈️'), 0);
  assert.equal((await missions.getMission(admin, fallback)).slug, 'missao');
  const title = '12345678-1234-1234-1234-123456789012';
  const { ids: [id] } = await missions.createMission(admin, input(title), 0);
  assert.equal((await missions.getMission(admin, `missao-${title}`)).id, id);
});
