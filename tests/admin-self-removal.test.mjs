import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', ADMIN_EMAILS: 'owner@example.invalid', JWT_SECRET: 'self-removal-secret-at-least-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false' });
const { db, migrate } = await import('../server/src/db.ts');
const { setRole } = await import('../server/src/services/admin.ts');
const { upsertLogin } = await import('../server/src/services/users.ts');
before(async () => { await migrate(); });
after(async () => { await db.close(); });
const create = async (name, role = 'admin') => (await db.query(
  "insert into users (google_sub,email,nickname,role,status) values ($1,$2,$1,$3,'active') returning *", [name, `${name}@example.invalid`, role])).rows[0];

test('administrator cannot change their own role even when another administrator exists', async () => {
  const owner = await upsertLogin({ sub: 'owner', email: 'owner@example.invalid' });
  await create('Other');
  await assert.rejects(setRole(owner, owner.id, 'player'), error => error.code === 'CANNOT_CHANGE_OWN_STATUS');
  assert.equal((await db.query('select role from users where id=$1', [owner.id])).rows[0].role, 'admin');
  assert.equal((await db.query("select count(*)::int as count from admin_audit_log where action='set_role'")).rows[0].count, 0);
});

test('another administrator can remove and restore a user role', async () => {
  const actor = await create('Actor'), target = await create('Target');
  await setRole(actor, target.id, 'player');
  assert.equal((await db.query('select role from users where id=$1', [target.id])).rows[0].role, 'player');
  await setRole(actor, target.id, 'admin');
  assert.equal((await db.query('select role from users where id=$1', [target.id])).rows[0].role, 'admin');
});

test('configured administrator login keeps the original bootstrap behavior', async () => {
  const owner = await upsertLogin({ sub: 'owner', email: 'owner@example.invalid' });
  assert.equal(owner.role, 'admin');
});
