import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import fs from 'node:fs/promises';
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '',
  JWT_SECRET: 'pilot-tutorial-secret-at-least-thirty-two-characters', SMTP_HOST: '', SEED_DEMO: 'false',
});
const { db, migrate } = await import('../server/src/db.ts');
const { findUserById, setNickname, setTutorialStatus } = await import('../server/src/services/users.ts');
before(async () => { await migrate(); });
after(async () => { await db.close(); });
const create = async name => (await db.query(
  "insert into users (google_sub,email,status) values ($1,$2,'active') returning *", [name, `${name}@example.invalid`])).rows[0];

test('nickname selection leaves the tutorial pending, and skipping is persisted for that account only', async () => {
  const pilot = await setNickname(await create('Tutorial'), 'Tutorial');
  const otherPilot = await setNickname(await create('OtherTutorial'), 'OtherTutorial');
  assert.equal(pilot.tutorial_status, null);
  await setTutorialStatus(pilot, 'skipped');
  assert.equal((await findUserById(pilot.id)).tutorial_status, 'skipped');
  assert.equal((await findUserById(otherPilot.id)).tutorial_status, null);
});

test('replaying can complete a skipped tutorial, and skipping again preserves completion', async () => {
  const pilot = await setNickname(await create('ReplayTutorial'), 'ReplayTutorial');
  await setTutorialStatus(pilot, 'skipped');
  await setTutorialStatus(pilot, 'completed');
  await setTutorialStatus(pilot, 'skipped');
  assert.equal((await findUserById(pilot.id)).tutorial_status, 'completed');
});

test('tutorial choice requires a nickname', async () => {
  const pilot = await create('NoNickname');
  await assert.rejects(setTutorialStatus(pilot, 'skipped'), error => error.code === 'NICKNAME_REQUIRED');
  assert.equal((await findUserById(pilot.id)).tutorial_status, null);
});

test('tutorial media and Portuguese captions are included in the public build assets', async () => {
  const video = await fs.stat(new URL('../web/public/tutorial/apresentacao-v2.mp4', import.meta.url));
  assert.ok(video.size > 1000);
  const captions = await fs.readFile(new URL('../web/public/tutorial/apresentacao-v2.vtt', import.meta.url), 'utf8');
  assert.ok(captions.startsWith('WEBVTT\n'));
  assert.match(captions, /00:00:00\.200 --> 00:00:01\.571/);
});
