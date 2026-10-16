// Registro de erros: o que dá errado no servidor, no navegador dos pilotos e no envio de e-mails.
// Registrar nunca pode derrubar nem atrasar o sistema: toda falha aqui é engolida.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { fail } from '../errors.js';

export type ErrorSource = 'server' | 'client' | 'mail';

export interface ErrorInput {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  userId?: string | null;
  userAgent?: string | null;
}

const RETENTION_DAYS = 30;
const cut = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

/** Tira números longos, ids e e-mails para que o "mesmo" erro caia no mesmo grupo e não vaze dados pessoais */
function normalize(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d{4,}/g, '<n>');
}

export async function logError(input: ErrorInput): Promise<void> {
  try {
    const message = normalize(cut(input.message, 500) || 'Erro sem mensagem');
    const stack = input.stack ? normalize(cut(input.stack, 4000) || '') : null;
    const topFrame = stack?.split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
    const route = cut(input.route, 200);
    const fingerprint = crypto.createHash('sha1')
      .update([input.source, message, topFrame.trim(), route ?? ''].join('|')).digest('hex');
    await db.query(
      `insert into error_log (fingerprint, source, message, stack, route, method, status, user_id, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (fingerprint) do update
         set count = error_log.count + 1, last_seen = now(), resolved = false,
             user_id = coalesce(excluded.user_id, error_log.user_id)`,
      [fingerprint, input.source, message, stack, route, cut(input.method, 10), input.status ?? null,
        input.userId ?? null, cut(input.userAgent, 200)]);
  } catch (e) {
    console.error('[erros] não foi possível registrar o erro:', e instanceof Error ? e.message : e);
  }
}

/** Erro lançado dentro do servidor (rota, tarefa ou envio de e-mail) */
export function logServerError(err: unknown, ctx: { route?: string; method?: string; userId?: string | null; source?: ErrorSource; status?: number } = {}) {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  return logError({ source: ctx.source ?? 'server', message: e.message || e.name, stack: e.stack, route: ctx.route,
    method: ctx.method, status: ctx.status ?? 500, userId: ctx.userId });
}

export interface ErrorRow {
  id: string; source: ErrorSource; message: string; stack: string | null; route: string | null; method: string | null;
  status: number | null; nickname: string | null; userAgent: string | null; count: number; resolved: boolean;
  firstSeen: string; lastSeen: string;
}

export async function listErrors(filter: 'open' | 'resolved' | 'all', source: ErrorSource | 'all', limit: number, offset: number) {
  await db.query(`delete from error_log where last_seen < now() - ($1 || ' days')::interval`, [String(RETENTION_DAYS)]);
  const where = [filter === 'all' ? 'true' : filter === 'open' ? 'not e.resolved' : 'e.resolved', source === 'all' ? 'true' : 'e.source = $3'];
  const params: unknown[] = [limit, offset];
  if (source !== 'all') params.push(source);
  const [rows, counts] = await Promise.all([
    db.query<ErrorRow>(
      `select e.id::text as id, e.source, e.message, e.stack, e.route, e.method, e.status, u.nickname,
              e.user_agent as "userAgent", e.count, e.resolved, e.first_seen as "firstSeen", e.last_seen as "lastSeen"
         from error_log e left join users u on u.id = e.user_id
        where ${where.join(' and ')} order by e.last_seen desc limit $1 offset $2`, params),
    db.query<{ open: number; total: number }>(
      `select count(*) filter (where not resolved)::int as open, count(*)::int as total from error_log`),
  ]);
  return { items: rows.rows, open: counts.rows[0].open, total: counts.rows[0].total, retentionDays: RETENTION_DAYS };
}

export async function openErrorCount(): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from error_log where not resolved');
  return rows[0].n;
}

export async function setResolved(id: string, resolved: boolean) {
  const { rows } = await db.query('update error_log set resolved = $2 where id = $1 returning id', [id, resolved]);
  if (!rows.length) throw fail('NOT_FOUND');
}

export async function clearResolved(): Promise<number> {
  const { rows } = await db.query('delete from error_log where resolved returning id');
  return rows.length;
}
