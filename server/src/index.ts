import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config, SERVER_ROOT } from './config.js';
import { db, migrate } from './db.js';
import { seed } from './seed.js';
import { AppError } from './errors.js';
import { api } from './routes.js';
import { rateLimit, securityHeaders } from './security.js';
import { drainServer } from './shutdown.js';
import { logServerError } from './services/errorlog.js';
import { startAchievementRefresh } from './services/achievement-refresh.js';
import { startDiscordNotifications } from './services/discord-notifications.js';

console.log('\n  Hangar MNG — API');
console.log(`  banco: ${db.kind === 'pglite' ? `Postgres embutido (${path.relative(process.cwd(), config.pgliteDir)})` : 'PostgreSQL'}`);
await migrate();
await seed();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(securityHeaders);
app.use('/api', rateLimit({ windowMs: 60_000, max: 240 }));
// Reports can include up to 500 pilots with individual notes.
app.use(/^\/api\/admin\/missions\/[^/]+\/report(?:\/publish)?$/, express.json({ limit: '5mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api', api);
app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }); });

// Em produção o próprio servidor entrega o site React já compilado (web/dist)
const webDist = path.resolve(SERVER_ROOT, '../web/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({ error: { code: 'VALIDATION', message: first?.message || 'Dados inválidos.', details: err.issues } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Dados grandes demais.' } });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'JSON inválido.' } });
    return;
  }
  console.error(err);
  void logServerError(err, { route: req.originalUrl.split('?')[0], method: req.method, userId: (req as { user?: { id: string } }).user?.id });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erro interno no servidor.' } });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`  API ouvindo em http://${config.host}:${config.port}`);
  console.log(`  login: ${config.googleClientId ? 'Google' : ''}${config.googleClientId && config.devLogin ? ' + ' : ''}${config.devLogin ? 'desenvolvimento (sem Google)' : ''}\n`);
});

const stopAchievementRefresh = startAchievementRefresh();
const stopDiscordNotifications = startDiscordNotifications();
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await drainServer(server, async () => { await stopDiscordNotifications(); await stopAchievementRefresh(); await db.close(); });
    process.exitCode = 0;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
// Erro que escapou de tudo: registra e sai (o Docker reinicia o servidor), como o Node faria sozinho
for (const event of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(event, (err) => {
    console.error(`[${event}]`, err);
    void logServerError(err, { route: event }).finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 3000).unref();
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
