import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'mission-file-upgrade-test-isolated-secret-123456789' });
const { db, migrate } = await import('../server/src/db.ts');
const { uploadMissionAsset, readMissionFile, describeAsset } = await import('../server/src/services/mission-files.ts');

test('upgrades the original attachment schema without losing existing files', async () => {
  try {
    await db.exec('create table schema_migrations(name text primary key, applied_at timestamptz not null default now())');
    const directory = new URL('../server/migrations/', import.meta.url);
    for (const name of (await fs.readdir(directory)).filter((name) => name.endsWith('.sql') && name < '009').sort()) {
      await db.exec(await fs.readFile(new URL(name, directory), 'utf8'));
      await db.query('insert into schema_migrations(name) values ($1)', [name]);
    }
    await db.exec(`create table mission_assets(id uuid primary key default gen_random_uuid(), kind text not null, name text not null, entrypoint text not null, created_by uuid references users(id), created_at timestamptz not null default now());
      create table mission_asset_files(asset_id uuid references mission_assets(id), path text not null, mime text not null, content bytea not null, primary key(asset_id,path));
      alter table missions add column image_asset_id uuid references mission_assets(id);
      alter table missions add column briefing_asset_id uuid references mission_assets(id);
      insert into schema_migrations(name) values ('009_mission_files.sql');`);
    const admin = (await db.query("insert into users(google_sub,email,nickname,role) values ('upgrade-admin','admin@example.invalid','Admin','admin') returning *")).rows[0];
    const asset = (await db.query("insert into mission_assets(kind,name,entrypoint) values ('briefing','original.zip','index.html') returning *")).rows[0];
    const original = Buffer.alloc(700 * 1024, 65);
    await db.query('insert into mission_asset_files values ($1,$2,$3,$4)', [asset.id, 'index.html', 'text/html', original]);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1kAAAAASUVORK5CYII=', 'base64');
    await assert.rejects(uploadMissionAsset(admin.id, 'image', 'new.png', png), /chunks/);
    await migrate();
    await migrate();
    const token = describeAsset(asset).url.split('/')[3];
    assert.deepEqual((await readMissionFile(token, 'index.html')).content, original);
    const stored = await uploadMissionAsset(admin.id, 'image', 'new.png', png);
    assert.deepEqual((await readMissionFile(stored.url.split('/')[3], 'map.png')).content, png);
  } finally { await db.close(); }
});
