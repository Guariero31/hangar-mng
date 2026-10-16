import { z } from 'zod';
import { createHash } from 'node:crypto';
import { db, type Queryable } from '../db.js';
import { fail } from '../errors.js';
import { DEFAULT_SCORING_RULES, scoringRulesSchema, type ScoringRules } from './scoring.js';
import type { User } from './users.js';

export const REPORT_TARGETS = [
  ['airborneAircraft', 'Aeronave em voo'], ['groundAircraft', 'Aeronave no solo'],
  ['armoredVehicle', 'Veículo blindado'], ['antiAircraft', 'Veículo antiaéreo'],
  ['helicopter', 'Helicóptero'], ['ship', 'Navio'], ['sam', 'SAM'],
  ['helicopterTransport', 'Transporte por helicóptero'], ['cargoTransport', 'Avião de carga'],
] as const;
const count = z.number().int().min(0).max(10000);
const countsSchema = z.object({ airborneAircraft: count, groundAircraft: count, armoredVehicle: count, antiAircraft: count,
  helicopter: count, ship: count, sam: count, helicopterTransport: count, cargoTransport: count }).strict();
const pilotSchema = z.object({ userId: z.string().uuid(), aircraftId: z.string().min(1).max(32),
  attended: z.boolean().nullable(), survived: z.boolean().nullable(), counts: countsSchema,
  notes: z.string().trim().max(2000), reviewed: z.boolean() }).strict();
export const reportInputSchema = z.object({ version: z.number().int().min(0), rulesFingerprint: z.string().length(64), summary: z.string().trim().max(10000),
  source: z.string().trim().max(2000), pilots: z.array(pilotSchema).max(500) }).strict();
type PilotInput = z.infer<typeof pilotSchema>;
type ReportInput = z.infer<typeof reportInputSchema>;
type PilotResult = PilotInput & { nickname: string; aircraftName: string; subtotal: number; multiplier: number; total: number;
  breakdown: { key: string; label: string; quantity: number; unitPoints: number; points: number }[] };
interface ReportRow { mission_id: string; state: 'draft' | 'published'; version: number; rules: ScoringRules; pilots: PilotResult[];
  summary: string; source: string; saved_at: Date; published_at: Date | null; published_name: string | null }

function adminOnly(user: User) { if (user.role !== 'admin') throw fail('FORBIDDEN'); }
const emptyCounts = () => Object.fromEntries(REPORT_TARGETS.map(([key]) => [key, 0])) as PilotInput['counts'];
const fingerprint = (rules: ScoringRules) => createHash('sha256').update(JSON.stringify(scoringRulesSchema.parse(rules))).digest('hex');
function present(row: ReportRow) {
  return { missionId: row.mission_id, state: row.state, version: row.version, rulesFingerprint: fingerprint(row.rules), rules: row.rules, pilots: row.pilots,
    summary: row.summary, source: row.source, savedAt: row.saved_at, publishedAt: row.published_at,
    publishedBy: row.published_name, total: row.pilots.reduce((sum, pilot) => sum + pilot.total, 0) };
}
export function calculatePilot(pilot: PilotInput, rules: ScoringRules) {
  const breakdown = REPORT_TARGETS.map(([key, label]) => ({ key, label, quantity: pilot.counts[key], unitPoints: rules[key], points: pilot.counts[key] * rules[key] }));
  const subtotal = pilot.attended ? breakdown.reduce((sum, item) => sum + item.points, 0) : 0;
  const multiplier = pilot.attended && pilot.survived && rules.survivalEnabled ? rules.survivalMultiplier : 1;
  const total = Math.round(subtotal * multiplier);
  if (total > 1_000_000) throw fail('VALIDATION', 'A pontuação por piloto deve ser de até 1.000.000 PM.');
  return { breakdown, subtotal, multiplier, total };
}

export async function getMissionReport(user: User, id: string, editing = false) {
  if (editing) adminOnly(user);
  const mission = (await db.query<{ status: string }>('select status from missions where id=$1', [id])).rows[0];
  if (!mission) throw fail('MISSION_NOT_FOUND');
  const row = (await db.query<ReportRow>('select * from mission_reports where mission_id=$1', [id])).rows[0];
  if (row?.state === 'published' || (editing && row)) return present(row);
  if (!editing) throw fail('VALIDATION', 'O relatório desta operação ainda não foi publicado.');
  if (mission.status !== 'scheduled') throw fail('MISSION_NOT_OPEN');
  const rulesRow = (await db.query<{ value: ScoringRules }>("select value from settings where key='mission_scoring_rules'")).rows[0];
  const rules = rulesRow ? scoringRulesSchema.parse(rulesRow.value) : { ...DEFAULT_SCORING_RULES };
  const { rows } = await db.query<{ userId: string; nickname: string; aircraftId: string; aircraftName: string }>(
    `select s.user_id as "userId",u.nickname,s.aircraft_id as "aircraftId",a.name as "aircraftName"
     from mission_signups s join users u on u.id=s.user_id join aircraft a on a.id=s.aircraft_id where s.mission_id=$1 order by s.created_at`, [id]);
  const pilots = rows.map((pilot) => ({ ...pilot, attended: null, survived: null, counts: emptyCounts(), notes: '', reviewed: false, subtotal: 0, multiplier: 1, total: 0, breakdown: [] }));
  return { missionId: id, state: 'draft' as const, version: 0, rulesFingerprint: fingerprint(rules), rules, pilots, summary: '', source: '', savedAt: null, publishedAt: null, publishedBy: null, total: 0 };
}

async function results(query: Queryable, input: ReportInput, rules: ScoringRules, publish: boolean, missionId: string): Promise<PilotResult[]> {
  if (new Set(input.pilots.map((pilot) => pilot.userId)).size !== input.pilots.length) throw fail('VALIDATION', 'Um piloto aparece mais de uma vez no relatório.');
  const signed = (await query.query<{ user_id: string }>('select user_id from mission_signups where mission_id=$1', [missionId])).rows;
  if (signed.some((pilot) => !input.pilots.some((item) => item.userId === pilot.user_id))) throw fail('VALIDATION', 'Inclua todos os inscritos e marque os ausentes como não participantes.');
  const users = await query.query<{ id: string; nickname: string }>('select id,nickname from users where id=any($1)', [input.pilots.map((pilot) => pilot.userId)]);
  const aircraft = await query.query<{ id: string; name: string }>('select id,name from aircraft where id=any($1)', [input.pilots.map((pilot) => pilot.aircraftId)]);
  return input.pilots.map((pilot) => {
    const user = users.rows.find((item) => item.id === pilot.userId);
    const plane = aircraft.rows.find((item) => item.id === pilot.aircraftId);
    if (!user?.nickname || !plane) throw fail('VALIDATION', 'Piloto ou aeronave indisponível. Reabra o relatório para atualizar os dados.');
    if (publish && (!pilot.reviewed || pilot.attended === null || (pilot.attended && pilot.survived === null))) throw fail('VALIDATION', `Confira a participação, sobrevivência e os resultados de ${user.nickname}.`);
    if (!pilot.attended && REPORT_TARGETS.some(([key]) => pilot.counts[key] > 0)) throw fail('VALIDATION', `Um piloto ausente não pode ter resultados: ${user.nickname}.`);
    return { ...pilot, nickname: user.nickname, aircraftName: plane.name, ...calculatePilot(pilot, rules) };
  });
}

export async function saveMissionReport(admin: User, id: string, body: unknown, publish = false) {
  adminOnly(admin);
  const input = reportInputSchema.parse(body);
  return db.tx(async (query) => {
    const mission = (await query.query<{ status: string; title: string }>('select status,title from missions where id=$1 for update', [id])).rows[0];
    if (!mission) throw fail('MISSION_NOT_FOUND');
    const previous = (await query.query<ReportRow>('select * from mission_reports where mission_id=$1', [id])).rows[0];
    // A retry after a lost publication response must never credit the pilots again.
    if (publish && previous?.state === 'published') return present(previous);
    if (mission.status !== 'scheduled' || previous?.state === 'published') throw fail('MISSION_NOT_OPEN');
    if (input.version !== (previous?.version ?? 0)) throw fail('VALIDATION', 'Este relatório foi atualizado por outro administrador. Reabra a página antes de continuar.');
    const savedRules = (await query.query<{ value: ScoringRules }>("select value from settings where key='mission_scoring_rules'")).rows[0];
    const rules = previous?.rules ?? (savedRules ? scoringRulesSchema.parse(savedRules.value) : { ...DEFAULT_SCORING_RULES });
    if (input.rulesFingerprint !== fingerprint(rules)) throw fail('VALIDATION', 'As regras de pontuação mudaram. Reabra o relatório e confira os valores antes de continuar.');
    const pilots = await results(query, input, rules, publish, id);
    if (publish) {
      for (const pilot of pilots) {
        await query.query(`insert into mission_signups(mission_id,user_id,aircraft_id,attended,pm_awarded) values ($1,$2,$3,$4,$5)
          on conflict(mission_id,user_id) do update set aircraft_id=excluded.aircraft_id,attended=excluded.attended,pm_awarded=excluded.pm_awarded`,
        [id, pilot.userId, pilot.aircraftId, pilot.attended, pilot.total]);
        if (pilot.total > 0) await query.query(`insert into points_ledger(user_id,amount,reason,source,created_by,external_ref)
          values ($1,$2,$3,'manual',$4,$5)`, [pilot.userId, pilot.total, `Relatório: ${mission.title}`.slice(0, 200), admin.id, `mission-report:${id}:${pilot.userId}`]);
      }
      await query.query("update missions set status='closed',closed_at=now() where id=$1", [id]);
    }
    const { rows } = await query.query<ReportRow>(`insert into mission_reports(mission_id,state,version,rules,pilots,summary,source,saved_by,published_by,published_name,published_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $2='published' then now() else null end)
      on conflict(mission_id) do update set state=excluded.state,version=excluded.version,rules=excluded.rules,pilots=excluded.pilots,
        summary=excluded.summary,source=excluded.source,saved_by=excluded.saved_by,saved_at=now(),published_by=excluded.published_by,
        published_name=excluded.published_name,published_at=excluded.published_at returning *`,
    [id, publish ? 'published' : 'draft', input.version + 1, JSON.stringify(rules), JSON.stringify(pilots), input.summary, input.source, admin.id, publish ? admin.id : null, publish ? admin.nickname ?? admin.email : null]);
    await query.query('insert into admin_audit_log(admin_id,action,details) values ($1,$2,$3)', [admin.id, publish ? 'publish_mission_report' : 'save_mission_report', JSON.stringify({ id, title: mission.title, totalPm: pilots.reduce((sum, pilot) => sum + pilot.total, 0), pilots: pilots.filter((pilot) => pilot.attended).length })]);
    return present(rows[0]);
  });
}
