import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import { fail } from './errors.js';
import { findUserById, type User } from './services/users.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user: User }
  }
}

const COOKIE = 'hangar_session';

export function startSession(res: Response, userId: string) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function endSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

const google = new OAuth2Client();

/** Valida o ID token que o botão do Google entrega ao front-end */
export async function verifyGoogleToken(idToken: string) {
  if (!config.googleClientId) throw fail('GOOGLE_NOT_CONFIGURED');
  try {
    const ticket = await google.verifyIdToken({ idToken, audience: config.googleClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || p.email_verified === false) throw new Error('payload incompleto');
    return { sub: p.sub, email: p.email, name: p.name ?? null, picture: p.picture ?? null };
  } catch {
    throw fail('GOOGLE_INVALID');
  }
}

/** Lê a sessão e devolve o usuário (qualquer status, menos suspenso). */
export async function loadSessionUser(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw fail('NOT_AUTHENTICATED');
  let userId: string | undefined;
  try {
    userId = (jwt.verify(token, config.jwtSecret) as jwt.JwtPayload).sub;
  } catch {
    endSession(res);
    throw fail('NOT_AUTHENTICATED');
  }
  const user = userId ? await findUserById(userId) : null;
  if (!user) { endSession(res); throw fail('NOT_AUTHENTICATED'); }
  if (user.status === 'banned') { endSession(res); throw fail('BANNED'); }
  return user;
}

/** Exige usuário logado e aprovado. Disponibiliza req.user. */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await loadSessionUser(req, res);
  if (user.status === 'pending') throw fail('PENDING_APPROVAL');
  if (user.status === 'rejected') throw fail('REJECTED');
  req.user = user;
  next();
}

export function requireNickname(req: Request, _res: Response, next: NextFunction) {
  if (!req.user.nickname) throw fail('NICKNAME_REQUIRED');
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== 'admin') throw fail('FORBIDDEN');
  next();
}
