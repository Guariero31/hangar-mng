import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'mission-file-tests-isolated-secret-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const files = await import('../server/src/services/mission-files.ts');
const missions = await import('../server/src/services/missions.ts');
const { api } = await import('../server/src/routes.ts');
const { securityHeaders } = await import('../server/src/security.ts');
let admin, player, server, base;

function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const [filename, data] of entries) {
    const name = Buffer.from(filename), content = Buffer.from(data);
    let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(content.length, 20); directory.writeUInt32LE(content.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, content); central.push(directory, name); offset += header.length + name.length + content.length;
  }
  const listing = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(listing.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, listing, end]);
}
const archive = () => zip([['Briefing da missão.html', '<html><body>Operação<script type="module" src="scripts/map.js"></script></body></html>'], ['scripts/map.js', 'console.log("map");'], ['Ace combat briefing.mp3', 'test-audio']]);
const cookie = (user) => `hangar_session=${jwt.sign({ sub: user.id }, process.env.JWT_SECRET)}`;
before(async () => {
  await migrate(); await seed();
  admin = (await db.query("insert into users(google_sub,email,nickname,role) values ('files-admin','admin@example.invalid','Admin','admin') returning *")).rows[0];
  player = (await db.query("insert into users(google_sub,email,nickname) values ('files-player','player@example.invalid','Player') returning *")).rows[0];
  const app = express(); app.use(securityHeaders); app.use(express.json({ limit: '100kb' })); app.use(cookieParser()); app.use('/api', api);
  app.use((error, req, res, next) => res.status(error.status || 400).json({ error: { message: error.message } }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); await db.close(); });

test('ZIP preserves relative paths, accents, spaces, modules and audio', async () => {
  const unpacked = await files.unpackBriefing(archive());
  assert.equal(unpacked.entrypoint, 'Briefing da missão.html');
  assert.deepEqual(unpacked.files.map((file) => file.path), ['Briefing da missão.html', 'scripts/map.js', 'Ace combat briefing.mp3']);
  assert.equal(unpacked.files[1].mime, 'text/javascript; charset=utf-8');
});
test('ZIP rejects traversal, executable types, ambiguous entrypoints and duplicates', async () => {
  for (const entries of [[['../index.html', 'x']], [['/index.html', 'x']], [['index.html', 'x'], ['bad.exe', 'x']], [['a.html', 'x'], ['b.html', 'x']], [['index.html', 'x'], ['INDEX.html', 'x']]]) await assert.rejects(files.unpackBriefing(zip(entries)));
  await assert.rejects(files.unpackBriefing(Buffer.from('not a zip')));
  await assert.rejects(files.unpackBriefing(zip(Array.from({ length: 129 }, (_, index) => [`${index}.json`, '{}']))));
  await assert.rejects(files.unpackBriefing(zip([['index.html', 'x'], ['big.json', Buffer.alloc(21 * 1024 * 1024)]])));
});
const storeZip = async (name, buffer) => { const { files: unpacked, entrypoint } = await files.unpackBriefing(buffer); return files.saveMissionAssetFiles(admin.id, 'briefing', name, unpacked, entrypoint); };
test('briefing upload accepts only HTML, including fragments that start at <title>', async () => {
  await assert.rejects(files.uploadMissionAsset(admin.id, 'briefing', 'x.zip', archive()), /ZIP/);
  const fragment = Buffer.from('\uFEFF<title>ACS</title>\n<style>body{margin:0}</style>\n<div id="map"></div>');
  assert.equal((await files.uploadMissionAsset(admin.id, 'briefing', 'frag.html', fragment)).name, 'frag.html');
  await assert.rejects(files.uploadMissionAsset(admin.id, 'briefing', 'x.html', Buffer.from('texto qualquer')), /HTML/);
});
test('assets persist with mission copies and require scoped signed file URLs', async () => {
  const asset = await storeZip('briefing.zip', archive());
  const { ids } = await missions.createMission(admin, { title: 'Files', briefing: '', startsAt: '2030-01-01T20:00:00Z', defaultPm: null, briefingAssetId: asset.id }, 1);
  for (const id of ids) assert.equal((await missions.getMission(player, id)).briefingAsset.id, asset.id);
  const url = new URL(asset.url, base), pieces = url.pathname.split('/');
  const entry = await files.readMissionFile(pieces[3], decodeURIComponent(pieces.slice(4).join('/')));
  assert.match(Buffer.from(entry.content).toString(), /Operação/);
  await assert.rejects(files.readMissionFile('invalid', 'index.html'));
  await assert.rejects(files.validateMissionAssets(asset.id, null));
  await missions.updateMission(admin, ids[0], { title: 'No file', briefing: '', startsAt: '2030-01-01T20:00:00Z', defaultPm: null, briefingAssetId: null });
  assert.equal((await missions.getMission(player, ids[0])).briefingAsset, null);
});
test('upload routes restrict writes to admins and isolate executable documents', async () => {
  const upload = (session) => fetch(`${base}/api/admin/mission-files/briefing?name=test.html`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(session ? { Cookie: session } : {}) }, body: Buffer.from('<title>x</title><div>Operação</div>') });
  assert.equal((await upload()).status, 401);
  assert.equal((await upload(cookie(player))).status, 403);
  const zipped = await fetch(`${base}/api/admin/mission-files/briefing?name=test.zip`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Cookie: cookie(admin) }, body: archive() });
  assert.equal(zipped.status, 400);
  const response = await upload(cookie(admin)); assert.equal(response.status, 201);
  const asset = await response.json(); const document = await fetch(`${base}${asset.url}`);
  assert.equal(document.status, 200);
  const policy = document.headers.get('content-security-policy');
  assert.match(policy, /sandbox allow-scripts;/);
  assert.doesNotMatch(policy, /allow-same-origin/);
  assert.match(policy, /connect-src http:\/\/127.0.0.1:\d+\/api\/mission-files\//);
  assert.equal(document.headers.get('x-frame-options'), 'SAMEORIGIN');
  const packed = await storeZip('pack.zip', archive());
  const module = await fetch(new URL('scripts/map.js', `${base}${packed.url}`));
  assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal(module.headers.get('access-control-allow-origin'), '*');
  const audio = await fetch(new URL('Ace combat briefing.mp3', `${base}${packed.url}`)); assert.equal(audio.status, 200);
});
test('image upload validates signature and returns an image MIME type', async () => {
  await assert.rejects(files.uploadMissionAsset(admin.id, 'image', 'fake.png', Buffer.from('<script>alert(1)</script>')));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1kAAAAASUVORK5CYII=', 'base64');
  const asset = await files.uploadMissionAsset(admin.id, 'image', 'map.png', png);
  const response = await fetch(`${base}${asset.url}`); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
});

test('larger media is stored and read intact across database chunks', async () => {
  const media = Buffer.alloc(700 * 1024, 73);
  const asset = await storeZip('media.zip', zip([['index.html', '<audio src="music.mp3"></audio>'], ['music.mp3', media]]));
  const response = await fetch(new URL('music.mp3', `${base}${asset.url}`));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), media);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  const audioUrl = new URL('music.mp3', `${base}${asset.url}`);
  const partial = await fetch(audioUrl, { headers: { Range: 'bytes=262140-262150' } });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), `bytes 262140-262150/${media.length}`);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), media.subarray(262140, 262151));
  const suffix = await fetch(audioUrl, { headers: { Range: 'bytes=-10' } });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), media.subarray(-10));
  const invalid = await fetch(audioUrl, { headers: { Range: `bytes=${media.length}-` } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), `bytes */${media.length}`);

  const originalQuery = db.query;
  const readChunks = [];
  db.query = async (sql, parameters) => {
    if (sql.startsWith('select content from mission_asset_chunks')) readChunks.push(parameters[2]);
    return originalQuery(sql, parameters);
  };
  try {
    const crossing = await fetch(audioUrl, { headers: { Range: 'bytes=262140-262150' } });
    assert.deepEqual(Buffer.from(await crossing.arrayBuffer()), media.subarray(262140, 262151));
    assert.deepEqual(readChunks, [0, 1]);
    readChunks.length = 0;
    const ending = await fetch(audioUrl, { headers: { Range: 'bytes=-10' } });
    assert.deepEqual(Buffer.from(await ending.arrayBuffer()), media.subarray(-10));
    assert.deepEqual(readChunks, [2]);
    readChunks.length = 0;
    assert.equal((await fetch(audioUrl, { headers: { Range: `bytes=${media.length}-` } })).status, 416);
    assert.deepEqual(readChunks, []);
  } finally { db.query = originalQuery; }
});

test('envio separado: HTML solto e música (MP3) ficam anexados à missão', async () => {
  const html = await files.uploadMissionAsset(admin.id, 'briefing', 'briefing.html', Buffer.from('<!doctype html><html><body>Briefing</body></html>'));
  assert.match(html.url, /index\.html$/);
  const mp3 = await files.uploadMissionAsset(admin.id, 'audio', 'musica.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]));
  assert.match(mp3.url, /music\.mp3$/);
  await assert.rejects(files.uploadMissionAsset(admin.id, 'audio', 'x.mp3', Buffer.from('não é áudio')));
  await assert.rejects(files.uploadMissionAsset(admin.id, 'briefing', 'x.html', Buffer.from('texto qualquer sem html')));
  await missions.createMission(admin, { title: 'Com música', briefing: '', startsAt: new Date(Date.now() + 864e5).toISOString(), defaultPm: null, briefingAssetId: html.id, audioAssetId: mp3.id }, 0);
  const found = (await missions.adminListMissions(50, 0)).items.find((m) => m.title === 'Com música');
  assert.ok(found?.audioAsset?.url.endsWith('music.mp3'));
  assert.ok(found?.briefingAsset?.url.endsWith('index.html'));
});
