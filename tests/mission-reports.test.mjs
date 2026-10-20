import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', PGLITE_DIR: 'memory://', GOOGLE_CLIENT_ID: '', SEED_DEMO: 'false', SMTP_HOST: '', JWT_SECRET: 'mission-report-isolated-tests-at-least-32-characters' });
const { db, migrate } = await import('../server/src/db.ts');
const { seed } = await import('../server/src/seed.ts');
const reports = await import('../server/src/services/mission-reports.ts');
const missions = await import('../server/src/services/missions.ts');
const scoring = await import('../server/src/services/scoring.ts');
const users = await import('../server/src/services/users.ts');
const { api } = await import('../server/src/routes.ts');
let admin, pilot, absent, extra, server, base, free;
const payload = (report) => ({ version: report.version, rulesFingerprint: report.rulesFingerprint, summary: report.summary, source: report.source,
  pilots: report.pilots.map(({ userId, aircraftId, attended, survived, counts, notes, reviewed }) => ({ userId, aircraftId, attended, survived, counts, notes, reviewed })) });
before(async () => {
  await migrate(); await seed();
  await db.query('update tiers set multiplier=1'); // bônus de aeronave é testado em mission-report-aircraft-bonus.test.mjs
  const make = async (name, role = 'player') => (await db.query('insert into users(google_sub,email,nickname,role) values ($1,$2,$1,$3) returning *', [name, `${name}@example.invalid`, role])).rows[0];
  admin = await make('ReportAdmin', 'admin'); pilot = await make('ReportPilot'); absent = await make('AbsentPilot'); extra = await make('ExtraPilot');
  free = (await db.query('select a.id from aircraft a join tiers t on t.tier=a.tier where t.cost=0 limit 1')).rows[0].id;
  const app = express();
  app.use(/^\/api\/admin\/missions\/[^/]+\/report(?:\/publish)?$/, express.json({ limit: '5mb' }));
  app.use(express.json()); app.use(cookieParser()); app.use('/api', api);
  app.use((error, _req, res, _next) => res.status(error.status || 400).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); await db.close(); });
const headers = (user) => ({ 'Content-Type': 'application/json', ...(user ? { Cookie: `hangar_session=${jwt.sign({ sub: user.id }, process.env.JWT_SECRET)}` } : {}) });
async function fixture() {
  const id = (await db.query("insert into missions(title,starts_at,created_by) values ('Report test','2030-01-01', $1) returning id", [admin.id])).rows[0].id;
  await missions.signUp(pilot, id, free); await missions.signUp(absent, id, free);
  return { id, report: await reports.getMissionReport(admin, id, true) };
}
function complete(report) {
  const body = payload(report);
  body.summary = 'Objetivos cumpridos'; body.source = 'Debriefing do servidor';
  body.pilots[0] = { ...body.pilots[0], attended: true, survived: true, reviewed: true, counts: { ...body.pilots[0].counts, airborneAircraft: 2, sam: 1 } };
  body.pilots[1] = { ...body.pilots[1], attended: false, survived: null, reviewed: true };
  return body;
}

test('drafts are private, credit nothing and freeze the scoring rules', async () => {
  const { id, report } = await fixture();
  assert.equal(report.pilots[0].survived, null);
  const saved = await reports.saveMissionReport(admin, id, complete(report));
  assert.equal(saved.state, 'draft'); assert.equal(saved.pilots[0].total, 900);
  assert.equal(await users.getBalance(pilot.id), 0);
  await assert.rejects(reports.getMissionReport(pilot, id));
  await scoring.saveScoringRules(admin, { ...scoring.DEFAULT_SCORING_RULES, airborneAircraft: 800 });
  const reread = await reports.getMissionReport(admin, id, true);
  assert.equal(reread.rules.airborneAircraft, 200);
  await assert.rejects(reports.saveMissionReport(admin, id, complete(report)), /outro administrador/);
  const published = await reports.saveMissionReport(admin, id, payload(saved), true);
  assert.equal(published.total, 900);
  assert.equal((await reports.getMissionReport(pilot, id)).pilots[0].total, 900);
  await scoring.saveScoringRules(admin, scoring.DEFAULT_SCORING_RULES);
});

test('publication is atomic and idempotent, updates signups and notifies pilots with the report link', async () => {
  const { id, report } = await fixture();
  const body = complete(report);
  const before = await users.getBalance(pilot.id);
  const responses = await Promise.all([reports.saveMissionReport(admin, id, body, true), reports.saveMissionReport(admin, id, body, true)]);
  assert.equal(responses[0].total, 900); assert.equal(responses[1].total, 900);
  assert.equal(await users.getBalance(pilot.id), before + 900);
  const mission = await missions.getMission(pilot, id);
  assert.equal(mission.status, 'closed'); assert.equal(mission.hasReport, true);
  assert.equal(mission.mine.pmAwarded, 900); assert.equal(mission.signups.find((item) => item.userId === absent.id).pmAwarded, 0);
  const published = await reports.getMissionReport(pilot, id);
  assert.equal(published.publishedBy, admin.nickname);
  assert.equal(published.source, 'Debriefing do servidor');
  const news = await users.getNews(pilot);
  assert.ok(news.items.some((item) => item.kind === 'report' && item.missionId === id && item.amount === 900));
  await assert.rejects(reports.saveMissionReport(admin, id, payload(published)), { code: 'MISSION_NOT_OPEN' });
});

test('incomplete, duplicate, forged and missing-roster results cannot publish or change balances', async () => {
  const { id, report } = await fixture(); const body = complete(report);
  const before = await users.getBalance(pilot.id);
  for (const invalid of [payload(report), { ...body, pilots: [body.pilots[0]] }, { ...body, pilots: [...body.pilots, body.pilots[0]] },
    { ...body, pilots: [{ ...body.pilots[0], survived: null }, body.pilots[1]] },
    { ...body, pilots: [{ ...body.pilots[0], total: 999999 }, body.pilots[1]] },
    { ...body, pilots: [body.pilots[0], { ...body.pilots[1], counts: { ...body.pilots[1].counts, sam: 1 } }] }]) {
    await assert.rejects(reports.saveMissionReport(admin, id, invalid, true));
    assert.equal(await users.getBalance(pilot.id), before);
    assert.equal((await missions.getMission(pilot, id)).status, 'scheduled');
  }
  await scoring.saveScoringRules(admin, { ...scoring.DEFAULT_SCORING_RULES, sam: 300 });
  await assert.rejects(reports.saveMissionReport(admin, id, body, true), /regras de pontuação mudaram/);
  await scoring.saveScoringRules(admin, scoring.DEFAULT_SCORING_RULES);
});

test('an administrator can add an unregistered pilot with transport results and no survival bonus', async () => {
  const { id, report } = await fixture(); const body = complete(report);
  const transport = { ...body.pilots[0], userId: extra.id, survived: false, counts: { ...body.pilots[1].counts, cargoTransport: 2 } };
  body.pilots.push(transport);
  const before = await users.getBalance(extra.id);
  const result = await reports.saveMissionReport(admin, id, body, true);
  const extraResult = result.pilots.find((item) => item.userId === extra.id);
  assert.equal(extraResult.total, 1000); assert.equal(extraResult.multiplier, 1);
  assert.equal(await users.getBalance(extra.id), before + 1000);
});

test('HTTP permissions keep editing and drafts admin-only and disable the manual close bypass', async () => {
  const { id, report } = await fixture(); const body = complete(report);
  const path = `${base}/api/admin/missions/${id}/report`;
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: headers(pilot) })).status, 403);
  assert.equal((await fetch(path, { method: 'PUT', headers: headers(pilot), body: JSON.stringify(body) })).status, 403);
  assert.equal((await fetch(`${path}/publish`, { method: 'POST', headers: headers(pilot), body: JSON.stringify(body) })).status, 403);
  const draft = await fetch(path, { method: 'PUT', headers: headers(admin), body: JSON.stringify(body) }); assert.equal(draft.status, 200);
  assert.equal((await fetch(`${base}/api/missions/${id}/report`, { headers: headers(pilot) })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/missions/${id}/close`, { method: 'POST', headers: headers(admin), body: JSON.stringify({ attendees: [{ userId: pilot.id, pm: 999999 }] }) })).status, 400);
  const published = await fetch(`${path}/publish`, { method: 'POST', headers: headers(admin), body: JSON.stringify(payload(await draft.json())) }); assert.equal(published.status, 200);
  assert.equal((await fetch(`${base}/api/missions/${id}/report`, { headers: headers(pilot) })).status, 200);
});

test('drafts accept detailed rosters beyond the default JSON body limit', async () => {
  const { id, report } = await fixture(); const body = complete(report);
  const rows = (await db.query(`insert into users(google_sub,email,nickname)
    select 'large-report-'||item,'large-report-'||item||'@example.invalid','Large'||item from generate_series(1,80) item returning *`)).rows;
  for (const user of rows) body.pilots.push({ ...body.pilots[1], userId: user.id, notes: 'Observações do voo. '.repeat(90) });
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 100 * 1024);
  const response = await fetch(`${base}/api/admin/missions/${id}/report`, { method: 'PUT', headers: headers(admin), body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).pilots.length, 82);
});
