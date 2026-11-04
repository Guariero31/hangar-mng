// Todas as rotas da API (/api/...)
import { Router, raw } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { fail } from './errors.js';
import { endSession, loadSessionUser, requireAdmin, requireNickname, requireUser, startSession, verifyGoogleToken } from './auth.js';
import { completeTutorialModule, getHistory, getHistoryPage, getNews, isNicknameAvailable, markNewsSeen, setGoal, setNickname, setTutorialStatus, toMe, upsertLogin } from './services/users.js';
import { getTree, getTechTreeState, undoUnlock, unlockAircraft, UNDO_SECONDS } from './services/techtree.js';
import * as admin from './services/admin.js';
import { getAchievements, syncAchievements } from './services/achievements.js';
import { rateLimit } from './security.js';
import { getRanking } from './services/ranking.js';
import { getProfile } from './services/profile.js';
import * as missions from './services/missions.js';
import * as ribbons from './services/ribbons.js';
import { analyzeTacview, nameKey } from './services/tacview.js';
import { adminErrorsRouter, clientErrorsRouter } from './error-routes.js';
import { getMissionAssetDownload, getMissionFile, uploadMissionAsset } from './services/mission-files.js';
import { withBriefingAudioRecovery } from './services/briefing-audio.js';
import { getScoringRules, saveScoringRules } from './services/scoring.js';
import { getMissionReport, saveMissionReport } from './services/mission-reports.js';
import { listMusic, deleteMusic } from './services/music.js';

export const api = Router();
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});

api.get(/^\/mission-files\/([^/]+)\/(.+)$/, async (req, res) => {
  const file = await getMissionFile(req.params[0], req.params[1]);
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'private, no-store');
  const assetRoot = `${new URL(`${req.protocol}://${req.get('host')}`).origin}/api/mission-files/${req.params[0]}/`;
  res.setHeader('Content-Security-Policy', `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' ${assetRoot} https://cdn.jsdelivr.net; style-src 'unsafe-inline' ${assetRoot} https://fonts.googleapis.com; font-src ${assetRoot} https://fonts.gstatic.com; img-src ${assetRoot} data: blob:; media-src ${assetRoot} blob: data:; connect-src ${assetRoot} https://cdn.jsdelivr.net; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`);
  res.type(file.mime);
  if (file.mime.startsWith('audio/')) {
    res.setHeader('Accept-Ranges', 'bytes');
    const ranges = req.range(file.size);
    if (ranges === -1) {
      res.setHeader('Content-Range', `bytes */${file.size}`);
      res.status(416).end();
      return;
    }
    if (ranges && ranges !== -2 && ranges.type === 'bytes' && ranges.length === 1) {
      const { start, end } = ranges[0];
      res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
      res.status(206).send(await file.read({ start, end }));
      return;
    }
  }
  const content = await file.read();
  res.send(file.mime.startsWith('text/html') ? withBriefingAudioRecovery(content) : content);
});

// ------------------------------------------------------------------ autenticação

// Verificação de saúde (Docker/monitoramento): confere se o banco responde
api.get('/health', async (_req, res) => {
  await db.query('select 1');
  res.json({ ok: true });
});

api.get('/auth/config', (_req, res) => {
  res.json({ googleClientId: config.googleClientId || null, devLogin: config.devLogin });
});

api.post('/auth/google', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const { credential } = z.object({ credential: z.string().min(10) }).parse(req.body);
  const profile = await verifyGoogleToken(credential);
  const user = await upsertLogin(profile);
  if (user.status === 'banned') throw fail('BANNED');
  if (user.status === 'rejected') throw fail('REJECTED');
  startSession(res, user.id);
  res.json(await toMe(user));
});

// Login sem Google — só existe enquanto DEV_LOGIN estiver ligado
api.post('/auth/dev', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  if (!config.devLogin) throw fail('DEV_LOGIN_DISABLED');
  const { email, admin: asAdmin } = z.object({
    email: z.string().trim().toLowerCase().email(),
    admin: z.boolean().optional(),
  }).parse(req.body);
  let user = await upsertLogin({ sub: `dev:${email}`, email, name: email.split('@')[0] });
  // admin pelo login de teste: só se o pedido vier desta própria máquina (nunca da rede)
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '') && !req.headers['x-forwarded-for'];
  if (asAdmin && user.role !== 'admin' && local) {
    ({ rows: [user] } = await db.query(`update users set role = 'admin', status = 'active' where id = $1 returning *`, [user.id]));
  }
  if (user.status === 'banned') throw fail('BANNED');
  if (user.status === 'rejected') throw fail('REJECTED');
  startSession(res, user.id);
  res.json(await toMe(user));
});

// Situação do cadastro (a tela "aguardando aprovação" usa isto; funciona também para pendentes)
api.get('/auth/status', async (req, res) => {
  const user = await loadSessionUser(req, res);
  res.json({ status: user.status });
});

api.post('/auth/logout', (_req, res) => {
  endSession(res);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ jogador

api.get('/me', requireUser, async (req, res) => {
  res.json(await toMe(req.user));
});

api.get('/me/nickname-available', requireUser, async (req, res) => {
  const nickname = z.string().default('').parse(req.query.nickname);
  res.json({ available: await isNicknameAvailable(nickname) });
});

api.post('/me/nickname', requireUser, async (req, res) => {
  const { nickname } = z.object({ nickname: z.string() }).parse(req.body);
  const user = await setNickname(req.user, nickname);
  res.json(await toMe(user));
});

api.get('/me/history', requireUser, requireNickname, async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await getHistory(req.user.id, limit, offset));
});

api.post('/me/tutorial', requireUser, requireNickname, async (req, res) => {
  const { status } = z.object({ status: z.enum(['completed', 'skipped']) }).parse(req.body);
  res.json(await toMe(await setTutorialStatus(req.user, status)));
});

api.post('/me/tutorial/modules/:moduleId', requireUser, requireNickname, async (req, res) => {
  const moduleId = z.coerce.number().int().min(1).max(3).parse(req.params.moduleId);
  res.json(await toMe(await completeTutorialModule(req.user, moduleId)));
});

api.get('/me/history/page', requireUser, requireNickname, async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await getHistoryPage(req.user.id, limit, offset));
});

api.get('/me/achievements', requireUser, requireNickname, async (req, res) => {
  res.json(await getAchievements(req.user));
});

api.get('/ranking', requireUser, requireNickname, async (req, res) => {
  const { limit, offset, period } = pagination.extend({ period: z.enum(['all', 'month']).default('all') }).parse(req.query);
  res.json(await getRanking(req.user, limit, offset, period));
});

api.get('/me/profile', requireUser, requireNickname, async (req, res) => {
  res.json(await getProfile(req.user));
});

api.get('/techtree', requireUser, requireNickname, async (req, res) => {
  res.json(await getTechTreeState(req.user.id));
});

api.post('/techtree/unlock', requireUser, requireNickname, async (req, res) => {
  const { aircraftId } = z.object({ aircraftId: z.string().min(1) }).parse(req.body);
  const balance = await unlockAircraft(req.user.id, aircraftId);
  const { fresh } = await syncAchievements(req.user);
  res.json({ balance, undoSeconds: UNDO_SECONDS, achievements: fresh });
});

api.post('/techtree/undo', requireUser, requireNickname, async (req, res) => {
  const { aircraftId } = z.object({ aircraftId: z.string().min(1) }).parse(req.body);
  const balance = await undoUnlock(req.user.id, aircraftId);
  await syncAchievements(req.user);
  res.json({ balance });
});

api.put('/me/goal', requireUser, requireNickname, async (req, res) => {
  const { aircraftId } = z.object({ aircraftId: z.string().min(1).nullable() }).parse(req.body);
  await syncAchievements(req.user); // grava "Meta Definida" antes de trocar a meta
  await setGoal(req.user, aircraftId);
  res.json({ ok: true });
});

api.get('/missions', requireUser, requireNickname, async (req, res) => {
  res.json(await missions.listMissions(req.user));
});

const missionAddress = z.string().min(1).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
api.get('/missions/:id', requireUser, requireNickname, async (req, res) => {
  res.json(await missions.getMission(req.user, missionAddress.parse(req.params.id)));
});

api.get('/missions/:id/report', requireUser, requireNickname, async (req, res) => {
  res.json(await getMissionReport(req.user, await missions.resolveMissionId(missionAddress.parse(req.params.id))));
});

api.put('/missions/:id/signup', requireUser, requireNickname, async (req, res) => {
  const { aircraftId } = z.object({ aircraftId: z.string().min(1) }).parse(req.body);
  await missions.signUp(req.user, z.string().uuid().parse(req.params.id), aircraftId);
  res.json({ ok: true });
});

api.delete('/missions/:id/signup', requireUser, requireNickname, async (req, res) => {
  await missions.cancelSignup(req.user, z.string().uuid().parse(req.params.id));
  res.json({ ok: true });
});

api.get('/me/news', requireUser, requireNickname, async (req, res) => {
  res.json(await getNews(req.user));
});

api.post('/me/news/seen', requireUser, async (req, res) => {
  await markNewsSeen(req.user);
  res.json({ ok: true });
});

// ------------------------------------------------------------------ admin

const adminApi = Router();
api.use('/admin', requireUser, requireNickname, requireAdmin, adminApi);
adminApi.use('/errors', adminErrorsRouter);
api.use('/client-errors', requireUser, clientErrorsRouter);

adminApi.post('/mission-files/:kind', rateLimit({ windowMs: 60_000, max: 10 }), raw({ type: 'application/octet-stream', limit: '25mb' }), async (req, res) => {
  const kind = z.enum(['image', 'briefing', 'audio']).parse(req.params.kind);
  const name = z.string().trim().min(1).max(160).parse(req.query.name);
  if (!Buffer.isBuffer(req.body)) throw fail('VALIDATION', 'Envie o arquivo como conteúdo binário.');
  res.status(201).json(await uploadMissionAsset(req.user.id, kind, name, req.body));
});

const userIdParam = z.string().uuid();

adminApi.get('/music', async (_req, res) => { res.json(await listMusic()); });
adminApi.delete('/music/:id', async (req, res) => {
  await deleteMusic(userIdParam.parse(req.params.id));
  res.json({ ok: true });
});

adminApi.get('/mission-files/:id/download', async (req, res) => {
  const file = await getMissionAssetDownload(userIdParam.parse(req.params.id));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.attachment(file.name).type('application/octet-stream').send(file.content);
});

adminApi.get('/overview', async (_req, res) => {
  res.json(await admin.getOverview());
});

api.get('/missions/:id/awards', requireUser, requireNickname, async (req, res) => { res.json(await ribbons.listMissionAwardsPublic(await missions.resolveMissionId(missionAddress.parse(req.params.id)))); });
const ribbonBody = z.object({
  name: z.string().trim().min(2).max(80), description: z.string().max(500).default(''),
  category: z.enum(ribbons.RIBBON_CATEGORIES), precedence: z.number().int().min(1).max(9999).default(100),
  allowsValor: z.boolean().default(false), active: z.boolean().default(true),
});
adminApi.get('/ribbons', async (_req, res) => { res.json(await ribbons.listRibbons()); });
adminApi.post('/ribbons', async (req, res) => { res.status(201).json({ id: await ribbons.createRibbon(req.user, ribbonBody.parse(req.body)) }); });
adminApi.put('/ribbons/:id', async (req, res) => { await ribbons.updateRibbon(req.user, userIdParam.parse(req.params.id), ribbonBody.parse(req.body)); res.json({ ok: true }); });
adminApi.delete('/ribbons/:id', async (req, res) => { await ribbons.deleteRibbon(req.user, userIdParam.parse(req.params.id)); res.json({ ok: true }); });
adminApi.post('/ribbons/:id/image', rateLimit({ windowMs: 60_000, max: 20 }), raw({ type: 'application/octet-stream', limit: '200kb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw fail('VALIDATION', 'Envie o PNG como conteúdo binário.');
  await ribbons.setRibbonImage(req.user, userIdParam.parse(req.params.id), req.body);
  res.status(201).json({ ok: true });
});
api.get('/ribbons/:id/image', requireUser, async (req, res) => {
  const image = await ribbons.getRibbonImage(userIdParam.parse(req.params.id));
  res.type('image/png').setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(image);
});

adminApi.get('/scoring', async (_req, res) => { res.json(await getScoringRules()); });
adminApi.put('/scoring', async (req, res) => { res.json(await saveScoringRules(req.user, req.body)); });

adminApi.get('/activity', async (req, res) => {
  const q = z.object({
    group: z.enum(['players', 'tree', 'missions', 'settings']).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  res.json(await admin.getActivity(q.group ?? null, q.limit, q.offset));
});

adminApi.get('/players', async (req, res) => {
  const q = z.object({
    search: z.string().trim().optional(),
    filter: z.enum(['all', 'active', 'banned', 'nonick', 'admin']).default('all'),
    sort: z.enum(['earned', 'balance', 'aircraftCount', 'nickname', 'lastLoginAt', 'createdAt']).default('earned'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  res.json(await admin.listPlayers(q.search || null, q.limit, q.offset, q));
});

adminApi.get('/approvals', async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await admin.listApprovals(limit, offset));
});

adminApi.post('/approvals/:id', async (req, res) => {
  const { decision } = z.object({ decision: z.enum(['approve', 'reject']) }).parse(req.body);
  await admin.decideApproval(req.user, userIdParam.parse(req.params.id), decision);
  res.json({ ok: true });
});

adminApi.get('/players/:id', async (req, res) => {
  res.json(await admin.playerDetail(userIdParam.parse(req.params.id)));
});

adminApi.put('/players/:id/nickname', async (req, res) => {
  const { nickname } = z.object({ nickname: z.string() }).parse(req.body);
  await admin.renamePlayer(req.user, userIdParam.parse(req.params.id), nickname);
  res.json({ ok: true });
});

adminApi.post('/points/batch', async (req, res) => {
  const { userIds, amount, reason } = z.object({
    userIds: z.array(z.string().uuid()).min(1).max(500),
    amount: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().max(200),
  }).parse(req.body);
  res.json(await admin.addPointsBatch(req.user, userIds, amount, reason));
});

adminApi.post('/players/:id/points', async (req, res) => {
  const { amount, reason } = z.object({
    amount: z.number().int().min(-1_000_000).max(1_000_000),
    reason: z.string().max(200),
  }).parse(req.body);
  const balance = await admin.addPoints(req.user, userIdParam.parse(req.params.id), amount, reason);
  res.json({ balance });
});

adminApi.post('/players/:id/aircraft', async (req, res) => {
  const { aircraftId } = z.object({ aircraftId: z.string().min(1) }).parse(req.body);
  await admin.grantAircraft(req.user, userIdParam.parse(req.params.id), aircraftId);
  res.json({ ok: true });
});

adminApi.delete('/players/:id/aircraft/:aircraftId', async (req, res) => {
  const refund = req.query.refund === 'true';
  await admin.revokeAircraft(req.user, userIdParam.parse(req.params.id), String(req.params.aircraftId), refund);
  res.json({ ok: true });
});

adminApi.patch('/players/:id', async (req, res) => {
  const body = z.object({
    status: z.enum(['active', 'banned']).optional(),
    role: z.enum(['player', 'admin']).optional(),
  }).parse(req.body);
  const id = userIdParam.parse(req.params.id);
  if (body.status) await admin.setStatus(req.user, id, body.status);
  if (body.role) await admin.setRole(req.user, id, body.role);
  res.json({ ok: true });
});

adminApi.delete('/players/:id', async (req, res) => {
  await admin.deleteUser(req.user, userIdParam.parse(req.params.id));
  res.json({ ok: true });
});

const aircraftBody = z.object({
  name: z.string().trim().min(1).max(60),
  tier: z.number().int().min(1).max(50),
  role: z.enum(['fighter', 'multi', 'attack', 'aheli', 'theli', 'tplane']),
  row: z.number().int().min(0).max(200),
  icon: z.string().trim().max(60).nullable().optional(),
  restriction: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  bound: z.array(z.string()).default([]),
  parents: z.array(z.string()).default([]),
});

// Árvore completa (inclui aeronaves inativas), tiers, faixas e configurações
const missionBody = z.object({
  imageAssetId: z.string().uuid().nullable().default(null),
  briefingAssetId: z.string().uuid().nullable().default(null),
  audioAssetId: z.string().uuid().nullable().default(null),
  tier: z.number().int().min(1).nullable().default(null),
  ribbonIds: z.array(z.string().uuid()).max(12).optional(),
  title: z.string().trim().min(1).max(80),
  briefing: z.string().max(2000).default(''),
  mapName: z.string().trim().max(80).default(''),
  briefingImageUrl: z.union([z.literal(''), z.string().trim().max(2000).url().refine((value) => value.startsWith('https://'), 'Use uma imagem com endereço HTTPS.')]).default(''),
  startsAt: z.string().datetime({ offset: true }),
  defaultPm: z.number().int().min(0).max(1_000_000).nullable().default(null),
});

adminApi.get('/missions', async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await missions.adminListMissions(limit, offset));
});

adminApi.post('/missions', async (req, res) => {
  const repeatWeeks = z.number().int().min(0).max(12).default(0).parse(req.body?.repeatWeeks);
  res.json(await missions.createMission(req.user, missionBody.parse(req.body), repeatWeeks));
});

adminApi.put('/missions/:id', async (req, res) => {
  await missions.updateMission(req.user, z.string().uuid().parse(req.params.id), missionBody.parse(req.body));
  res.json({ ok: true });
});

adminApi.delete('/missions/:id/signups/:userId', async (req, res) => {
  res.json(await missions.removeSignup(req.user, z.string().uuid().parse(req.params.id), z.string().uuid().parse(req.params.userId)));
});

adminApi.post('/missions/:id/cancel', async (req, res) => {
  await missions.cancelMission(req.user, z.string().uuid().parse(req.params.id));
  res.json({ ok: true });
});

adminApi.delete('/missions/:id', async (req, res) => {
  await missions.deleteMission(req.user, z.string().uuid().parse(req.params.id));
  res.json({ ok: true });
});

adminApi.post('/missions/:id/close', async (_req, _res) => {
  throw fail('VALIDATION', 'Finalize a missão publicando o relatório pós-missão. Atualize a página para usar o novo formulário.');
});

adminApi.get('/missions/:id/report', async (req, res) => {
  res.json(await getMissionReport(req.user, z.string().uuid().parse(req.params.id), true));
});
adminApi.put('/missions/:id/report', async (req, res) => {
  res.json(await saveMissionReport(req.user, z.string().uuid().parse(req.params.id), req.body));
});
adminApi.post('/missions/:id/report/tacview', rateLimit({ windowMs: 60_000, max: 6 }), raw({ type: 'application/octet-stream', limit: '60mb' }), async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail('VALIDATION', 'Envie o arquivo do Tacview como conteúdo binário.');
  const mission = await missions.getMission(req.user, id);
  const analysis = await analyzeTacview(req.body, mission.signups.map((s) => s.nickname));
  // liga cada piloto do arquivo a um inscrito: nome igual, ou um contido no outro (ex.: "HRP | Mr. Magoo" x "Mr_Magoo")
  const matches = analysis.pilots.map((p) => {
    const exact = mission.signups.find((s) => nameKey(s.nickname) === p.key);
    const loose = exact ?? mission.signups.find((s) => { const k = nameKey(s.nickname); return k.length >= 3 && p.key.length >= 3 && (p.key.includes(k) || k.includes(p.key)); });
    return { key: p.key, userId: loose?.userId ?? null };
  });
  res.json({ analysis, matches });
});
adminApi.post('/missions/:id/report/publish', async (req, res) => {
  res.json(await saveMissionReport(req.user, z.string().uuid().parse(req.params.id), req.body, true));
});

const awardsBody = z.object({ awards: z.array(z.object({ userId: z.string().uuid(), ribbonId: z.string().uuid(), valor: z.boolean().default(false) })).max(500) });
adminApi.get('/missions/:id/awards', async (req, res) => { res.json(await ribbons.getMissionAwards(userIdParam.parse(req.params.id))); });
adminApi.put('/missions/:id/awards', async (req, res) => { res.json(await ribbons.saveMissionAwards(req.user, userIdParam.parse(req.params.id), awardsBody.parse(req.body).awards)); });

adminApi.put('/missions/:id/ribbons', async (req, res) => {
  await missions.reviewMissionRibbons(req.user, userIdParam.parse(req.params.id), z.object({ ribbonIds: z.array(z.string().uuid()).max(12) }).parse(req.body).ribbonIds);
  res.json({ ok: true });
});

adminApi.get('/tree', async (_req, res) => {
  res.json(await getTree());
});

adminApi.post('/aircraft', async (req, res) => {
  const body = aircraftBody.extend({
    id: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,32}$/, 'ID: 2 a 32 caracteres, letras minúsculas, números, - ou _'),
  }).parse(req.body);
  await admin.createAircraft(req.user, body.id, body);
  res.status(201).json({ ok: true });
});

adminApi.put('/aircraft/:id', async (req, res) => {
  await admin.updateAircraft(req.user, String(req.params.id), aircraftBody.parse(req.body));
  res.json({ ok: true });
});

const tierBody = z.object({
  label: z.string().trim().min(1).max(10),
  cost: z.number().int().min(0).max(10_000_000),
  multiplier: z.number().min(0.01).max(99),
});

adminApi.post('/tiers', async (req, res) => {
  const body = tierBody.extend({ tier: z.number().int().min(1).max(50) }).parse(req.body);
  await admin.saveTier(req.user, body.tier, body, true);
  res.status(201).json({ ok: true });
});

adminApi.put('/tiers/:tier', async (req, res) => {
  await admin.saveTier(req.user, z.coerce.number().int().parse(req.params.tier), tierBody.parse(req.body), false);
  res.json({ ok: true });
});

