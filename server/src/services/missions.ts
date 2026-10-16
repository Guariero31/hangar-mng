// Missões: eventos agendados por admins. O piloto se inscreve com uma aeronave que já possui;
// ao encerrar, o admin marca quem voou e quanto PM cada um recebe.
import { db, type Queryable } from '../db.js';
import { fail } from '../errors.js';
import { getOwnedIds } from './techtree.js';
import type { User } from './users.js';
import { sendNewMission } from './mail.js';

async function audit(q: Queryable, adminId: string, action: string, details: object) {
  await q.query('insert into admin_audit_log (admin_id, action, target_user_id, details) values ($1, $2, null, $3)',
    [adminId, action, JSON.stringify(details)]);
}

const MISSION_COLS = `m.id, m.title, m.briefing, m.starts_at as "startsAt", m.default_pm as "defaultPm",
  m.status, m.series_id as "seriesId", m.closed_at as "closedAt", m.map_name as "mapName", m.briefing_image_url as "briefingImageUrl"`;

async function signupsOf(q: Queryable, ids: string[]) {
  if (!ids.length) return [];
  const { rows } = await q.query<{ missionId: string; userId: string; nickname: string; aircraftId: string; aircraftName: string; attended: boolean; pmAwarded: number }>(
    `select s.mission_id as "missionId", s.user_id as "userId", u.nickname, s.aircraft_id as "aircraftId", a.name as "aircraftName",
            s.attended, s.pm_awarded as "pmAwarded"
       from mission_signups s join users u on u.id = s.user_id join aircraft a on a.id = s.aircraft_id
      where s.mission_id = any($1) order by s.created_at`, [ids]);
  return rows;
}

async function withSignups<T extends { id: string }>(rows: T[], me?: string) {
  const all = await signupsOf(db, rows.map((r) => r.id));
  return rows.map((m) => {
    const signups = all.filter((s) => s.missionId === m.id);
    return { ...m, signups, mine: me ? signups.find((s) => s.userId === me) ?? null : null };
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
  const { rows } = await db.query<{ id: string }>(`select ${MISSION_COLS} from missions m where m.id = $1`, [id]);
  if (!rows.length) throw fail('MISSION_NOT_FOUND');
  return (await withSignups(rows, user.id))[0];
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

export interface MissionInput { title: string; briefing: string; startsAt: string; defaultPm: number | null; mapName?: string; briefingImageUrl?: string }

/** Cria a missão; com repeatWeeks > 0 cria também cópias semanais (mesma série). */
export async function createMission(admin: User, input: MissionInput, repeatWeeks: number) {
  const result = await db.tx(async (q) => {
    const seriesId = repeatWeeks > 0 ? (await q.query<{ id: string }>('select gen_random_uuid() as id')).rows[0].id : null;
    const ids: string[] = [];
    for (let i = 0; i <= repeatWeeks; i++) {
      const at = new Date(new Date(input.startsAt).getTime() + i * 7 * 86400_000).toISOString();
      const { rows } = await q.query<{ id: string }>(
        `insert into missions (title, briefing, starts_at, default_pm, series_id, created_by, map_name, briefing_image_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [input.title.trim(), input.briefing.trim(), at, input.defaultPm, seriesId, admin.id, input.mapName?.trim() ?? '', input.briefingImageUrl?.trim() ?? '']);
      ids.push(rows[0].id);
    }
    await audit(q, admin.id, 'create_mission', { title: input.title.trim(), startsAt: input.startsAt, copies: ids.length });
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
  await db.tx(async (q) => {
    const m = await lockMission(q, id);
    if (m.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
    await q.query('update missions set title = $2, briefing = $3, starts_at = $4, default_pm = $5, map_name = $6, briefing_image_url = $7 where id = $1',
      [id, input.title.trim(), input.briefing.trim(), input.startsAt, input.defaultPm, input.mapName?.trim() ?? '', input.briefingImageUrl?.trim() ?? '']);
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

/** Encerra: marca presença e lança o PM de cada piloto que voou (tudo em uma transação). */
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
