// Rotas do registro de erros: o navegador reporta (piloto logado) e o admin consulta.
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from './security.js';
import { clearResolved, listErrors, logError, openErrorCount, setResolved } from './services/errorlog.js';

/** POST /api/client-errors (exige login; limitado para ninguém encher o registro) */
export const clientErrorsRouter = Router();
clientErrorsRouter.post('/', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const body = z.object({
    message: z.string().max(500),
    stack: z.string().max(4000).optional(),
    route: z.string().max(200).optional(),
  }).parse(req.body);
  await logError({ source: 'client', message: body.message, stack: body.stack, route: body.route,
    userId: req.user.id, userAgent: req.headers['user-agent'] });
  res.status(204).end();
});

/** /api/admin/errors */
export const adminErrorsRouter = Router();
adminErrorsRouter.get('/', async (req, res) => {
  const q = z.object({
    filter: z.enum(['open', 'resolved', 'all']).default('open'),
    source: z.enum(['all', 'server', 'client', 'mail']).default('all'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  res.json(await listErrors(q.filter, q.source, q.limit, q.offset));
});
adminErrorsRouter.get('/count', async (_req, res) => { res.json({ open: await openErrorCount() }); });
adminErrorsRouter.post('/clear-resolved', async (_req, res) => { res.json({ removed: await clearResolved() }); });
adminErrorsRouter.post('/:id/resolve', async (req, res) => {
  const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
  await setResolved(z.string().regex(/^\d+$/).parse(req.params.id), resolved);
  res.json({ ok: true });
});
