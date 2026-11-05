// Condecorações (ribbons): catálogo administrado pelo admin, com imagem PNG própria.
// As estrelas e o "V" são desenhados pelo site; a imagem enviada vem lisa (330×90 px).
import { db, type Queryable } from '../db.js';
import { fail } from '../errors.js';
import type { User } from './users.js';

export const RIBBON_MAX_BYTES = 100 * 1024;
export const RIBBON_CATEGORIES = ['campanha', 'combate', 'servico', 'honra'] as const;
const RATIO = 330 / 90;

export interface RibbonInput { name: string; description: string; category: string; precedence: number; allowsValor: boolean; active: boolean }

/** Valida assinatura PNG, tamanho em bytes e proporção (3,67:1) lendo o chunk IHDR. */
export function inspectRibbonPng(buf: Buffer) {
  if (buf.length > RIBBON_MAX_BYTES) throw fail('VALIDATION', 'A imagem deve ter no máximo 100 KB.');
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig) || buf.toString('ascii', 12, 16) !== 'IHDR') throw fail('VALIDATION', 'O arquivo não é um PNG válido.');
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  if (!width || !height || width < 165 || width > 1320 || Math.abs(width / height - RATIO) / RATIO > 0.02)
    throw fail('VALIDATION', `A imagem deve ter a proporção 330×90 (recebida: ${width}×${height}).`);
  return { width, height };
}

async function audit(adminId: string, action: string, details: object, q: Queryable = db) {
  await q.query('insert into admin_audit_log (admin_id, action, target_user_id, details) values ($1, $2, null, $3)', [adminId, action, JSON.stringify(details)]);
}

function check(input: RibbonInput): RibbonInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw fail('VALIDATION', 'Informe um nome de 2 a 80 caracteres.');
  if (!(RIBBON_CATEGORIES as readonly string[]).includes(input.category)) throw fail('VALIDATION', 'Categoria inválida.');
  if (!Number.isInteger(input.precedence) || input.precedence < 1 || input.precedence > 9999) throw fail('VALIDATION', 'A precedência deve ser um inteiro de 1 a 9999.');
  return { ...input, name, description: input.description.trim() };
}

const COLS = `id, name, description, category, precedence, allows_valor as "allowsValor", active, image_version as "imageVersion",
  (image is not null) as "hasImage", created_at as "createdAt"`;

export async function listRibbons() {
  const { rows } = await db.query(`select ${COLS} from ribbons order by precedence, lower(name)`);
  return rows;
}

async function nameTaken(name: string, exceptId?: string) {
  const { rows } = await db.query('select 1 from ribbons where lower(name)=lower($1) and ($2::uuid is null or id<>$2::uuid)', [name, exceptId ?? null]);
  return rows.length > 0;
}

export async function createRibbon(admin: User, raw: RibbonInput) {
  const input = check(raw);
  if (await nameTaken(input.name)) throw fail('VALIDATION', 'Já existe uma condecoração com esse nome.');
  const { rows } = await db.query<{ id: string }>(
    `insert into ribbons (name, description, category, precedence, allows_valor, active) values ($1,$2,$3,$4,$5,$6) returning id`,
    [input.name, input.description, input.category, input.precedence, input.allowsValor, input.active]);
  await audit(admin.id, 'create_ribbon', { id: rows[0].id, name: input.name });
  return rows[0].id;
}

export async function updateRibbon(admin: User, id: string, raw: RibbonInput) {
  const input = check(raw);
  if (await nameTaken(input.name, id)) throw fail('VALIDATION', 'Já existe uma condecoração com esse nome.');
  const { rows } = await db.query(
    `update ribbons set name=$2, description=$3, category=$4, precedence=$5, allows_valor=$6, active=$7 where id=$1 returning id`,
    [id, input.name, input.description, input.category, input.precedence, input.allowsValor, input.active]);
  if (!rows.length) throw fail('RIBBON_NOT_FOUND');
  await audit(admin.id, 'update_ribbon', { id, name: input.name });
}

export async function setRibbonImage(admin: User, id: string, data: Buffer) {
  inspectRibbonPng(data);
  const { rows } = await db.query<{ name: string }>(
    `update ribbons set image=$2, image_version=image_version+1 where id=$1 returning name`, [id, data]);
  if (!rows.length) throw fail('RIBBON_NOT_FOUND');
  await audit(admin.id, 'update_ribbon', { id, name: rows[0].name, image: true });
}

export async function deleteRibbon(admin: User, id: string) {
  const { rows } = await db.query<{ name: string }>('delete from ribbons where id=$1 returning name', [id]).catch((e) => {
    if ((e as { code?: string })?.code === '23503') throw fail('VALIDATION', 'Esta condecoração já foi concedida a pilotos e não pode ser apagada. Desative-a para que não seja mais usada.');
    throw e;
  });
  if (!rows.length) throw fail('RIBBON_NOT_FOUND');
  await audit(admin.id, 'delete_ribbon', { id, name: rows[0].name });
}

export async function getRibbonImage(id: string) {
  const { rows } = await db.query<{ image: Uint8Array | null }>('select image from ribbons where id=$1', [id]);
  if (!rows[0]?.image) throw fail('RIBBON_NOT_FOUND', 'Imagem não encontrada.');
  return Buffer.from(rows[0].image);
}

export interface AwardInput { userId: string; ribbonId: string; valor: boolean }

/** Pilotos elegíveis e condecorações já concedidas numa missão encerrada. */
export async function getMissionAwards(missionId: string) {
  const { rows: [m] } = await db.query<{ status: string }>('select status from missions where id=$1', [missionId]);
  if (!m) throw fail('MISSION_NOT_FOUND');
  const eligible = await db.query<{ userId: string; nickname: string }>(
    `select s.user_id as "userId", u.nickname from mission_signups s join users u on u.id=s.user_id
      where s.mission_id=$1 and s.attended order by lower(u.nickname)`, [missionId]);
  const awards = await db.query<AwardInput>(
    `select user_id as "userId", ribbon_id as "ribbonId", valor from ribbon_awards where mission_id=$1`, [missionId]);
  return { status: m.status, eligible: eligible.rows, awards: awards.rows };
}

/** Define o conjunto completo de condecorações da missão (concede o que entrou, revoga o que saiu). */
export async function saveMissionAwards(admin: User, missionId: string, input: AwardInput[]) {
  return db.tx(async (q) => {
    const { rows: [m] } = await q.query<{ status: string; title: string }>('select status, title from missions where id=$1 for update', [missionId]);
    if (!m) throw fail('MISSION_NOT_FOUND');
    if (m.status !== 'closed') throw fail('VALIDATION', 'Condecorações só podem ser concedidas depois de publicar o relatório da missão.');
    const wanted = new Map<string, AwardInput>();
    for (const a of input) wanted.set(`${a.ribbonId}:${a.userId}`, a);
    const { rows: pilots } = await q.query<{ userId: string; nickname: string }>(
      `select s.user_id as "userId", u.nickname from mission_signups s join users u on u.id=s.user_id where s.mission_id=$1 and s.attended`, [missionId]);
    const nick = new Map(pilots.map((p) => [p.userId, p.nickname]));
    const { rows: ribbons } = await q.query<{ id: string; name: string; allowsValor: boolean }>(
      `select r.id, r.name, r.allows_valor as "allowsValor" from mission_ribbons mr join ribbons r on r.id=mr.ribbon_id where mr.mission_id=$1`, [missionId]);
    const ribbonOf = new Map(ribbons.map((r) => [r.id, r]));
    for (const a of wanted.values()) {
      if (!nick.has(a.userId)) throw fail('VALIDATION', 'Só pilotos que participaram da missão podem ser condecorados.');
      const r = ribbonOf.get(a.ribbonId);
      if (!r) throw fail('VALIDATION', 'Essa condecoração não está vinculada à missão.');
      if (a.valor && !r.allowsValor) throw fail('VALIDATION', `"${r.name}" não aceita o "V" de valor.`);
    }
    const { rows: current } = await q.query<AwardInput>('select user_id as "userId", ribbon_id as "ribbonId", valor from ribbon_awards where mission_id=$1', [missionId]);
    const have = new Map(current.map((a) => [`${a.ribbonId}:${a.userId}`, a]));
    let added = 0, revoked = 0;
    for (const [key, a] of have) {
      if (wanted.has(key)) continue;
      await q.query('delete from ribbon_awards where mission_id=$1 and ribbon_id=$2 and user_id=$3', [missionId, a.ribbonId, a.userId]);
      await audit(admin.id, 'revoke_ribbon', { missionId, title: m.title, ribbon: ribbonOf.get(a.ribbonId)?.name ?? a.ribbonId, nickname: nick.get(a.userId) ?? a.userId }, q);
      revoked++;
    }
    for (const [key, a] of wanted) {
      const old = have.get(key);
      if (old && old.valor === a.valor) continue;
      await q.query(
        `insert into ribbon_awards (mission_id, ribbon_id, user_id, valor, awarded_by) values ($1,$2,$3,$4,$5)
         on conflict (mission_id, ribbon_id, user_id) do update set valor=excluded.valor, awarded_by=excluded.awarded_by`,
        [missionId, a.ribbonId, a.userId, a.valor, admin.id]);
      await audit(admin.id, 'award_ribbon', { missionId, title: m.title, ribbon: ribbonOf.get(a.ribbonId)?.name, nickname: nick.get(a.userId), valor: a.valor }, q);
      added++;
    }
    return { added, revoked };
  });
}

export interface RackRibbon { id: string; name: string; description: string; category: string; allowsValor: boolean; imageVersion: number; hasImage: boolean; count: number; valor: boolean; lastAt: string }

/** Quadro de fitas do piloto: uma entrada por condecoração, com contagem (estrelas) e "V" se alguma teve valor. */
export async function getRibbonRack(userId: string): Promise<RackRibbon[]> {
  const { rows } = await db.query<RackRibbon>(
    `select r.id, r.name, r.description, r.category, r.allows_valor as "allowsValor", r.image_version as "imageVersion",
            (r.image is not null) as "hasImage", count(*)::int as count, bool_or(a.valor) as valor, max(a.created_at) as "lastAt"
       from (select ribbon_id, user_id, valor, created_at from ribbon_awards
             union all select ribbon_id, user_id, valor, created_at from ribbon_grants) a
       join ribbons r on r.id = a.ribbon_id
      where a.user_id = $1 group by r.id order by r.precedence, lower(r.name)`, [userId]);
  return rows;
}

export interface GrantRow { id: string; userId: string; nickname: string; ribbonId: string; ribbonName: string; valor: boolean; reason: string; createdAt: string }

/** Concessões avulsas (fora de missões), mais recentes primeiro. */
export async function listGrants(limit = 50, offset = 0): Promise<{ items: GrantRow[]; total: number }> {
  const [{ rows }, { rows: [count] }] = await Promise.all([db.query<GrantRow>(
    `select g.id, g.user_id as "userId", u.nickname, g.ribbon_id as "ribbonId", r.name as "ribbonName", g.valor, g.reason, g.created_at as "createdAt"
       from ribbon_grants g join users u on u.id = g.user_id join ribbons r on r.id = g.ribbon_id
      order by g.created_at desc, g.id limit $1 offset $2`, [limit, offset]),
    db.query<{ total: number }>('select count(*)::int as total from ribbon_grants')]);
  return { items: rows, total: count.total };
}

export async function grantRibbon(admin: User, input: { userId: string; ribbonId: string; valor: boolean; reason: string }) {
  const { rows: [ribbon] } = await db.query<{ name: string; allowsValor: boolean; active: boolean }>(
    'select name, allows_valor as "allowsValor", active from ribbons where id=$1', [input.ribbonId]);
  if (!ribbon) throw fail('RIBBON_NOT_FOUND');
  if (!ribbon.active) throw fail('VALIDATION', 'Esta condecoração está inativa.');
  if (input.valor && !ribbon.allowsValor) throw fail('VALIDATION', 'Esta condecoração não aceita o "V" de valor.');
  const { rows: [pilot] } = await db.query<{ nickname: string | null; status: string }>('select nickname, status from users where id=$1', [input.userId]);
  if (!pilot?.nickname || pilot.status !== 'active') throw fail('VALIDATION', 'Escolha um piloto ativo com apelido.');
  const reason = input.reason.trim().slice(0, 200);
  return db.tx(async (q) => {
    const { rows: [g] } = await q.query<{ id: string }>(
      'insert into ribbon_grants (ribbon_id, user_id, valor, reason, awarded_by) values ($1,$2,$3,$4,$5) returning id',
      [input.ribbonId, input.userId, input.valor, reason, admin.id]);
    await audit(admin.id, 'award_ribbon', { title: reason ? `avulsa: ${reason}` : 'concessão avulsa', ribbon: ribbon.name, nickname: pilot.nickname, valor: input.valor }, q);
    return g.id;
  });
}

export async function revokeGrant(admin: User, id: string) {
  await db.tx(async (q) => {
    const { rows } = await q.query<{ nickname: string; name: string }>(
      `delete from ribbon_grants g using users u, ribbons r where g.id=$1 and u.id=g.user_id and r.id=g.ribbon_id returning u.nickname, r.name`, [id]);
    if (!rows.length) throw fail('RIBBON_NOT_FOUND', 'Concessão não encontrada.');
    await audit(admin.id, 'revoke_ribbon', { title: 'concessão avulsa', ribbon: rows[0].name, nickname: rows[0].nickname }, q);
  });
}

/** Concessões de uma missão encerrada, visíveis a todos os pilotos (aparecem no relatório publicado). */
export async function listMissionAwardsPublic(missionId: string) {
  const { rows } = await db.query<{ userId: string; nickname: string; ribbonId: string; valor: boolean }>(
    `select a.user_id as "userId", u.nickname, a.ribbon_id as "ribbonId", a.valor from ribbon_awards a
       join users u on u.id = a.user_id join ribbons r on r.id = a.ribbon_id
      where a.mission_id = $1 order by lower(u.nickname), r.precedence`, [missionId]);
  return rows;
}
