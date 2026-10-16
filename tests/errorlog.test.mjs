import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'errorlog-test-secret-with-at-least-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const log = await import('../server/src/services/errorlog.ts');
before(async () => { await migrate(); });
after(async () => { await db.close(); });

test('same error groups together, personal data is scrubbed, resolve and reopen work', async () => {
  const boom = (who) => new Error(`falha para ${who}@example.com no pedido 123456`);
  await log.logServerError(boom('ana'), { route: '/api/x', method: 'GET' });
  await log.logServerError(boom('bruno'), { route: '/api/x', method: 'GET' });
  await log.logError({ source: 'client', message: 'TypeError: x is undefined', route: '/perfil' });
  let list = await log.listErrors('open', 'all', 50, 0);
  assert.equal(list.items.length, 2);
  const grouped = list.items.find((i) => i.source === 'server');
  assert.equal(grouped.count, 2);
  assert.ok(!grouped.message.includes('@example.com'));
  assert.ok(!grouped.message.includes('123456'));

  await log.setResolved(grouped.id, true);
  assert.equal((await log.listErrors('open', 'all', 50, 0)).items.length, 1);
  assert.equal((await log.listErrors('resolved', 'all', 50, 0)).items.length, 1);

  await log.logServerError(boom('carla'), { route: '/api/x', method: 'GET' }); // volta a acontecer: reabre
  list = await log.listErrors('open', 'server', 50, 0);
  assert.equal(list.items[0].count, 3);
  assert.equal(await log.openErrorCount(), 2);
});

test('old errors are purged and clearing resolved works', async () => {
  await db.query(`update error_log set last_seen = now() - interval '40 days' where source = 'client'`);
  const list = await log.listErrors('all', 'all', 50, 0);
  assert.ok(!list.items.some((i) => i.source === 'client'));
  const [one] = list.items;
  await log.setResolved(one.id, true);
  assert.equal(await log.clearResolved(), 1);
});
