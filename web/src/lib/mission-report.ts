import type { MissionReport, ReportPilot, ReportTarget, ScoringRules } from '../api/types';

export const REPORT_TARGETS: { key: ReportTarget; label: string; transport?: boolean }[] = [
  { key: 'airborneAircraft', label: 'Aeronaves em voo' }, { key: 'groundAircraft', label: 'Aeronaves no solo' },
  { key: 'armoredVehicle', label: 'Blindados' }, { key: 'antiAircraft', label: 'Veículos antiaéreos' },
  { key: 'helicopter', label: 'Helicópteros' }, { key: 'ship', label: 'Navios' }, { key: 'sam', label: 'SAM' },
  { key: 'helicopterTransport', label: 'Objetivos por helicóptero', transport: true }, { key: 'cargoTransport', label: 'Objetivos por avião de carga', transport: true },
];
export function reportPilot(userId: string, nickname: string, aircraftId: string, aircraftName: string): ReportPilot {
  return { userId, nickname, aircraftId, aircraftName, attended: null, survived: null, reviewed: false,
    counts: Object.fromEntries(REPORT_TARGETS.map(({ key }) => [key, 0])) as Record<ReportTarget, number>, notes: '', subtotal: 0, aircraftMultiplier: 1, aircraftBonus: 0, multiplier: 1, survivalBonus: 0, total: 0, breakdown: [] };
}
export function previewPilot(pilot: ReportPilot, rules: ScoringRules, aircraftMultiplier = 1) {
  const subtotal = pilot.attended ? REPORT_TARGETS.reduce((sum, { key }) => sum + pilot.counts[key] * rules[key], 0) : 0;
  const multiplier = pilot.attended && pilot.survived && rules.survivalEnabled ? rules.survivalMultiplier : 1;
  const aircraftFactor = pilot.attended ? aircraftMultiplier : 1;
  const aircraftBonus = Math.round(subtotal * (aircraftFactor - 1));
  const total = Math.round(subtotal * (1 + (aircraftFactor - 1) + (multiplier - 1)));
  return { subtotal, aircraftMultiplier: aircraftFactor, aircraftBonus, multiplier, survivalBonus: total - subtotal - aircraftBonus, total };
}
export function reportPayload(report: MissionReport) {
  return { version: report.version, rulesFingerprint: report.rulesFingerprint, summary: report.summary, source: report.source,
    pilots: report.pilots.map(({ userId, aircraftId, attended, survived, counts, notes, reviewed }) => ({ userId, aircraftId, attended, survived, counts, notes, reviewed })) };
}
export const reportWhen = (date: string) => new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
