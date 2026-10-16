// Todas as rotas da API (/api/...)
import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { fail } from './errors.js';
import { endSession, loadSessionUser, requireAdmin, requireNickname, requireUser, startSession, verifyGoogleToken } from './auth.js';
import { getHistory, getHistoryPage, getNews, isNicknameAvailable, markNewsSeen, setGoal, setNickname, toMe, upsertLogin } from './services/users.js';
import { getTree, getTechTreeState, undoUnlock, unlockAircraft, UNDO_SECONDS } from './services/techtree.js';
import * as admin from './services/admin.js';
import { getAchievements, syncAchievements } from './services/achievements.js';
import { rateLimit } from './security.js';
import { getRanking } from './services/ranking.js';
import { getProfile } from './services/profile.js';

export const api = Router();
const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
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

api.get('/me/history/page', requireUser, requireNickname, async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await getHistoryPage(req.user.id, limit, offset));
});

api.get('/me/achievements', requireUser, requireNickname, async (req, res) => {
  res.json(await getAchievements(req.user));
});

api.get('/ranking', requireUser, requireNickname, async (req, res) => {
  const { limit, offset } = pagination.parse(req.query);
  res.json(await getRanking(req.user, limit, offset));
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

const userIdParam = z.string().uuid();

adminApi.get('/overview', async (_req, res) => {
  res.json(await admin.getOverview());
});

adminApi.get('/activity', async (req, res) => {
  const q = z.object({
    group: z.enum(['players', 'tree', 'settings']).optional(),
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

adminApi.put('/settings', async (req, res) => {
  const body = z.object({ baseMissionPoints: z.number().int().min(0).max(1_000_000) }).parse(req.body);
  await admin.saveSettings(req.user, body);
  res.json({ ok: true });
});
