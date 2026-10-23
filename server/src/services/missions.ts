// Missões: eventos agendados por admins. O piloto se inscreve com uma aeronave que já possui;
// ao encerrar, o admin marca quem voou e quanto PM cada um recebe.
import { db, type Queryable } from '../db.js';
import { fail } from '../errors.js';
import { getOwnedIds } from './techtree.js';
import type { User } from './users.js';
import { sendNewMission } from './mail.js';
import { missionAssetMetadata, validateMissionAssets } from './mission-files.js';
import { enqueueMissionDiscord } from './discord-notifications.js';
import { nextMissionSlug, UUID_ADDRESS } from './mission-slug.js';

async function audit(q: Queryable, adminId: string, action: string, details: object) {
  await q.query('insert into admin_audit_log (admin_id, action, target_user_id, details) values ($1, $2, null, $3)',
    [adminId, action, JSON.stringify(details)]);
}

const MISSION_COLS = `m.id, m.slug, m.title, m.briefing, m.starts_at as "startsAt", m.default_pm as "defaultPm",
  m.status, m.series_id as "seriesId", m.closed_at as "closedAt", m.map_name as "mapName", m.briefing_image_url as "briefingImageUrl",
  m.image_asset_id as "imageAssetId", m.briefing_asset_id as "briefingAssetId", m.audio_asset_id as "audioAssetId", m.tier,
  exists(select 1 from mission_reports report where report.mission_id=m.id and report.state='published') as "hasReport",
  coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'description', r.description, 'allowsValor', r.allows_valor,
      'hasImage', r.image is not null, 'imageVersion', r.image_version) order by r.precedence, lower(r.name))
    from mission_ribbons mr join ribbons r on r.id = mr.ribbon_id where mr.mission_id = m.id), '[]'::json) as ribbons`;

async function signupsOf(q: Queryable, ids: string[]) {
  if (!ids.length) return [];
  const { rows } = await q.query<{ missionId: string; userId: string; nickname: string; aircraftId: string; aircraftName: string; attended: boolean; pmAwarded: number }>(
    `select s.mission_id as "missionId", s.user_id as "userId", u.nickname, s.aircraft_id as "aircraftId", a.name as "aircraftName",
            s.attended, s.pm_awarded as "pmAwarded"
       from mission_signups s join users u on u.id = s.user_id join aircraft a on a.id = s.aircraft_id
      where s.mission_id = any($1) order by s.created_at`, [ids]);
  return rows;
}

async function withSignups<T extends { id: string; imageAssetId?: string | null; briefingAssetId?: string | null; audioAssetId?: string | null }>(rows: T[], me?: string) {
  const all = await signupsOf(db, rows.map((r) => r.id));
  const assets = await missionAssetMetadata(rows.flatMap((row) => [row.imageAssetId, row.briefingAssetId, row.audioAssetId].filter((id): id is string => !!id)));
  return rows.map((m) => {
    const signups = all.filter((s) => s.missionId === m.id);
    return { ...m, imageAsset: assets.get(m.imageAssetId ?? '') ?? null, briefingAsset: assets.get(m.briefingAssetId ?? '') ?? null, audioAsset: assets.get(m.audioAssetId ?? '') ?? null, signups, mine: me ? signups.find((s) => s.userId === me) ?? null : null };
  });
}

/** Próximas missões + as 10 últimas encerradas */
export async function listMissions(user: User) {
  const upcoming = await db.query<{ id: string }>(
    `select ${MISSION_COLS} from missions m where m.status = 'scheduled' order by m.starts_at limit 50`);
  const past = await db.query<{ id: string }>(
    `select ${MISSION_COLS} from missions m where m.status = 'closed' order by m.starts_at desc limit 10`);
  return { upcoming: await withSignups(upcoming.rows, user.id), past: await withSignups(past.rows, user.id) };
}

export async function getMission(user: User, id: string) {
  const { rows } = await db.query<{ id: string }>(`select ${MISSION_COLS} from missions m where m.${UUID_ADDRESS.test(id) ? 'id' : 'slug'} = $1`, [id]);
  if (!rows.length) throw fail('MISSION_NOT_FOUND');
  return (await withSignups(rows, user.id))[0];
}

export async function resolveMissionId(address: string): Promise<string> {
  if (UUID_ADDRESS.test(address)) return address;
  const { rows: [mission] } = await db.query<{ id: string }>('select id from missions where slug=$1', [address]);
  if (!mission) throw fail('MISSION_NOT_FOUND');
  return mission.id;
}

export async function adminListMissions(limit: number, offset: number) {
  const { rows } = await db.query<{ id: string }>(
    `select ${MISSION_COLS} from missions m order by (m.status = 'scheduled') desc,
       case when m.status = 'scheduled' then m.starts_at end asc, m.starts_at desc limit $1 offset $2`, [limit, offset]);
  const total = await db.query<{ n: number }>('select count(*)::int as n from missions');
  return { items: await withSignups(rows), total: total.rows[0].n };
}

async function lockMission(q: Queryable, id: string) {
  const { rows } = await q.query<{ status: string; title: string; default_pm: number | null }>(
    'select status, title, default_pm from missions where id = $1 for update', [id]);
  if (!rows.length) throw fail('MISSION_NOT_FOUND');
  return rows[0];
}

export async function signUp(user: User, missionId: string, aircraftId: string) {
  await db.tx(async (q) => {
    const m = await lockMission(q, missionId);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    const owned = await getOwnedIds(user.id, q);
    if (!owned.has(aircraftId)) throw fail('AIRCRAFT_NOT_OWNED');
    await q.query(
      `insert into mission_signups (mission_id, user_id, aircraft_id) values ($1, $2, $3)
       on conflict (mission_id, user_id) do update set aircraft_id = excluded.aircraft_id`, [missionId, user.id, aircraftId]);
  });
}

export async function cancelSignup(user: User, missionId: string) {
  await db.tx(async (q) => {
    const m = await lockMission(q, missionId);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    await q.query('delete from mission_signups where mission_id = $1 and user_id = $2', [missionId, user.id]);
  });
}

export async function removeSignup(admin: User, missionId: string, userId: string) {
  if (admin.role !== 'admin') throw fail('FORBIDDEN');
  return db.tx(async (q) => {
    const mission = await lockMission(q, missionId);
    if (mission.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    const { rows } = await q.query<{ nickname: string | null }>(
      `delete from mission_signups s using users u where s.mission_id=$1 and s.user_id=$2 and u.id=s.user_id returning u.nickname`, [missionId, userId]);
    if (!rows.length) return { removed: false };
    const { rows: drafts } = await q.query<{ pilots: { userId: string }[] }>(
      "select pilots from mission_reports where mission_id=$1 and state='draft'", [missionId]);
    if (drafts.length) await q.query(
      "update mission_reports set pilots=$2, version=version+1, saved_by=$3, saved_at=now() where mission_id=$1 and state='draft'",
      [missionId, JSON.stringify(drafts[0].pilots.filter(pilot => pilot.userId !== userId)), admin.id]);
    await audit(q, admin.id, 'remove_mission_signup', { id: missionId, title: mission.title, nickname: rows[0].nickname, userId });
    return { removed: true };
  });
}

export interface MissionInput { title: string; briefing: string; startsAt: string; defaultPm: number | null; mapName?: string; briefingImageUrl?: string; imageAssetId?: string | null; briefingAssetId?: string | null; audioAssetId?: string | null; tier?: number | null; ribbonIds?: string[] }

async function assertTier(q: Queryable, tier: number | null | undefined) {
  if (tier == null) return;
  const { rows } = await q.query('select 1 from tiers where tier = $1', [tier]);
  if (!rows.length) throw fail('VALIDATION', 'Escolha um tier cadastrado na progressão.');
}

/** Substitui as condecorações da missão. Só aceita fitas ativas (ou as que a missão já tinha). */
async function setMissionRibbons(q: Queryable, missionId: string, ribbonIds: string[]) {
  const ids = [...new Set(ribbonIds)];
  if (ids.length) {
    const { rows } = await q.query<{ id: string }>(
      `select r.id from ribbons r where r.id = any($1::uuid[]) and (r.active or exists(select 1 from mission_ribbons mr where mr.mission_id = $2 and mr.ribbon_id = r.id))`, [ids, missionId]);
    if (rows.length !== ids.length) throw fail('VALIDATION', 'Alguma condecoração escolhida não existe ou está inativa.');
  }
  await q.query('delete from mission_ribbons where mission_id = $1', [missionId]);
  for (const id of ids) await q.query('insert into mission_ribbons (mission_id, ribbon_id) values ($1, $2)', [missionId, id]);
}

/** Revisão: troca as fitas de uma missão já encerrada. Não deixa tirar uma fita que já foi concedida nela. */
export async function reviewMissionRibbons(admin: User, id: string, ribbonIds: string[]) {
  await db.tx(async (q) => {
    const m = await lockMission(q, id);
    if (m.status === 'cancelled') throw fail('MISSION_NOT_OPEN');
    const keep = new Set(ribbonIds);
    const { rows: used } = await q.query<{ id: string; name: string }>(
      `select distinct r.id, r.name from ribbon_awards a join ribbons r on r.id = a.ribbon_id where a.mission_id = $1`, [id]);
    const blocked = used.find((r) => !keep.has(r.id));
    if (blocked) throw fail('VALIDATION', `"${blocked.name}" já foi concedida nesta missão. Revogue as concessões antes de tirá-la.`);
    await setMissionRibbons(q, id, ribbonIds);
    await audit(q, admin.id, 'update_mission', { id, title: m.title });
  });
}

/** Cria a missão; com repeatWeeks > 0 cria também cópias semanais (mesma série). */
export async function createMission(admin: User, input: MissionInput, repeatWeeks: number) {
  await validateMissionAssets(input.imageAssetId, input.briefingAssetId, input.audioAssetId);
  await assertTier(db, input.tier);
  const result = await db.tx(async (q) => {
    // PGlite serializes transactions; PostgreSQL needs a lock for duplicate titles.
    if (db.kind === 'postgres') await q.query('select pg_advisory_xact_lock(721406, 2)');
    const seriesId = repeatWeeks > 0 ? (await q.query<{ id: string }>('select gen_random_uuid() as id')).rows[0].id : null;
    const ids: string[] = [];
    for (let i = 0; i <= repeatWeeks; i++) {
      const at = new Date(new Date(input.startsAt).getTime() + i * 7 * 86400_000).toISOString();
      const slug = await nextMissionSlug(q, input.title);
      const { rows } = await q.query<{ id: string }>(
        `insert into missions (title, briefing, starts_at, default_pm, series_id, created_by, map_name, briefing_image_url, image_asset_id, briefing_asset_id, audio_asset_id, tier, slug)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [input.title.trim(), input.briefing.trim(), at, input.defaultPm, seriesId, admin.id, input.mapName?.trim() ?? '', input.briefingImageUrl?.trim() ?? '', input.imageAssetId ?? null, input.briefingAssetId ?? null, input.audioAssetId ?? null, input.tier ?? null, slug]);
      ids.push(rows[0].id);
      if (input.ribbonIds?.length) await setMissionRibbons(q, rows[0].id, input.ribbonIds);
    }
    await audit(q, admin.id, 'create_mission', { title: input.title.trim(), startsAt: input.startsAt, copies: ids.length });
    await enqueueMissionDiscord(q, ids[0], ids.length);
    return { ids };
  });
  // fora da transação: e-mail lento ou com erro nunca desfaz a criação
  void notifyPilots(input, repeatWeeks + 1);
  return result;
}

async function notifyPilots(input: MissionInput, weeks: number) {
  try {
    const { rows } = await db.query<{ email: string; name: string | null }>(
      `select email, name from users where status = 'active' and nickname is not null`);
    for (const u of rows) sendNewMission(u, { title: input.title.trim(), briefing: input.briefing.trim(), startsAt: new Date(input.startsAt), weeks });
  } catch (e) { console.error('[missões] falha ao avisar pilotos:', e instanceof Error ? e.message : e); }
}

export async function updateMission(admin: User, id: string, input: MissionInput) {
  await validateMissionAssets(input.imageAssetId, input.briefingAssetId, input.audioAssetId);
  await assertTier(db, input.tier);
  await db.tx(async (q) => {
    const m = await lockMission(q, id);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    await q.query('update missions set title = $2, briefing = $3, starts_at = $4, default_pm = $5, map_name = $6, briefing_image_url = $7, image_asset_id=$8, briefing_asset_id=$9, audio_asset_id=$10, tier=$11 where id = $1',
      [id, input.title.trim(), input.briefing.trim(), input.startsAt, input.defaultPm, input.mapName?.trim() ?? '', input.briefingImageUrl?.trim() ?? '', input.imageAssetId ?? null, input.briefingAssetId ?? null, input.audioAssetId ?? null, input.tier ?? null]);
    if (input.ribbonIds !== undefined) await setMissionRibbons(q, id, input.ribbonIds);
    await audit(q, admin.id, 'update_mission', { id, title: input.title.trim() });
  });
}

export async function cancelMission(admin: User, id: string) {
  await db.tx(async (q) => {
    const m = await lockMission(q, id);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    await q.query(`update missions set status = 'cancelled' where id = $1`, [id]);
    await audit(q, admin.id, 'cancel_mission', { id, title: m.title });
  });
}

/** Apaga a missão de vez (inscrições e relatório rascunho vão junto). Recusa se algum PM já foi distribuído por ela. */
export async function deleteMission(admin: User, id: string) {
  await db.tx(async (q) => {
    const m = await lockMission(q, id);
    const { rows: [paid] } = await q.query<{ pm: number; published: boolean }>(
      `select coalesce((select sum(pm_awarded) from mission_signups where mission_id = $1), 0)::int as pm,
              exists(select 1 from mission_reports where mission_id = $1 and state = 'published') as published`, [id]);
    const { rows: [ledger] } = await q.query<{ n: number }>(
      `select count(*)::int as n from points_ledger where external_ref like $1`, [`mission-report:${id}:%`]);
    if (paid.pm > 0 || paid.published || ledger.n > 0) throw fail('VALIDATION', 'Esta missão já distribuiu PM aos pilotos e não pode ser apagada. Para tirá-la da lista, mantenha o relatório publicado.');
    const { rows: [files] } = await q.query<{ image: string | null; briefing: string | null; audio: string | null }>(
      'select image_asset_id as image, briefing_asset_id as briefing, audio_asset_id as audio from missions where id = $1', [id]);
    await q.query('delete from missions where id = $1', [id]);
    for (const asset of [files.image, files.briefing, files.audio]) {
      if (!asset) continue;
      await q.query(`delete from mission_assets where id = $1 and not exists (
        select 1 from missions where image_asset_id = $1 or briefing_asset_id = $1 or audio_asset_id = $1)`, [asset]);
    }
    await audit(q, admin.id, 'delete_mission', { id, title: m.title });
  });
}

/** @deprecated Use saveMissionReport to publish results and award calculated points. */
export async function closeMission(admin: User, id: string, attendees: { userId: string; pm: number }[]) {
  return db.tx(async (q) => {
    const m = await lockMission(q, id);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    const { rows: signed } = await q.query<{ user_id: string }>('select user_id from mission_signups where mission_id = $1', [id]);
    const allowed = new Set(signed.map((s) => s.user_id));
    const seen = new Set<string>();
    let total = 0;
    for (const a of attendees) {
      if (!allowed.has(a.userId) || seen.has(a.userId)) throw fail('VALIDATION', 'Participante inválido.');
      seen.add(a.userId);
      await q.query('update mission_signups set attended = true, pm_awarded = $3 where mission_id = $1 and user_id = $2', [id, a.userId, a.pm]);
      if (a.pm > 0) {
        await q.query(
          `insert into points_ledger (user_id, amount, reason, source, created_by) values ($1, $2, $3, 'manual', $4)`,
          [a.userId, a.pm, `Missão: ${m.title}`.slice(0, 200), admin.id]);
        total += a.pm;
      }
    }
    await q.query(`update missions set status = 'closed', closed_at = now() where id = $1`, [id]);
    await audit(q, admin.id, 'close_mission', { id, title: m.title, pilots: attendees.length, totalPm: total });
    return { pilots: attendees.length, total };
  });
}
