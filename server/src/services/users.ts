import { ACHIEVEMENTS, syncAchievements, topMedals } from './achievements.js';
import { getTechTreeState } from './techtree.js';
import { db, type Queryable } from '../db.js';
import { config } from '../config.js';
import { fail, isUniqueViolation } from '../errors.js';
import { sendWelcome } from './mail.js';

export interface User {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  nickname: string | null;
  role: 'player' | 'admin';
  status: 'pending' | 'active' | 'banned' | 'rejected';
  created_at: Date;
  last_login_at: Date | null;
  goal_aircraft_id: string | null;
  goal_ready_for: string | null;
  goal_ready_at: Date | null;
  news_seen_at: Date;
  tutorial_status: 'completed' | 'skipped' | null;
  tutorial_modules: number[];
}

export const NICKNAME_RULE = /^[A-Za-z0-9_]{3,16}$/;
export const RESERVED = new Set(['admin', 'administrador', 'adm', 'moderador', 'mod', 'staff', 'suporte', 'system', 'server', 'sistema']);

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await db.query<User>('select * from users where id = $1', [id]);
  return rows[0] ?? null;
}

export async function getBalance(userId: string, q: Queryable = db): Promise<number> {
  const { rows } = await q.query<{ balance: number }>(
    'select coalesce(sum(amount), 0)::float8 as balance from points_ledger where user_id = $1', [userId]);
  return rows[0].balance;
}

/** Cria ou atualiza o usuário a partir dos dados do Google (ou do login de desenvolvimento) */
export async function upsertLogin(p: { sub: string; email: string; name?: string | null; picture?: string | null }): Promise<User> {
  // Only configured administrators bypass approval, including during initial setup.
  const email = p.email.toLowerCase();
  const startStatus = !config.requireApproval || config.adminEmails.includes(email) ? 'active' : 'pending';
  const { rows: known } = await db.query('select 1 from users where google_sub = $1', [p.sub]);
  const { rows } = await db.query<User>(
    `insert into users (google_sub, email, name, avatar_url, last_login_at, status)
     values ($1, $2, $3, $4, now(), $5)
     on conflict (google_sub) do update
       set email = excluded.email, name = excluded.name,
           avatar_url = excluded.avatar_url, last_login_at = now()
     returning *`,
    [p.sub, email, p.name ?? null, p.picture ?? null, startStatus]);
  let user = rows[0];

  if (user.role !== 'admin' && config.adminEmails.includes(user.email)) {
    ({ rows: [user] } = await db.query<User>(`update users set role = 'admin', status = case when status in ('pending') then 'active' else status end where id = $1 returning *`, [user.id]));
  }
  // e-mail de boas-vindas: só no primeiro cadastro que ficou aguardando aprovação
  if (!known.length && user.status === 'pending') sendWelcome(user);
  return user;
}

export async function isNicknameAvailable(raw: string): Promise<boolean> {
  const nick = raw.trim();
  if (!NICKNAME_RULE.test(nick) || RESERVED.has(nick.toLowerCase())) return false;
  const { rows } = await db.query('select 1 from users where lower(nickname) = lower($1)', [nick]);
  return rows.length === 0;
}

export async function setNickname(user: User, raw: string): Promise<User> {
  const nick = raw.trim();
  if (user.nickname) throw fail('NICKNAME_ALREADY_SET');
  if (!NICKNAME_RULE.test(nick)) throw fail('NICKNAME_INVALID');
  if (RESERVED.has(nick.toLowerCase())) throw fail('NICKNAME_RESERVED');
  try {
    const { rows } = await db.query<User>(
      'update users set nickname = $2 where id = $1 and nickname is null returning *', [user.id, nick]);
    if (!rows[0]) throw fail('NICKNAME_ALREADY_SET');
    return rows[0];
  } catch (e) {
    if (isUniqueViolation(e)) throw fail('NICKNAME_TAKEN');
    throw e;
  }
}

/** O que o front-end recebe sobre o usuário logado */
export async function toMe(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    nickname: user.nickname,
    tutorialStatus: user.tutorial_status,
    tutorialModules: user.tutorial_modules,
    role: user.role,
    status: user.status,
    goalAircraftId: user.goal_aircraft_id,
    medals: (await topMedals([user.id])).get(user.id) ?? [],
    balance: await getBalance(user.id),
  };
}

/** Define (ou limpa, com null) a aeronave-meta do piloto */
export async function setGoal(user: User, aircraftId: string | null) {
  if (aircraftId) {
    const { rows } = await db.query('select 1 from aircraft where id = $1 and active', [aircraftId]);
    if (!rows.length) throw fail('AIRCRAFT_NOT_FOUND');
  }
  await db.query('update users set goal_aircraft_id = $2, goal_ready_for = null, goal_ready_at = null where id = $1', [user.id, aircraftId]);
}

export async function setTutorialStatus(user: User, status: 'completed' | 'skipped'): Promise<User> {
  if (!user.nickname) throw fail('NICKNAME_REQUIRED');
  const { rows } = await db.query<User>(
    `update users set tutorial_status = case when tutorial_status = 'completed' then tutorial_status else $2 end
     where id = $1 returning *`, [user.id, status]);
  return rows[0];
}

export async function completeTutorialModule(user: User, moduleId: number): Promise<User> {
  if (!user.nickname) throw fail('NICKNAME_REQUIRED');
  if (![1, 2, 3].includes(moduleId)) throw fail('VALIDATION');
  const { rows } = await db.query<User>(
    `update users set tutorial_modules = array(select distinct module from unnest(tutorial_modules || array[$2::int]) module order by module),
     tutorial_status = case when cardinality(array(select distinct module from unnest(tutorial_modules || array[$2::int]) module)) = 3
       then 'completed' else tutorial_status end where id = $1 returning *`, [user.id, moduleId]);
  return rows[0];
}

/** Novidades vindas do admin (PM lançados, reembolsos, aeronaves liberadas) desde a última vez que o piloto olhou */
export async function getNews(user: User) {
  const { rows } = await db.query<{ kind: string; amount: number; reason: string; createdAt: Date; unread: boolean; missionId: string | null }>(
    `select * from (
       select 'points' as kind, l.amount, l.reason, l.created_at as "createdAt", l.created_at > $2 as unread, null::uuid as "missionId"
         from points_ledger l
        where l.user_id = $1 and l.source in ('manual', 'server', 'refund') and (l.created_by is null or l.created_by <> $1)
          and (l.external_ref is null or l.external_ref not like 'mission-report:%')
       union all
       select 'grant' as kind, 0 as amount, 'Aeronave liberada: ' || a.name as reason, ua.unlocked_at as "createdAt", ua.unlocked_at > $2 as unread, null::uuid as "missionId"
         from user_aircraft ua join aircraft a on a.id = ua.aircraft_id
        where ua.user_id = $1 and ua.granted_by is not null and ua.granted_by <> $1
       union all
       select 'report' as kind, s.pm_awarded as amount, 'Relatório publicado: ' || m.title as reason,
         report.published_at as "createdAt", report.published_at > $2 as unread, m.id as "missionId"
         from mission_reports report join missions m on m.id=report.mission_id
         join mission_signups s on s.mission_id=m.id and s.user_id=$1
        where report.state='published'
       union all
       select 'mission' as kind, 0 as amount, 'Nova missão: ' || m.title as reason, m.created_at as "createdAt", m.created_at > $2 as unread, m.id as "missionId"
         from missions m
        where m.status = 'scheduled' and m.created_at > (select created_at from users where id = $1)
          and m.created_at > now() - interval '30 days'
          and (m.series_id is null or m.id = (select s.id from missions s where s.series_id = m.series_id order by s.starts_at limit 1))
     ) t order by "createdAt" desc limit 15`, [user.id, user.news_seen_at]);
  await syncAchievements(user);
  const goalItem = await goalReadyItem(user);
  const ach = await db.query<{ key: string; earned_at: Date }>('select key, earned_at from user_achievements where user_id = $1', [user.id]);
  const medals = ach.rows.flatMap((r) => {
    const d = ACHIEVEMENTS.find((x) => x.key === r.key);
    return d ? [{ kind: 'achievement', amount: 0, reason: `Conquista: ${d.name}`, icon: d.icon, rarity: d.rarity, createdAt: r.earned_at, unread: r.earned_at > user.news_seen_at }] : [];
  });
  const items = [...rows, ...medals, ...(goalItem ? [goalItem] : [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 15);
  return { unread: items.filter((r) => r.unread).length, items };
}

/** "Sua meta já pode ser comprada": avisa uma vez por meta, e de novo se o PM cair abaixo do custo e voltar a subir. */
async function goalReadyItem(user: User) {
  if (!user.goal_aircraft_id) return null;
  const state = await getTechTreeState(user.id);
  const goal = state.aircraft.find((a) => a.id === user.goal_aircraft_id);
  const ready = !!goal && !goal.owned && goal.affordable;
  if (!ready) {
    if (user.goal_ready_for) await db.query('update users set goal_ready_for = null, goal_ready_at = null where id = $1', [user.id]);
    return null;
  }
  let at = user.goal_ready_at;
  if (user.goal_ready_for !== goal.id || !at) {
    const { rows } = await db.query<{ at: Date }>(
      'update users set goal_ready_for = $2, goal_ready_at = now() where id = $1 returning goal_ready_at as at', [user.id, goal.id]);
    at = rows[0].at;
  }
  return { kind: 'goal', amount: 0, reason: `Sua meta já pode ser comprada: ${goal.name} (${goal.cost.toLocaleString('pt-BR')} PM)`,
    createdAt: at, unread: at > user.news_seen_at };
}

export async function markNewsSeen(user: User) {
  await db.query('update users set news_seen_at = now() where id = $1', [user.id]);
}

export async function getHistory(userId: string, limit = 50, offset = 0) {
  const { rows } = await db.query(
    `select id, amount, reason, source, created_at as "createdAt"
       from points_ledger where user_id = $1
      order by created_at desc, id desc limit $2 offset $3`, [userId, limit, offset]);
  return rows;
}

export async function getHistoryPage(userId: string, limit = 50, offset = 0) {
  const [items, { rows: [count] }] = await Promise.all([
    getHistory(userId, limit, offset),
    db.query<{ total: number }>('select count(*)::float8 as total from points_ledger where user_id = $1', [userId]),
  ]);
  return { items, total: count.total };
}
