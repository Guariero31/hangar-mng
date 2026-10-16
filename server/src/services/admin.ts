import { db, type Queryable } from '../db.js';
import { fail, isUniqueViolation } from '../errors.js';
import { getBalance, NICKNAME_RULE, RESERVED, type User } from './users.js';
import { getTree, type Role } from './techtree.js';
import { getAchievements } from './achievements.js';
import { sendApproved, sendRejected } from './mail.js';
import { refundAcquisition, type Acquisition } from './acquisitions.js';
import { validateTree } from './tree-validation.js';

async function audit(q: Queryable, adminId: string, action: string, targetUserId: string | null, details: object) {
  await q.query(
    'insert into admin_audit_log (admin_id, action, target_user_id, details) values ($1, $2, $3, $4)',
    [adminId, action, targetUserId, JSON.stringify(details)]);
}

async function assertUser(q: Queryable, userId: string) {
  const { rows } = await q.query('select 1 from users where id = $1', [userId]);
  if (!rows.length) throw fail('USER_NOT_FOUND');
}

// ---------------------------------------------------------------- jogadores

export async function listPlayers(search: string | null, limit: number, offset: number,
  selection: { filter?: string; sort?: string; direction?: string } = {}) {
  const params = [search || null, limit, offset];
  const filters: Record<string, string> = {
    all: 'true', active: "u.status = 'active' and u.nickname is not null", banned: "u.status = 'banned'",
    nonick: "u.status = 'active' and u.nickname is null", admin: "u.role = 'admin'",
  };
  const sortColumns: Record<string, string> = {
    earned: 'earned', balance: 'balance', aircraftCount: '"aircraftCount"', nickname: 'u.nickname',
    lastLoginAt: 'u.last_login_at', createdAt: 'u.created_at',
  };
  const order = sortColumns[selection.sort ?? 'earned'] ?? 'earned';
  const direction = selection.direction === 'asc' ? 'asc' : 'desc';
  const filter = `($1::text is null or u.nickname ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%')
    and (${filters[selection.filter ?? 'all'] ?? filters.all})`;
  const [{ rows }, { rows: [count] }, { rows: [summary] }] = await Promise.all([
    db.query(
      `select u.id, u.nickname, u.email, u.name, u.role, u.status, u.created_at as "createdAt", u.last_login_at as "lastLoginAt",
              coalesce(l.balance, 0)::float8 as balance,
              coalesce(l.earned, 0)::float8  as earned,
              ((select count(*) from user_aircraft ua where ua.user_id = u.id)
               + (select count(*) from aircraft a join tiers t on t.tier = a.tier
                   where t.cost = 0 and a.active
                     and not exists (select 1 from user_aircraft x where x.user_id = u.id and x.aircraft_id = a.id)))::float8 as "aircraftCount",
              exists (select 1 from dcs_links d where d.user_id = u.id) as "dcsLinked"
         from users u
         left join lateral (
           select sum(amount) as balance,
                  sum(amount) filter (where amount > 0 and source in ('manual', 'server')) as earned
             from points_ledger where user_id = u.id
         ) l on true
        where ${filter}
        order by ${order} ${direction} nulls last, u.id
        limit $2 offset $3`, params),
    db.query<{ total: number }>(`select count(*)::float8 as total from users u where ${filter}`, [search || null]),
    db.query<{ active: number; banned: number; circ: number; online: number }>(
      `select count(*) filter (where u.status = 'active' and u.nickname is not null)::float8 as active,
              count(*) filter (where u.status = 'banned')::float8 as banned,
              count(*) filter (where u.last_login_at > now() - interval '7 days')::float8 as online,
              coalesce(sum(greatest(0, balance)) filter (where u.status = 'active'), 0)::float8 as circ
         from users u left join lateral (select coalesce(sum(amount), 0) as balance
           from points_ledger where user_id = u.id) ledger on true`),
  ]);
  return { players: rows, total: count.total, summary };
}

export async function playerDetail(userId: string) {
  const [{ rows: [user] }, balance, owned, ledger, link] = await Promise.all([
    db.query(
      `select id, nickname, email, name, avatar_url as "avatarUrl", role, status,
              created_at as "createdAt", last_login_at as "lastLoginAt"
         from users where id = $1`, [userId]),
    getBalance(userId),
    db.query(
      `select ua.aircraft_id as "aircraftId", a.name, a.tier, t.label as "tierLabel", ua.paid_amount as cost,
              ua.unlocked_at as "unlockedAt", g.nickname as "grantedBy"
         from user_aircraft ua
         join aircraft a on a.id = ua.aircraft_id
         join tiers t on t.tier = a.tier
         left join users g on g.id = ua.granted_by
        where ua.user_id = $1
        order by a.tier, a.row`, [userId]),
    db.query(
      `select l.id, l.amount, l.reason, l.source, l.created_at as "createdAt", c.nickname as "createdBy"
         from points_ledger l
         left join users c on c.id = l.created_by and l.source in ('manual', 'refund')
        where l.user_id = $1
        order by l.created_at desc, l.id desc limit 200`, [userId]),
    db.query(`select ucid, linked_at as "linkedAt" from dcs_links where user_id = $1`, [userId]),
  ]);
  if (!user) throw fail('USER_NOT_FOUND');
  const { rows: [full] } = await db.query<User>('select * from users where id = $1', [userId]);
  const achievements = await getAchievements(full);
  return { user, balance, aircraft: owned.rows, ledger: ledger.rows, dcsLink: link.rows[0] ?? null, achievements };
}

export async function addPoints(admin: User, userId: string, amount: number, reason: string) {
  if (!amount) throw fail('AMOUNT_ZERO');
  if (!reason.trim()) throw fail('REASON_REQUIRED');
  return db.tx(async (q) => {
    await assertUser(q, userId);
    await q.query(
      `insert into points_ledger (user_id, amount, reason, source, created_by)
       values ($1, $2, $3, 'manual', $4)`, [userId, amount, reason.trim(), admin.id]);
    await audit(q, admin.id, 'add_points', userId, { amount, reason: reason.trim() });
    return getBalance(userId, q);
  });
}

/** Lança (ou retira) o mesmo valor de PM para vários jogadores de uma vez; tudo numa transação: ou vão todos, ou nenhum. */
export async function addPointsBatch(admin: User, userIds: string[], amount: number, reason: string) {
  const ids = [...new Set(userIds)];
  if (!ids.length) throw fail('BATCH_EMPTY');
  if (!amount) throw fail('AMOUNT_ZERO');
  if (!reason.trim()) throw fail('REASON_REQUIRED');
  return db.tx(async (q) => {
    const { rows } = await q.query<{ id: string }>(
      `select id from users where id = any($1) and status = 'active' and nickname is not null for update`, [ids]);
    if (rows.length !== ids.length) throw fail('BATCH_INVALID_USERS');
    for (const id of ids) {
      await q.query(
        `insert into points_ledger (user_id, amount, reason, source, created_by) values ($1, $2, $3, 'manual', $4)`,
        [id, amount, reason.trim(), admin.id]);
      await audit(q, admin.id, 'add_points', id, { amount, reason: reason.trim(), batch: ids.length });
    }
    return { count: ids.length, total: amount * ids.length };
  });
}

export async function grantAircraft(admin: User, userId: string, aircraftId: string) {
  await db.tx(async (q) => {
    await assertUser(q, userId);
    const { rows } = await q.query('select 1 from aircraft where id = $1', [aircraftId]);
    if (!rows.length) throw fail('AIRCRAFT_NOT_FOUND');
    await q.query(
      `insert into user_aircraft (user_id, aircraft_id, granted_by) values ($1, $2, $3)
       on conflict do nothing`, [userId, aircraftId, admin.id]);
    await audit(q, admin.id, 'grant_aircraft', userId, { aircraft: aircraftId });
  });
}

export async function revokeAircraft(admin: User, userId: string, aircraftId: string, refund: boolean) {
  await db.tx(async (q) => {
    await q.query('select id from users where id = $1 for update', [userId]);
    const { rows: [acquisition] } = await q.query<Acquisition>(
      `delete from user_aircraft where user_id = $1 and aircraft_id = $2
       returning aircraft_id, paid_amount, purchase_ledger_id::text, acquisition_kind`, [userId, aircraftId]);
    if (!acquisition) throw fail('NOT_UNLOCKED');
    const refunded = refund ? await refundAcquisition(q, userId, acquisition, admin.id, `Reembolso: ${aircraftId}`) : 0;
    await audit(q, admin.id, 'revoke_aircraft', userId, { aircraft: aircraftId, refund: refunded > 0, refunded });
  });
}

export async function listApprovals(limit = 50, offset = 0) {
  const [{ rows }, { rows: [counts] }] = await Promise.all([
    db.query(`select id, email, name, avatar_url as "avatarUrl", status, created_at as "createdAt", decided_at as "decidedAt"
      from users where status in ('pending', 'rejected')
      order by (status = 'pending') desc, created_at desc, id limit $1 offset $2`, [limit, offset]),
    db.query<{ pending: number; total: number }>(`select count(*) filter (where status = 'pending')::float8 as pending,
      count(*)::float8 as total from users where status in ('pending', 'rejected')`),
  ]);
  return { ...counts, items: rows };
}

export async function decideApproval(admin: User, userId: string, decision: 'approve' | 'reject') {
  if (userId === admin.id) throw fail('CANNOT_CHANGE_OWN_STATUS');
  const target = await db.tx(async (q) => {
    const status = decision === 'approve' ? 'active' : 'rejected';
    const { rows } = await q.query<{ email: string; name: string | null }>(
      `update users set status = $2, decided_at = now()
        where id = $1 and status in ('pending', 'rejected') returning email, name`, [userId, status]);
    if (!rows.length) throw fail('USER_NOT_FOUND', 'Este cadastro não está mais na fila.');
    await audit(q, admin.id, decision === 'approve' ? 'approve_user' : 'reject_user', userId, { email: rows[0].email });
    return rows[0];
  });
  // fora da transação: o e-mail nunca desfaz nem atrasa a decisão
  if (decision === 'approve') sendApproved(target); else sendRejected(target);
}

export async function setStatus(admin: User, userId: string, status: 'active' | 'banned') {
  if (userId === admin.id) throw fail('CANNOT_CHANGE_OWN_STATUS');
  await db.tx(async (q) => {
    const { rows } = await q.query('update users set status = $2 where id = $1 returning id', [userId, status]);
    if (!rows.length) throw fail('USER_NOT_FOUND');
    await audit(q, admin.id, 'set_status', userId, { status });
  });
}

/** Exclui a conta e todo o histórico dela (PM, frota, medalhas). Não dá para desfazer. */
export async function deleteUser(admin: User, userId: string) {
  if (userId === admin.id) throw fail('CANNOT_CHANGE_OWN_STATUS', 'Você não pode excluir a sua própria conta.');
  await db.tx(async (q) => {
    const { rows: [u] } = await q.query<{ email: string; nickname: string | null; role: string }>(
      'select email, nickname, role from users where id = $1 for update', [userId]);
    if (!u) throw fail('USER_NOT_FOUND');
    if (u.role === 'admin') throw fail('CANNOT_DELETE_ADMIN');
    const { rows: [t] } = await q.query<{ earned: number }>(
      `select coalesce(sum(amount) filter (where amount > 0), 0)::float8 as earned from points_ledger where user_id = $1`, [userId]);
    // registros que apontam para esta conta ficam, só perdem o vínculo
    await q.query('update points_ledger set created_by = null where created_by = $1', [userId]);
    await q.query('update user_aircraft set granted_by = null where granted_by = $1', [userId]);
    await q.query(`update admin_audit_log set details = details - 'email' - 'nickname' - 'name' - 'from' - 'to'
      where target_user_id = $1 or admin_id = $1 or details->>'email' = $2`, [userId, u.email]);
    await q.query('update admin_audit_log set target_user_id = null where target_user_id = $1', [userId]);
    await audit(q, admin.id, 'delete_user', null, { earned: t.earned });
    await q.query('delete from users where id = $1', [userId]);
  });
}

export async function setRole(admin: User, userId: string, role: 'player' | 'admin') {
  if (userId === admin.id) throw fail('CANNOT_CHANGE_OWN_STATUS', 'Você não pode alterar o seu próprio papel.');
  await db.tx(async (q) => {
    const { rows } = await q.query('update users set role = $2 where id = $1 returning id', [userId, role]);
    if (!rows.length) throw fail('USER_NOT_FOUND');
    await audit(q, admin.id, 'set_role', userId, { role });
  });
}

/** Troca o nickname de um jogador (erro de digitação, mudança de callsign). O histórico, a frota e as conquistas continuam com ele. */
export async function renamePlayer(admin: User, userId: string, raw: string) {
  const nick = raw.trim();
  if (!NICKNAME_RULE.test(nick)) throw fail('NICKNAME_INVALID');
  if (RESERVED.has(nick.toLowerCase())) throw fail('NICKNAME_RESERVED');
  await db.tx(async (q) => {
    const { rows: [u] } = await q.query<{ nickname: string | null }>('select nickname from users where id = $1 for update', [userId]);
    if (!u) throw fail('USER_NOT_FOUND');
    if (u.nickname === nick) throw fail('NICKNAME_UNCHANGED');
    try {
      await q.query('update users set nickname = $2 where id = $1', [userId, nick]);
    } catch (e) {
      if (isUniqueViolation(e)) throw fail('NICKNAME_TAKEN');
      throw e;
    }
    await audit(q, admin.id, 'rename_player', userId, { from: u.nickname, to: nick });
  });
}

// ---------------------------------------------------------------- aeronaves

export interface AircraftInput {
  name: string;
  tier: number;
  role: Role;
  row: number;
  icon?: string | null;
  restriction?: string | null;
  description?: string | null;
  active?: boolean;
  bound: string[];
  parents: string[];
}

/** Garante que as aeronaves referenciadas existem e que os vínculos Bound não formam ciclo */
async function checkLinks(q: Queryable, aircraftId: string, input: AircraftInput) {
  const { rows: [tier] } = await q.query('select 1 from tiers where tier = $1', [input.tier]);
  if (!tier) throw fail('TIER_NOT_FOUND');
  if (input.bound.includes(aircraftId) || input.parents.includes(aircraftId)) {
    throw fail('VALIDATION', 'Uma aeronave não pode estar ligada a ela mesma.');
  }
  const { aircraft } = await getTree({}, q);
  const ids = new Set(aircraft.map((a) => a.id));
  for (const r of [...input.bound, ...input.parents]) {
    if (!ids.has(r)) throw fail('AIRCRAFT_NOT_FOUND', `Aeronave inexistente: ${r}`);
  }
  const graph = new Map(aircraft.map((a) => [a.id, a.bound]));
  graph.set(aircraftId, input.bound);
  const seen = new Set<string>();
  const stack = [...input.bound];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === aircraftId) throw fail('BOUND_CYCLE');
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(graph.get(id) ?? []));
  }
}

async function writeLinks(q: Queryable, aircraftId: string, input: AircraftInput) {
  await q.query('delete from aircraft_bound where aircraft_id = $1', [aircraftId]);
  await q.query('delete from aircraft_family where aircraft_id = $1', [aircraftId]);
  for (const r of new Set(input.bound)) {
    await q.query('insert into aircraft_bound (aircraft_id, requires_id) values ($1, $2)', [aircraftId, r]);
  }
  for (const p of new Set(input.parents)) {
    await q.query('insert into aircraft_family (aircraft_id, parent_id) values ($1, $2)', [aircraftId, p]);
  }
}

const aircraftValues = (id: string, i: AircraftInput) =>
  [id, i.name, i.tier, i.role, i.row, i.icon || null, i.restriction?.trim() || null, i.description?.trim() || null, i.active ?? true];

export async function createAircraft(admin: User, id: string, input: AircraftInput) {
  await db.tx(async (q) => {
    await q.query('lock table aircraft, aircraft_bound, aircraft_family, tiers in share row exclusive mode');
    await checkLinks(q, id, input);
    try {
      await q.query(
        `insert into aircraft (id, name, tier, role, row, icon, restriction, description, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, aircraftValues(id, input));
    } catch (e) {
      if (isUniqueViolation(e)) throw fail('AIRCRAFT_EXISTS');
      throw e;
    }
    await writeLinks(q, id, input);
    validateTree(await getTree({}, q));
    await audit(q, admin.id, 'create_aircraft', null, { id, ...input });
  });
}

export async function updateAircraft(admin: User, id: string, input: AircraftInput) {
  await db.tx(async (q) => {
    await q.query('lock table aircraft, aircraft_bound, aircraft_family, tiers in share row exclusive mode');
    await checkLinks(q, id, input);
    const { rows } = await q.query(
      `update aircraft set name = $2, tier = $3, role = $4, row = $5, icon = $6, restriction = $7, description = $8, active = $9
        where id = $1 returning id`, aircraftValues(id, input));
    if (!rows.length) throw fail('AIRCRAFT_NOT_FOUND');
    await writeLinks(q, id, input);
    validateTree(await getTree({}, q));
    await audit(q, admin.id, 'update_aircraft', null, { id, ...input });
  });
}

// ---------------------------------------------------------------- tiers e configurações

export async function saveTier(admin: User, tier: number, input: { label: string; cost: number; multiplier: number }, isNew: boolean) {
  await db.tx(async (q) => {
    await q.query('lock table aircraft, aircraft_bound, aircraft_family, tiers in share row exclusive mode');
    if (isNew) {
      try {
        await q.query('insert into tiers (tier, label, cost, multiplier) values ($1, $2, $3, $4)',
          [tier, input.label, input.cost, input.multiplier]);
      } catch (e) {
        if (isUniqueViolation(e)) throw fail('TIER_EXISTS');
        throw e;
      }
    } else {
      const { rows } = await q.query('update tiers set label = $2, cost = $3, multiplier = $4 where tier = $1 returning tier',
        [tier, input.label, input.cost, input.multiplier]);
      if (!rows.length) throw fail('TIER_NOT_FOUND');
    }
    validateTree(await getTree({}, q));
    await audit(q, admin.id, isNew ? 'create_tier' : 'update_tier', null, { tier, ...input });
  });
}

export async function saveSettings(admin: User, input: { baseMissionPoints: number }) {
  await db.tx(async (q) => {
    await q.query(
      `insert into settings (key, value) values ('base_mission_points', $1)
       on conflict (key) do update set value = excluded.value`, [JSON.stringify(input.baseMissionPoints)]);
    await audit(q, admin.id, 'update_settings', null, input);
  });
}

// ---------------------------------------------------------------- atividade (auditoria)

const ACTION_GROUPS: Record<string, string[]> = {
  players: ['add_points', 'grant_aircraft', 'revoke_aircraft', 'set_status', 'set_role', 'rename_player', 'approve_user', 'reject_user', 'delete_user'],
  tree: ['create_aircraft', 'update_aircraft', 'create_tier', 'update_tier'],
  missions: ['create_mission', 'update_mission', 'cancel_mission', 'close_mission'],
  settings: ['update_settings'],
};

export async function getActivity(group: string | null, limit: number, offset: number) {
  const actions = group && ACTION_GROUPS[group] ? ACTION_GROUPS[group] : null;
  const [{ rows }, { rows: [count] }, names] = await Promise.all([
    db.query<{ id: string; action: string; details: { aircraft?: string; id?: string; name?: string } | null; adminId: string | null }>(
      `select l.id::text as id, l.action, l.details, l.created_at as "createdAt",
              l.admin_id as "adminId", a.nickname as "adminNickname", a.email as "adminEmail",
              l.target_user_id as "targetId", t.nickname as "targetNickname", t.email as "targetEmail"
         from admin_audit_log l
         left join users a on a.id = l.admin_id
         left join users t on t.id = l.target_user_id
        where ($1::text[] is null or l.action = any($1))
        order by l.created_at desc, l.id desc
        limit $2 offset $3`, [actions, limit, offset]),
    db.query<{ n: number }>('select count(*)::float8 as n from admin_audit_log where ($1::text[] is null or action = any($1))', [actions]),
    db.query<{ id: string; name: string }>('select id, name from aircraft'),
  ]);
  const nameOf = new Map(names.rows.map((r) => [r.id, r.name]));
  return {
    total: count.n,
    items: rows.map((r) => ({
      ...r,
      details: {
        ...(r.details ?? {}),
        ...(r.details?.aircraft ? { aircraftName: nameOf.get(r.details.aircraft) ?? r.details.aircraft } : {}),
        ...(r.details?.id ? { aircraftName: nameOf.get(r.details.id) ?? r.details.name ?? r.details.id } : {}),
      },
    })),
  };
}

// ---------------------------------------------------------------- visão geral

export async function getOverview() {
  const EARNED = `l.amount > 0 and l.source in ('manual', 'server')`;
  const [players, month, weekly, top, never, tiers, circ] = await Promise.all([
    db.query<{ active: number; banned: number; pending: number; awaiting: number; recent: number; admins: number }>(
      `select count(*) filter (where status = 'active' and nickname is not null)::float8 as active,
              count(*) filter (where status = 'banned')::float8 as banned,
              count(*) filter (where status = 'pending')::float8 as "awaiting",
              count(*) filter (where status = 'active' and nickname is null)::float8 as pending,
              count(*) filter (where created_at > now() - interval '30 days')::float8 as recent,
              count(*) filter (where role = 'admin')::float8 as admins
         from users`),
    // este mês x mês anterior
    db.query<{ m: string; distributed: number; spent: number; purchases: number; payers: number }>(
      `select to_char(date_trunc('month', l.created_at), 'YYYY-MM') as m,
              coalesce(sum(l.amount) filter (where ${EARNED}), 0)::float8 as distributed,
              (coalesce(-sum(l.amount) filter (where l.source = 'unlock'), 0) - coalesce(sum(l.amount) filter (where l.source = 'refund'), 0))::float8 as spent,
              (count(*) filter (where l.source = 'unlock') - count(*) filter (where l.source = 'refund' and l.aircraft_id is not null))::float8 as purchases,
              count(distinct l.user_id) filter (where ${EARNED})::float8 as payers
         from points_ledger l
        where l.created_at >= date_trunc('month', now()) - interval '1 month'
        group by 1 order by 1`),
    db.query<{ week: string; earned: number }>(
      `select to_char(w.week, 'YYYY-MM-DD') as week, coalesce(sum(l.amount), 0)::float8 as earned
         from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as w(week)
         left join points_ledger l on l.amount > 0 and l.source in ('manual', 'server') and date_trunc('week', l.created_at) = w.week
        group by w.week order by w.week`),
    // aeronaves mais compradas (tier de custo 0 não é compra)
    db.query(
      `select a.id, a.name, a.role, a.icon, a.tier, t.label as "tierLabel", t.cost,
              count(ua.user_id)::float8 as owners
         from aircraft a join tiers t on t.tier = a.tier
         left join user_aircraft ua on ua.aircraft_id = a.id
        where a.active and t.cost > 0
        group by a.id, t.label, t.cost
        order by owners desc, t.cost, a.name limit 8`),
    db.query(
      `select a.id, a.name, a.role, a.icon, a.tier, t.label as "tierLabel", t.cost
         from aircraft a join tiers t on t.tier = a.tier
        where a.active and t.cost > 0 and not exists (select 1 from user_aircraft ua where ua.aircraft_id = a.id)
        order by a.tier, a.name`),
    db.query(
      `select t.tier, t.label, t.cost,
              count(distinct a.id)::float8 as aircraft,
              count(ua.user_id)::float8 as purchases,
              (count(ua.user_id) * t.cost)::float8 as spent
         from tiers t left join aircraft a on a.tier = t.tier and a.active
         left join user_aircraft ua on ua.aircraft_id = a.id
        where t.cost > 0 group by t.tier, t.label, t.cost order by t.tier`),
    db.query<{ circulating: number; avg: number }>(
      `select coalesce(sum(b.balance), 0)::float8 as circulating, coalesce(avg(b.balance), 0)::float8 as avg
         from (select u.id, coalesce(sum(l.amount), 0) as balance
                 from users u left join points_ledger l on l.user_id = u.id
                where u.status = 'active' and u.nickname is not null group by u.id) b`),
  ]);
  const cur = new Date().toISOString().slice(0, 7);
  const prevDate = new Date(); prevDate.setUTCDate(1); prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prev = prevDate.toISOString().slice(0, 7);
  const blank = { distributed: 0, spent: 0, purchases: 0, payers: 0 };
  const pick = (m: string) => month.rows.find((r) => r.m === m) ?? blank;
  return {
    players: players.rows[0],
    month: { current: pick(cur), previous: pick(prev) },
    circulation: circ.rows[0],
    weekly: weekly.rows,
    topAircraft: top.rows,
    neverBought: never.rows,
    tiers: tiers.rows,
  };
}
