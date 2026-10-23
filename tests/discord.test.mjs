import assert from 'node:assert/strict';
import { before, after, test, mock } from 'node:test';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'discord-test-secret-at-least-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false',
  DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456/test-token', APP_URL: 'https://hangar.example' });
const { db, migrate } = await import('../server/src/db.ts');
const { config } = await import('../server/src/config.ts');
const { createMission, updateMission, cancelMission } = await import('../server/src/services/missions.ts');
const { enqueueMissionDiscord, deliverDiscordNotifications } = await import('../server/src/services/discord-notifications.ts');
const { sendDiscord, missionDiscordPayload } = await import('../server/src/services/discord-webhook.ts');
let admin;
before(async () => {
  await migrate(); config.discordNotificationsEnabled = true;
  admin = (await db.query("insert into users (google_sub,email,nickname,role,status) values ('DiscordAdmin','discord@example.invalid','DiscordAdmin','admin','active') returning *")).rows[0];
});
after(async () => { mock.restoreAll(); await db.close(); });
const input = title => ({ title, briefing: 'Briefing', startsAt: '2035-01-01T22:00:00Z', mapName: 'Syria', defaultPm: null });
const job = async id => (await db.query('select * from discord_notifications where mission_id=$1', [id])).rows[0];

test('mission creation queues exactly one announcement per series; edits and repeated enqueue do not duplicate it', async () => {
  const { ids } = await createMission(admin, input('Série'), 2);
  assert.equal((await job(ids[0])).copies, 3);
  assert.equal(await job(ids[1]), undefined);
  await db.tx(query => enqueueMissionDiscord(query, ids[0], 3));
  await updateMission(admin, ids[0], input('Série atualizada'));
  const requests = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ id: 'message-1' });
  });
  await Promise.all([deliverDiscordNotifications(), deliverDiscordNotifications()]);
  await deliverDiscordNotifications();
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\?wait=true$/);
  assert.equal(requests[0].body.embeds[0].title, 'Nova missão · Série atualizada');
  assert.equal(requests[0].body.embeds[0].url, 'https://hangar.example/missoes/serie');
  assert.deepEqual(requests[0].body.allowed_mentions, { parse: [] });
  assert.equal((await job(ids[0])).state, 'sent');
  fetchMock.mock.restore();
});

test('failed transactions do not leave announcements and disabled integration does not queue', async () => {
  const { ids: [id] } = await createMission(admin, input('Rollback'), 0);
  await db.query('delete from discord_notifications where mission_id=$1', [id]);
  await assert.rejects(db.tx(async query => { await enqueueMissionDiscord(query, id, 1); throw new Error('rollback'); }));
  assert.equal(await job(id), undefined);
  config.discordNotificationsEnabled = false;
  const { ids: [disabledId] } = await createMission(admin, input('Desligado'), 0);
  assert.equal(await job(disabledId), undefined);
  config.discordNotificationsEnabled = true;
});

test('mission cover is uploaded as a Discord attachment without exposing a signed site URL', async () => {
  const { uploadMissionAsset } = await import('../server/src/services/mission-files.ts');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG6kAAAAASUVORK5CYII=', 'base64');
  const cover = await uploadMissionAsset(admin.id, 'image', 'capa.png', png);
  const { ids: [id] } = await createMission(admin, { ...input('Com imagem'), imageAssetId: cover.id }, 0);
  const fetchMock = mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.ok(options.body instanceof FormData);
    assert.equal(options.headers, undefined);
    const payload = JSON.parse(options.body.get('payload_json'));
    assert.deepEqual(payload.embeds[0].image, { url: 'attachment://missao.png' });
    assert.deepEqual(payload.attachments, [{ id: 0, filename: 'missao.png' }]);
    const attachment = options.body.get('files[0]');
    assert.equal(attachment.type, 'image/png');
    assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), png);
    assert.ok(!JSON.stringify(payload).includes('mission-files'));
    return Response.json({ id: 'with-cover' });
  });
  await deliverDiscordNotifications();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal((await job(id)).state, 'sent');
  fetchMock.mock.restore();
});

test('temporary failure retains the mission and retries; cancellation suppresses queued announcements', async () => {
  const { ids: [id] } = await createMission(admin, input('Tentar novamente'), 0);
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('', { status: 500 }));
  await deliverDiscordNotifications();
  assert.equal((await job(id)).state, 'pending');
  assert.equal((await job(id)).last_error, 'Discord HTTP 500.');
  await deliverDiscordNotifications();
  assert.equal(fetchMock.mock.callCount(), 1);
  await db.query('update discord_notifications set next_attempt_at=now() where mission_id=$1', [id]);
  fetchMock.mock.mockImplementation(async () => Response.json({ id: 'retried' }));
  await deliverDiscordNotifications();
  assert.equal((await job(id)).state, 'sent');
  const { ids: [cancelled] } = await createMission(admin, input('Cancelada'), 0);
  await cancelMission(admin, cancelled);
  await deliverDiscordNotifications();
  assert.equal((await job(cancelled)).state, 'skipped');
  assert.equal(fetchMock.mock.callCount(), 2);
  fetchMock.mock.restore();
});

test('rate limit blocks the channel until retry time and invalid webhook URLs never fetch', async () => {
  const { ids: [id] } = await createMission(admin, input('Limite'), 0);
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ retry_after: 120 }, { status: 429 }));
  await deliverDiscordNotifications();
  await createMission(admin, input('Aguardar canal'), 0);
  await deliverDiscordNotifications();
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.ok(new Date((await job(id)).next_attempt_at).getTime() - Date.now() > 110_000);
  const configured = config.discordWebhookUrl;
  config.discordWebhookUrl = 'https://example.invalid/private-token';
  await assert.rejects(sendDiscord(missionDiscordPayload({ id, title: 'Teste', startsAt: new Date('2035-01-01T22:00:00Z'), mapName: '', copies: 1 })), error => error.message === 'Webhook do Discord ausente ou inválido.');
  assert.equal(fetchMock.mock.callCount(), 1);
  config.discordWebhookUrl = configured;
  fetchMock.mock.restore();
});
