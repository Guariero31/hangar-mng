import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import sharp from 'sharp';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'mission-preview-tests-with-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false', APP_URL: 'https://hangar.example' });
const { db, migrate } = await import('../server/src/db.ts');
const { missionPreviewRoutes } = await import('../server/src/mission-preview-routes.ts');
const { api } = await import('../server/src/routes.ts');
const missions = await import('../server/src/services/missions.ts');
const files = await import('../server/src/services/mission-files.ts');
let admin, server, base;
const shell = '<!doctype html><html><head><title>Hangar MNG</title><script type="module" src="/app.js"></script></head><body><div id="root"></div></body></html>';
const input = title => ({ title, briefing: 'BRIEFING PRIVADO NAO PUBLICAR', startsAt: '2035-01-01T22:00:00Z', defaultPm: null, mapName: 'Caucasus' });
before(async () => {
  await migrate();
  admin = (await db.query("insert into users(google_sub,email,nickname,role,status) values('PreviewAdmin','preview@example.invalid','PreviewAdmin','admin','active') returning *")).rows[0];
  const app = express();
  app.use(missionPreviewRoutes(shell));
  app.use('/api', api);
  app.use((_req, res) => res.status(404).end());
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await db.close(); });

test('anonymous crawlers receive escaped metadata and app shell without private mission information', async () => {
  const title = 'Voo $& <script>alert(1)</script> "teste"';
  const { ids: [id] } = await missions.createMission(admin, input(title), 0);
  const mission = await missions.getMission(admin, id);
  for (const address of [id, mission.slug]) {
    const response = await fetch(`${base}/missoes/${address}`, { headers: { 'User-Agent': 'WhatsApp/2' } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /property="og:title" content="Voo \$&amp; &lt;script&gt;/);
    assert.match(html, new RegExp(`property="og:url" content="https://hangar.example/missoes/${mission.slug}"`));
    assert.match(html, /19:00/);
    assert.match(html, /Caucasus/);
    assert.match(html, /Inscrições abertas/);
    assert.match(html, /id="root"/);
    assert.match(html, /src="\/app.js"/);
    assert.equal((html.match(/<title>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /BRIEFING PRIVADO|preview@example|PreviewAdmin|alert\(1\)<\/script>/);
  }
  assert.equal((await fetch(`${base}/api/missions/${id}`)).status, 401);
});

test('mission cover is publicly available as a small JPEG without signed links and original remains intact', async () => {
  const content = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#234567' } }).png().toBuffer();
  const asset = await files.uploadMissionAsset(admin.id, 'image', 'Capa.png', content);
  const { ids: [id] } = await missions.createMission(admin, { ...input('Missão com capa'), imageAssetId: asset.id }, 0);
  const html = await (await fetch(`${base}/missoes/${id}`)).text();
  const imageUrl = html.match(/property="og:image" content="([^"]+)"/)[1].replaceAll('&amp;', '&');
  assert.ok(imageUrl.endsWith(`image.jpg?image=${asset.id}`));
  assert.ok(!imageUrl.includes('mission-files/'));
  const response = await fetch(`${base}${new URL(imageUrl).pathname}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/jpeg/);
  const jpeg = Buffer.from(await response.arrayBuffer());
  assert.ok(jpeg.length < 300000);
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.deepEqual((await files.getMissionAssetDownload(asset.id)).content, content);
  const again = Buffer.from(await (await fetch(`${base}${new URL(imageUrl).pathname}`)).arrayBuffer());
  assert.deepEqual(again, jpeg);
});

test('missing missions and non-image attachments cannot be used as public image endpoints', async () => {
  const asset = await files.uploadMissionAsset(admin.id, 'briefing', 'secreto.html', Buffer.from('<html>PRIVADO</html>'));
  assert.equal((await fetch(`${base}/api/mission-previews/${asset.id}/image.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/missoes/inexistente`)).status, 404);
  const { ids: [id] } = await missions.createMission(admin, { ...input('Sem capa'), briefingAssetId: asset.id }, 0);
  const html = await (await fetch(`${base}/missoes/${id}`)).text();
  assert.match(html, /property="og:image" content="https:\/\/hangar.example\/mng-logo.png"/);
  assert.equal((await fetch(`${base}/api/mission-previews/${id}/image.jpg`)).status, 404);
  await db.query("update missions set status='cancelled' where id=$1", [id]);
  const cancelled = await (await fetch(`${base}/missoes/${id}`)).text();
  assert.match(cancelled, /Operação cancelada/);
  assert.doesNotMatch(cancelled, /Inscrições abertas/);
});
