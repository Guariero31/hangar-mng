import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'isolated-scoring-tests-secret-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const scoring = await import('../server/src/services/scoring.ts');
const { api } = await import('../server/src/routes.ts');
let admin, player, server, base;
before(async () => {
  await migrate(); await seed();
  admin = (await db.query("insert into users(google_sub,email,nickname,role) values ('scoring-admin','admin@example.invalid','Admin','admin') returning *")).rows[0];
  player = (await db.query("insert into users(google_sub,email,nickname) values ('scoring-player','pilot@example.invalid','Pilot') returning *")).rows[0];
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/api', api);
  app.use((error, _req, res, _next) => res.status(error.status || 400).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); await db.close(); });
const headers = (user) => ({ 'Content-Type': 'application/json', ...(user ? { Cookie: `hangar_session=${jwt.sign({ sub: user.id }, process.env.JWT_SECRET)}` } : {}) });

test('scoring settings persist independently of tier bonuses and player balances, with audit', async () => {
  const originalTiers = (await db.query('select * from tiers order by tier')).rows;
  assert.deepEqual(await scoring.getScoringRules(), scoring.DEFAULT_SCORING_RULES);
  const rules = { ...scoring.DEFAULT_SCORING_RULES, sam: 300, survivalMultiplier: 1.75 };
  assert.deepEqual(await scoring.saveScoringRules(admin, rules), rules);
  assert.deepEqual(await scoring.getScoringRules(), rules);
  assert.deepEqual((await db.query('select * from tiers order by tier')).rows, originalTiers);
  assert.equal((await db.query('select count(*)::int as count from points_ledger')).rows[0].count, 0);
  const audit = (await db.query("select details from admin_audit_log where action='update_scoring_rules'")).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].details.sam, 300);
  for (const invalid of [{ ...rules, airborneAircraft: -1 }, { ...rules, sam: 1.5 }, { ...rules, survivalMultiplier: 0.5 }, { ...rules, survivalEnabled: 'true' }]) {
    await assert.rejects(scoring.saveScoringRules(admin, invalid));
    assert.deepEqual(await scoring.getScoringRules(), rules);
  }
});

test('scoring endpoints restrict reads and writes to administrators and validate payloads', async () => {
  assert.equal((await fetch(`${base}/api/admin/scoring`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/scoring`, { headers: headers(player) })).status, 403);
  assert.equal((await fetch(`${base}/api/admin/scoring`, { method: 'PUT', headers: headers(player), body: JSON.stringify(scoring.DEFAULT_SCORING_RULES) })).status, 403);
  const saved = await fetch(`${base}/api/admin/scoring`, { method: 'PUT', headers: headers(admin), body: JSON.stringify(scoring.DEFAULT_SCORING_RULES) });
  assert.equal(saved.status, 200);
  const read = await fetch(`${base}/api/admin/scoring`, { headers: headers(admin) });
  assert.deepEqual(await read.json(), scoring.DEFAULT_SCORING_RULES);
  assert.equal((await fetch(`${base}/api/admin/scoring`, { method: 'PUT', headers: headers(admin), body: JSON.stringify({ sam: 200 }) })).status, 400);
});
