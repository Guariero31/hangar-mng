import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', ADMIN_EMAILS: 'owner@example.invalid', JWT_SECRET: 'self-removal-secret-at-least-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false' });
const { db, migrate } = await import('../server/src/db.ts');
const { setRole } = await import('../server/src/services/admin.ts');
const { upsertLogin } = await import('../server/src/services/users.ts');
before(async () => { await migrate(); });
after(async () => { await db.close(); });
const create = async (name, role = 'admin', status = 'active') => (await db.query(
  'insert into users (google_sub,email,nickname,role,status) values ($1,$2,$1,$3,$4) returning *', [name, `${name}@example.invalid`, role, status])).rows[0];

test('self demotion is persisted even for a configured bootstrap administrator', async () => {
  const owner = await upsertLogin({ sub: 'owner', email: 'owner@example.invalid', name: 'Owner' });
  const other = await create('Other');
  await db.query('insert into points_ledger (user_id,amount,source,reason) values ($1,500,\'manual\',\'test\')', [owner.id]);
  assert.equal(owner.role, 'admin');
  await setRole(owner, owner.id, 'player');
  const relog = await upsertLogin({ sub: 'owner', email: 'owner@example.invalid' });
  assert.equal(relog.role, 'player');
  assert.equal(relog.role_managed, true);
  assert.equal(relog.status, 'active');
  assert.equal((await db.query('select sum(amount)::int as balance from points_ledger where user_id=$1', [owner.id])).rows[0].balance, 500);
  assert.equal((await db.query("select count(*)::int as count from admin_audit_log where admin_id=$1 and target_user_id=$1 and action='set_role'", [owner.id])).rows[0].count, 1);
  await assert.rejects(setRole(owner, owner.id, 'admin'), error => error.code === 'FORBIDDEN');
  await setRole(other, owner.id, 'admin');
  assert.equal((await upsertLogin({ sub: 'owner', email: 'owner@example.invalid' })).role, 'admin');
});

test('last active administrator cannot relinquish access; suspended administrators do not count', async () => {
  await db.query("update users set role='player'");
  const last = await create('Last');
  await create('Suspended', 'admin', 'banned');
  await assert.rejects(setRole(last, last.id, 'player'), /outro administrador ativo/);
  assert.equal((await db.query('select role from users where id=$1', [last.id])).rows[0].role, 'admin');
});

test('concurrent self demotions retain one active administrator', async () => {
  await db.query("update users set role='player'");
  const first = await create('ConcurrentA'), second = await create('ConcurrentB');
  const results = await Promise.allSettled([setRole(first, first.id, 'player'), setRole(second, second.id, 'player')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.query("select count(*)::int as count from users where role='admin' and status='active'")).rows[0].count, 1);
});
