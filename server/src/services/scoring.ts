import { z } from 'zod';
import { db } from '../db.js';
import type { User } from './users.js';

const points = z.number().int().min(0).max(1_000_000);
export const scoringRulesSchema = z.object({
  airborneAircraft: points, groundAircraft: points, armoredVehicle: points,
  antiAircraft: points, helicopter: points, ship: points, sam: points,
  helicopterTransport: points, cargoTransport: points,
  survivalEnabled: z.boolean(), survivalMultiplier: z.number().min(1).max(10),
}).strict();
export type ScoringRules = z.infer<typeof scoringRulesSchema>;
export const DEFAULT_SCORING_RULES: ScoringRules = {
  airborneAircraft: 200, groundAircraft: 100, armoredVehicle: 100, antiAircraft: 150,
  helicopter: 150, ship: 250, sam: 200, helicopterTransport: 500, cargoTransport: 500,
  survivalEnabled: true, survivalMultiplier: 1.5,
};

export async function getScoringRules(): Promise<ScoringRules> {
  const { rows } = await db.query<{ value: unknown }>("select value from settings where key='mission_scoring_rules'");
  return rows.length ? scoringRulesSchema.parse(rows[0].value) : { ...DEFAULT_SCORING_RULES };
}

export async function saveScoringRules(admin: User, input: unknown): Promise<ScoringRules> {
  const rules = scoringRulesSchema.parse(input);
  await db.tx(async (query) => {
    await query.query("insert into settings(key,value) values ('mission_scoring_rules',$1) on conflict(key) do update set value=excluded.value", [JSON.stringify(rules)]);
    await query.query("insert into admin_audit_log(admin_id,action,details) values ($1,'update_scoring_rules',$2)", [admin.id, JSON.stringify(rules)]);
  });
  return rules;
}
