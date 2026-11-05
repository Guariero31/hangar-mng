import type { ReportPilot, ReportTarget } from '../../api/types';
import { REPORT_TARGETS } from '../../lib/mission-report';

export interface Doubt { kind: 'unclaimed' | 'vanished'; tSec: number | null; label: string; detail: string; category?: ReportTarget; pilot?: string }
export interface AnalyzedPilot { name: string; key: string; aircraft: string[]; deaths: number; survived: boolean; counts: Partial<Record<ReportTarget, number>> }

export const nameKey = (raw: string) => (raw.includes('|') ? raw.slice(raw.lastIndexOf('|') + 1) : raw).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const mmss = (sec: number | null) => (sec == null ? '' : `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
export const zeroCounts = () => Object.fromEntries(REPORT_TARGETS.map(({ key }) => [key, 0])) as Record<ReportTarget, number>;
export const totalTargets = (p: ReportPilot) => REPORT_TARGETS.reduce((n, { key }) => n + p.counts[key], 0);
