import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'isolated-migration-test-secret-of-more-than-32-characters', SEED_DEMO: 'false', SMTP_HOST: '',
});
const { db, migrate } = await import('../server/src/db.ts');
after(async () => { await db.close(); });

test('upgrade preserves proven legacy acquisition prices and never invents prices for grants', async () => {
  await db.exec('create table schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  for (const file of ['001_init.sql', '002_goal_news_undo.sql', '003_achievements.sql', '004_goal_ready.sql', '005_approval.sql']) {
    await db.exec(await readFile(new URL(`../server/migrations/${file}`, import.meta.url), 'utf8'));
    await db.query('insert into schema_migrations (name) values ($1)', [file]);
  }
  let pilot;
  await db.tx(async query => {
    ({ rows: [pilot] } = await query.query("insert into users (google_sub,email) values ('legacy','legacy@example.invalid') returning id"));
    await query.query("insert into tiers (tier,label,cost) values (1,'I',0),(2,'II',900)");
    await query.query("insert into aircraft (id,name,tier) values ('paid','Paid',2),('seeded','Seeded',2),('gift','Gift',2),('unknown','Unknown',2)");
    await query.query("insert into points_ledger (user_id,amount,reason,source,aircraft_id) values ($1,-500,'Old purchase','unlock','paid'),($1,-300,'Desbloqueio: seeded','unlock',null)", [pilot.id]);
    await query.query("insert into user_aircraft (user_id,aircraft_id,granted_by) values ($1,'paid',null),($1,'seeded',null),($1,'gift',$1),($1,'unknown',null)", [pilot.id]);
  });
  await Promise.all([migrate(), migrate()]);
  const { rows } = await db.query('select aircraft_id, paid_amount, purchase_ledger_id, acquisition_kind from user_aircraft order by aircraft_id');
  assert.deepEqual(rows.map(row => [row.aircraft_id, row.paid_amount, row.acquisition_kind]), [
    ['gift', 0, 'grant'], ['paid', 500, 'purchase'], ['seeded', 300, 'purchase'], ['unknown', 0, 'purchase'],
  ]);
  const { refundAcquisition } = await import('../server/src/services/acquisitions.ts');
  const paid = rows.find(row => row.aircraft_id === 'paid');
  assert.equal(await db.tx(query => refundAcquisition(query, pilot.id, paid, pilot.id, 'Legacy refund')), 500);
  assert.equal(await db.tx(query => refundAcquisition(query, pilot.id, paid, pilot.id, 'Repeated refund')), 0);
  assert.equal(await db.tx(query => refundAcquisition(query, pilot.id, rows.find(row => row.aircraft_id === 'unknown'), pilot.id, 'Unknown refund')), 0);
});
