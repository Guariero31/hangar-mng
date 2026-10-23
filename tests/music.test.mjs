import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'music-library-test-secret-with-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { config } = await import('../server/src/config.ts');
const { api } = await import('../server/src/routes.ts');
const files = await import('../server/src/services/mission-files.ts');
const music = await import('../server/src/services/music.ts');
const missions = await import('../server/src/services/missions.ts');
let admin, player, server, base;
const cookie = user => `hangar_session=${jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '1h' })}`;
before(async () => {
  await migrate();
  const create = async (name, role) => (await db.query("insert into users(google_sub,email,nickname,role,status) values($1,$2,$1,$3,'active') returning *", [name, `${name}@example.invalid`, role])).rows[0];
  admin = await create('MusicAdmin', 'admin'); player = await create('MusicPlayer', 'player');
  const app = express(); app.use(express.json(), cookieParser()); app.use('/api', api);
  app.use((error, _req, res, _next) => res.status(error.status ?? 400).json({ error: { code: error.code, message: error.message } }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.close(); });

test('library imports existing audio and reuses one file across missions without copying it', async () => {
  const content = Buffer.from('ID3-audio-from-existing-mission');
  const track = await files.uploadMissionAsset(admin.id, 'audio', 'Faixa existente.mp3', content);
  let library = await music.listMusic();
  assert.equal(library.find(item => item.id === track.id).uses, 0);
  assert.equal(library.find(item => item.id === track.id).size, content.length);
  const input = { title: 'Música compartilhada', briefing: '', startsAt: '2035-01-01T22:00:00Z', defaultPm: null, audioAssetId: track.id };
  const { ids } = await missions.createMission(admin, input, 1);
  library = await music.listMusic();
  assert.equal(library.find(item => item.id === track.id).uses, 2);
  assert.equal((await db.query("select count(*)::int as count from mission_assets where kind='audio'")).rows[0].count, 1);
  for (const id of ids) assert.equal((await missions.getMission(player, id)).audioAsset.id, track.id);
  await assert.rejects(music.deleteMusic(track.id), /em uso/);
  for (const id of ids) await missions.updateMission(admin, id, { ...input, audioAssetId: null });
  await music.deleteMusic(track.id);
  assert.equal((await music.listMusic()).length, 0);
  assert.equal((await db.query('select count(*)::int as count from mission_asset_chunks where asset_id=$1', [track.id])).rows[0].count, 0);
});

test('library and deletion are admin-only and audio uploads are validated', async () => {
  assert.equal((await fetch(`${base}/api/admin/music`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/music`, { headers: { Cookie: cookie(player) } })).status, 403);
  const upload = await fetch(`${base}/api/admin/mission-files/audio?name=Teste.mp3`, { method: 'POST', headers: { Cookie: cookie(admin), 'Content-Type': 'application/octet-stream' }, body: Buffer.from('ID3-test-music') });
  assert.equal(upload.status, 201);
  const track = await upload.json();
  const libraryResponse = await fetch(`${base}/api/admin/music`, { headers: { Cookie: cookie(admin) } });
  assert.equal(libraryResponse.status, 200);
  assert.ok((await libraryResponse.json()).some(item => item.id === track.id && item.url.includes('/api/mission-files/')));
  const url = `${base}/api/admin/music/${track.id}`;
  assert.equal((await fetch(url, { method: 'DELETE', headers: { Cookie: cookie(player) } })).status, 403);
  assert.equal((await fetch(url, { method: 'DELETE', headers: { Cookie: cookie(admin) } })).status, 200);
  assert.equal((await fetch(url, { method: 'DELETE', headers: { Cookie: cookie(admin) } })).status, 404);
  await assert.rejects(files.uploadMissionAsset(admin.id, 'audio', 'falso.mp3', Buffer.from('<script>bad</script>')), /MP3/);
});
