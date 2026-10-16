import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Cabeçalhos de segurança básicos (equivalente enxuto ao helmet). */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; " +
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  );
  next();
};

/** Limite simples de requisições por IP, em memória. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || 'x';
    let h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, (h = { n: 0, reset: now + windowMs }));
    h.n++;
    if (h.n > max) {
      res.setHeader('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Muitas requisições. Aguarde um instante.' } });
      return;
    }
    next();
  };
}
