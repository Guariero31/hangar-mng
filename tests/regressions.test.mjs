import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import { once } from 'node:events';

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://',
  JWT_SECRET: 'test-secret-that-is-long-enough-and-is-not-used-in-production',
  GOOGLE_CLIENT_ID: '', ADMIN_EMAILS: 'admin@example.invalid', REQUIRE_APPROVAL: 'true',
  SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const users = await import('../server/src/services/users.ts');
const admin = await import('../server/src/services/admin.ts');
const tree = await import('../server/src/services/techtree.ts');
let actor;
let sequence = 0;
async function player() {
  sequence++;
  const { rows: [user] } = await db.query(`insert into users (google_sub,email,nickname)
    values ($1,$2,$3) returning *`, [`test-${sequence}`, `pilot${sequence}@example.invalid`, `Pilot${sequence}`]);
  return user;
}
before(async () => { await migrate(); await seed(); });
after(async () => { await db.close(); });

test('first ordinary signup remains pending; configured admin can initialize the system', async () => {
  const ordinary = await users.upsertLogin({ sub: 'ordinary', email: 'ordinary@example.invalid' });
  assert.equal(ordinary.status, 'pending');
  actor = await users.upsertLogin({ sub: 'administrator', email: 'admin@example.invalid' });
  assert.equal(actor.status, 'active');
  assert.equal(actor.role, 'admin');
});

test('free grants never produce a refund, even after an earlier purchase cycle', async () => {
  const pilot = await player();
  await admin.addPoints(actor, pilot.id, 500, 'Starting balance');
  await tree.unlockAircraft(pilot.id, 'f4e');
  await admin.revokeAircraft(actor, pilot.id, 'f4e', true);
  await admin.grantAircraft(actor, pilot.id, 'f4e');
  await assert.rejects(tree.undoUnlock(pilot.id, 'f4e'), { code: 'UNDO_UNAVAILABLE' });
  await admin.revokeAircraft(actor, pilot.id, 'f4e', true);
  assert.equal(await users.getBalance(pilot.id), 500);
});

test('refund uses the paid price and duplicate revocation cannot credit twice', async () => {
  const pilot = await player();
  await admin.addPoints(actor, pilot.id, 500, 'Starting balance');
  await tree.unlockAircraft(pilot.id, 'f4e');
  await admin.saveTier(actor, 2, { label: 'II', cost: 900, multiplier: 1.25 }, false);
  await admin.revokeAircraft(actor, pilot.id, 'f4e', true);
  assert.equal(await users.getBalance(pilot.id), 500);
  await assert.rejects(admin.revokeAircraft(actor, pilot.id, 'f4e', true), { code: 'NOT_UNLOCKED' });
  await admin.saveTier(actor, 2, { label: 'II', cost: 500, multiplier: 1.25 }, false);
});

test('concurrent duplicate purchase debits once; undo returns the original price', async () => {
  const pilot = await player();
  await admin.addPoints(actor, pilot.id, 1000, 'Starting balance');
  const results = await Promise.allSettled([tree.unlockAircraft(pilot.id, 'su25a'), tree.unlockAircraft(pilot.id, 'su25a')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await users.getBalance(pilot.id), 500);
  await admin.saveTier(actor, 2, { label: 'II', cost: 800, multiplier: 1.25 }, false);
  assert.equal(await tree.undoUnlock(pilot.id, 'su25a'), 1000);
  await assert.rejects(tree.undoUnlock(pilot.id, 'su25a'), { code: 'UNDO_UNAVAILABLE' });
  await admin.saveTier(actor, 2, { label: 'II', cost: 500, multiplier: 1.25 }, false);
});

test('former administrators can be deleted while their audit events remain anonymous', async () => {
  const former = await player();
  const pilot = await player();
  await admin.setRole(actor, former.id, 'admin');
  await admin.addPoints({ ...former, role: 'admin' }, pilot.id, 1, 'Training');
  await admin.renamePlayer(actor, former.id, 'FormerPilot');
  await admin.setRole(actor, former.id, 'player');
  await admin.deleteUser(actor, former.id);
  assert.equal(await users.findUserById(former.id), null);
  const { rows } = await db.query("select admin_id, details from admin_audit_log where action = 'add_points' and target_user_id = $1", [pilot.id]);
  assert.equal(rows[0].admin_id, null);
  const activity = await admin.getActivity(null, 100, 0);
  assert.ok(activity.items.some(item => item.adminId === null));
  assert.ok(!JSON.stringify(activity).includes(former.email));
  assert.ok(!JSON.stringify(activity).includes('FormerPilot'));
});

test('invalid parent tiers, combined cycles, and disabling required bound nodes roll back', async () => {
  const catalog = await tree.getTree();
  const fighter = catalog.aircraft.find(aircraft => aircraft.id === 'f4e');
  const attack = catalog.aircraft.find(aircraft => aircraft.id === 'su25a');
  await assert.rejects(admin.updateAircraft(actor, fighter.id, { ...fighter, parents: ['f16c'] }), { code: 'VALIDATION' });
  await assert.rejects(admin.updateAircraft(actor, fighter.id, { ...fighter, bound: ['f14a'] }), { code: 'VALIDATION' });
  await assert.rejects(admin.updateAircraft(actor, attack.id, { ...attack, active: false }), { code: 'VALIDATION' });
  const current = await tree.getTree();
  assert.deepEqual(current.aircraft.find(aircraft => aircraft.id === fighter.id), fighter);
  assert.equal(current.aircraft.find(aircraft => aircraft.id === attack.id).active, true);
});

test('balances and reporting continue working beyond the signed int32 limit', async () => {
  const pilot = await player();
  await db.query("insert into points_ledger (user_id,amount,reason,source) values ($1,2147483647,'Large balance','manual'),($1,1,'Next point','manual')", [pilot.id]);
  assert.equal(await users.getBalance(pilot.id), 2147483648);
  const { getProfile } = await import('../server/src/services/profile.ts');
  assert.equal((await getProfile(pilot)).totals.earned, 2147483648);
  assert.ok((await admin.getOverview()).circulation.circulating > 2147483647);
});

test('pagination reaches all records with global filtering, sorting and summary', async () => {
  await db.query(`insert into users (google_sub,email,nickname,status)
    select 'page-' || counter, 'page' || counter || '@example.invalid', 'Page' || lpad(counter::text,4,'0'),
      case when counter % 2 = 0 then 'pending' else 'active' end from generate_series(1,220) counter`);
  const first = await admin.listPlayers('page', 50, 0, { filter: 'active', sort: 'nickname', direction: 'asc' });
  const second = await admin.listPlayers('page', 50, 50, { filter: 'active', sort: 'nickname', direction: 'asc' });
  const third = await admin.listPlayers('page', 50, 100, { filter: 'active', sort: 'nickname', direction: 'asc' });
  assert.equal(first.total, 110);
  assert.equal(new Set([...first.players, ...second.players, ...third.players].map(row => row.id)).size, 110);
  assert.equal(first.players[0].nickname, 'Page0001');
  assert.equal(third.players.at(-1).nickname, 'Page0219');
  assert.deepEqual(first.summary, second.summary);
  assert.ok(first.summary.active > 110);
  const approvals = await admin.listApprovals(50, 100);
  assert.ok(approvals.total > 100);
  assert.ok(approvals.items.length > 0);
  assert.ok(approvals.pending > approvals.items.length);
});

test('history exposes older entries and ranking is a bounded read-only query', async () => {
  const pilot = await player();
  await db.query(`insert into points_ledger (user_id,amount,reason,source)
    select $1, counter, 'Mission ' || counter, 'manual' from generate_series(1,65) counter`, [pilot.id]);
  const first = await users.getHistoryPage(pilot.id, 50, 0);
  const second = await users.getHistoryPage(pilot.id, 50, 50);
  assert.equal(first.total, 65);
  assert.equal(second.items.length, 15);
  assert.equal(new Set([...first.items, ...second.items].map(item => String(item.id))).size, 65);
  const { getRanking } = await import('../server/src/services/ranking.ts');
  const statements = [];
  const original = db.query;
  db.query = async (sql, values) => { statements.push(sql); return original(sql, values); };
  try {
    const ranking = await getRanking(pilot, 50, 50);
    assert.ok(ranking.total > 100);
    assert.equal(ranking.items.length, 50);
    assert.ok(!JSON.stringify(ranking).includes('@example.invalid'));
    assert.ok(statements.every(sql => !/\b(insert|update|delete)\b/i.test(sql)));
    assert.ok(statements.length <= 5);
  } finally { db.query = original; }
});

test('numbers outside the safe JSON range fail instead of losing precision', async () => {
  await assert.rejects(db.query('select 9007199254740992::float8 as total'), { code: 'VALIDATION' });
});

test('HTTP routes enforce session, approval, admin permissions and pagination validation', async context => {
  const { default: express } = await import('express');
  const { default: cookieParser } = await import('cookie-parser');
  const { default: jwt } = await import('jsonwebtoken');
  const { api } = await import('../server/src/routes.ts');
  const application = express();
  application.use(express.json());
  application.use(cookieParser());
  application.use('/api', api);
  application.use((error, _request, response, _next) => response.status(error.status ?? 400).json({ error: error.code ?? 'VALIDATION' }));
  const server = application.listen(0, '127.0.0.1');
  context.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await once(server, 'listening');
  const request = (pathname, userId) => new Promise((resolve, reject) => {
    const headers = userId ? { Cookie: `hangar_session=${jwt.sign({ sub: userId }, process.env.JWT_SECRET)}` } : {};
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: `/api${pathname}`, headers }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
  const pilot = await player();
  const pending = await users.upsertLogin({ sub: 'pending-http', email: 'pending-http@example.invalid' });
  await db.query("update users set nickname = 'AuditAdmin' where id = $1", [actor.id]);
  assert.equal((await request('/ranking')).status, 401);
  assert.equal((await request('/admin/players', pilot.id)).status, 403);
  assert.equal((await request('/ranking', pending.id)).status, 403);
  assert.equal((await request('/auth/status', pending.id)).body.status, 'pending');
  assert.equal((await request('/ranking?limit=0', pilot.id)).status, 400);
  assert.equal((await request('/ranking?offset=-1', pilot.id)).status, 400);
  assert.equal((await request('/admin/players?sort=invalid', actor.id)).status, 400);
  const page = await request('/admin/players?limit=5&offset=5&sort=nickname&direction=asc', actor.id);
  assert.equal(page.status, 200);
  assert.equal(page.body.players.length, 5);
  assert.ok(page.body.total > 100);
});
