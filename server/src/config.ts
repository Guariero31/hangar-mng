import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pasta raiz do servidor (server/), tanto rodando de src/ quanto de dist/ */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const env = process.env;
const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'sim', 'yes'].includes(value.toLowerCase());

const PLACEHOLDER_SECRETS = ['troque-isto-por-um-texto-longo-e-aleatorio', 'dev-secret-troque-isto-em-producao', 'changeme', 'secret'];
const isWeakSecret = (v: string | undefined) => !v || v.length < 32 || PLACEHOLDER_SECRETS.includes(v.trim());

/** Sem segredo válido no .env: gera um aleatório e guarda em server/data (só para uso local). */
function localSecret(): string {
  const file = path.join(SERVER_ROOT, 'data', '.session-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch { /* ainda não existe */ }
  const fresh = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fresh, { mode: 0o600 });
  } catch { /* sem disco gravável: o segredo vale só até reiniciar */ }
  return fresh;
}

const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || '';
const databaseUrl = env.DATABASE_URL?.trim() || '';

export const config = {
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT || 3001),
  /** Em desenvolvimento só aceita conexões desta máquina. Em produção, todas (use HOST para mudar). */
  host: env.HOST?.trim() || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  /** Quantos proxies existem na frente do servidor (0 = nenhum). */
  trustProxy: Number(env.TRUST_PROXY || 0),

  /** Vazio = usa o Postgres embutido (PGlite), salvo em PGLITE_DIR */
  databaseUrl,
  pgliteDir: env.PGLITE_DIR === 'memory://' ? 'memory://' : path.resolve(SERVER_ROOT, env.PGLITE_DIR || 'data/pglite'),

  googleClientId,
  /** Login sem Google, só para desenvolvimento. Liga sozinho quando não há GOOGLE_CLIENT_ID. */
  devLogin: bool(env.DEV_LOGIN, !googleClientId),

  jwtSecret: isWeakSecret(env.JWT_SECRET) ? (env.NODE_ENV === 'production' ? '' : localSecret()) : (env.JWT_SECRET as string),
  sessionDays: Number(env.SESSION_DAYS || 30),

  /** E-mails que viram admin automaticamente ao entrar */
  adminEmails: (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  /** Novos cadastros ficam 'pendentes' até um admin aprovar (REQUIRE_APPROVAL=false libera geral). */
  requireApproval: bool(env.REQUIRE_APPROVAL, true),

  /** Cria jogadores de exemplo quando o banco está vazio */
  seedDemo: bool(env.SEED_DEMO, !databaseUrl),

  /** Endereço público do site (links nos e-mails). Em produção vem de DOMAIN. */
  appUrl: (env.APP_URL?.trim() || (env.DOMAIN?.trim() ? `https://${env.DOMAIN.trim()}` : 'http://localhost:5173')).replace(/\/+$/, ''),

  /** E-mails de boas-vindas/aprovação. Sem SMTP_HOST, nada é enviado (só aparece no log). */
  smtp: {
    host: env.SMTP_HOST?.trim() || '',
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER?.trim() || '',
    pass: env.SMTP_PASS?.replace(/\s+/g, '') || '',
    from: env.MAIL_FROM?.trim() || (env.SMTP_USER?.trim() ? `Hangar MNG <${env.SMTP_USER.trim()}>` : ''),
  },

  /** Fase 2: chave que o servidor DCS usa para enviar eventos */
  serverApiKey: env.SERVER_API_KEY || '',
};

if (config.googleClientId && !/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(config.googleClientId)) {
  throw new Error('GOOGLE_CLIENT_ID no .env está num formato inválido. Ele deve terminar em .apps.googleusercontent.com (rode configurar-google.bat).');
}

if (config.isProd) {
  if (isWeakSecret(env.JWT_SECRET)) throw new Error('Defina JWT_SECRET no .env com um texto aleatório de 32+ caracteres (não use o exemplo).');
  if (config.devLogin) throw new Error('DEV_LOGIN não pode ficar ligado em produção. Defina GOOGLE_CLIENT_ID.');
}
