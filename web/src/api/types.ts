export type Role = 'player' | 'admin';
export type Status = 'pending' | 'active' | 'banned' | 'rejected';
export type LedgerSource = 'manual' | 'unlock' | 'refund' | 'server';

export interface Me {
  tutorialStatus: 'completed' | 'skipped' | null;
  tutorialModules: number[];
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  nickname: string | null;
  role: Role;
  status: Status;
  goalAircraftId: string | null;
  medals: MedalLite[];
  balance: number;
}

export type Rarity = 'common' | 'rare' | 'legendary';
export interface MedalLite { key: string; name: string; icon: string; rarity: Rarity }

export interface NewsItem { kind: 'points' | 'grant' | 'achievement' | 'goal' | 'mission' | 'report'; amount: number; reason: string; createdAt: string; unread: boolean; icon?: string; rarity?: Rarity; missionId?: string | null }
export interface News { unread: number; items: NewsItem[] }

export interface AuthConfig {
  googleClientId: string | null;
  devLogin: boolean;
}

export type AircraftRole = 'fighter' | 'multi' | 'attack' | 'aheli' | 'theli' | 'tplane';

export interface Tier {
  tier: number;
  label: string;
  cost: number;
  /** bônus de PM ao voar aeronaves deste tier */
  multiplier: number;
}

export interface Band {
  id: number;
  name: string;
  rowStart: number;
  rowEnd: number;
}

export interface Aircraft {
  id: string;
  name: string;
  tier: number;
  role: AircraftRole;
  /** linha (posição vertical) na árvore */
  row: number;
  icon: string | null;
  /** restrição de armamento (época) */
  restriction: string | null;
  description: string | null;
  active: boolean;
  /** Regra 2: aeronaves obrigatórias (linha magenta) */
  bound: string[];
  /** aeronaves mãe: a Regra 1 exige ter ao menos uma delas */
  parents: string[];
}

export interface TreeAircraft extends Aircraft {
  cost: number;
  owned: boolean;
  /** regras 1 e 2 atendidas e ainda não comprada */
  available: boolean;
  /** disponível e com saldo suficiente */
  affordable: boolean;
  lockReason: 'previous_tier' | 'bound' | null;
  missingBound: string[];
  /** mães ativas, uma delas é exigida (vazio = qualquer aeronave do tier anterior) */
  needAnyOf: string[];
}

export interface TechTreeState {
  balance: number;
  tiers: Tier[];
  bands: Band[];
  /** PM médio por missão (média real dos pilotos); 0 enquanto não há missão encerrada. */
  baseMissionPoints: number;
  baseMissionSample: number;
  /** Média de PM por missão de todos os pilotos do esquadrão (0 sem missão encerrada). */
  squadAverage: number;
  squadSample: number;
  aircraft: TreeAircraft[];
}

export interface MissionSignup { missionId: string; userId: string; nickname: string; aircraftId: string; aircraftName: string; attended: boolean; pmAwarded: number }
export interface Mission {
  slug: string | null;
  hasReport: boolean;
  imageAsset: MissionAsset | null; briefingAsset: MissionAsset | null; audioAsset: MissionAsset | null;
  mapName: string; briefingImageUrl: string;
  /** Tier da missão, entre os cadastrados na progressão. Nulo nas missões antigas. */
  tier: number | null;
  ribbons: MissionRibbon[];
  id: string; title: string; briefing: string; startsAt: string; defaultPm: number | null;
  status: 'scheduled' | 'closed' | 'cancelled'; seriesId: string | null; closedAt: string | null;
  signups: MissionSignup[]; mine: MissionSignup | null;
}
export interface MissionRibbon { id: string; name: string; description: string; allowsValor: boolean; hasImage: boolean; imageVersion: number }
export interface MissionAsset { id: string; name: string; url: string; expiresAt: number }
export interface MusicTrack extends MissionAsset { uses: number; size: number }
export interface ScoringRules {
  airborneAircraft: number; groundAircraft: number; armoredVehicle: number; antiAircraft: number;
  helicopter: number; ship: number; sam: number; helicopterTransport: number; cargoTransport: number;
  survivalEnabled: boolean; survivalMultiplier: number;
  /** Bônus por diferença de tier: posição 0 = aeronave 1 tier abaixo da missão, 1 = 2 abaixo... */
  tierBonuses: number[];
}
export type ReportTarget = Exclude<keyof ScoringRules, 'survivalEnabled' | 'survivalMultiplier' | 'tierBonuses'>;
export interface ReportPilot {
  userId: string; nickname: string; aircraftId: string; aircraftName: string;
  attended: boolean | null; survived: boolean | null; reviewed: boolean;
  counts: Record<ReportTarget, number>; notes: string;
  subtotal: number; aircraftMultiplier?: number; aircraftBonus?: number; multiplier: number; survivalBonus?: number; total: number;
  breakdown: { key: string; label: string; quantity: number; unitPoints: number; points: number }[];
}
export interface MissionReport {
  missionId: string; state: 'draft' | 'published'; version: number; rulesFingerprint: string; rules: ScoringRules;
  pilots: ReportPilot[]; summary: string; source: string; savedAt: string | null;
  publishedAt: string | null; publishedBy: string | null; total: number;
}
export interface MissionInput { title: string; briefing: string; startsAt: string; defaultPm: number | null; repeatWeeks?: number; mapName?: string; briefingImageUrl?: string; imageAssetId?: string | null; briefingAssetId?: string | null; audioAssetId?: string | null; tier?: number | null; ribbonIds?: string[] }

export interface AdminTree {
  tiers: Tier[];
  bands: Band[];
  baseMissionPoints: number;
  baseMissionSample: number;
  aircraft: Aircraft[];
}

export interface LedgerEntry {
  id: number;
  amount: number;
  reason: string;
  source: LedgerSource;
  createdAt: string;
  createdBy?: string | null;
}

export interface PlayerRow {
  id: string;
  nickname: string | null;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: Role;
  status: Status;
  createdAt: string;
  lastLoginAt: string | null;
  balance: number;
  earned: number;
  aircraftCount: number;
  dcsLinked: boolean;
}

export interface PlayerDetail {
  user: {
    id: string;
    nickname: string | null;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    role: Role;
    status: Status;
    createdAt: string;
    lastLoginAt: string | null;
  };
  balance: number;
  aircraft: { aircraftId: string; name: string; tier: number; tierLabel: string; cost: number; unlockedAt: string; grantedBy: string | null }[];
  ledger: LedgerEntry[];
  dcsLink: { ucid: string; linkedAt: string } | null;
  achievements: Achievements;
}

export interface RackRibbon { id: string; name: string; description: string; category: string; allowsValor: boolean; imageVersion: number; hasImage: boolean; count: number; valor: boolean; lastAt: string }
export interface Profile {
  user: { nickname: string; email: string; avatarUrl: string | null; role: Role; createdAt: string; medals: MedalLite[] };
  rank: { position: number | null; total: number };
  ribbons: RackRibbon[];
  totals: { balance: number; earned: number; spent: number; refunded: number; fleet: number; aircraftTotal: number };
  estimate: { baseMissionPoints: number; perMission: number };
  byTier: { tier: number; label: string; cost: number; multiplier: number; owned: number; total: number }[];
  byRole: { role: AircraftRole; owned: number; total: number }[];
  nextGoals: { id: string; name: string; role: AircraftRole; icon: string | null; tierLabel: string; cost: number; missing: number }[];
  fleet: { id: string; name: string; role: AircraftRole; icon: string | null; tier: number; tierLabel: string; unlockedAt: string | null }[];
  weekly: { week: string; earned: number }[];
  timeline: { kind: 'points' | 'grant' | 'achievement' | 'goal'; id: string; amount: number; reason: string; source: LedgerSource | 'grant'; createdAt: string }[];
}

export interface Achievement {
  key: string; name: string; desc: string; rarity: 'common' | 'rare' | 'legendary'; icon: string;
  earnedAt: string | null; current: number; target: number; hint?: string;
}
export interface Achievements { earned: number; total: number; items: Achievement[] }

export interface ActivityItem {
  id: string; action: string; createdAt: string;
  adminId: string | null; adminNickname: string | null; adminEmail: string | null;
  targetId: string | null; targetNickname: string | null; targetEmail: string | null;
  details: {
    amount?: number; reason?: string; batch?: number; aircraftName?: string; aircraft?: string;
    refund?: boolean; status?: string; from?: string | null; to?: string; email?: string;
    nickname?: string; role?: string; name?: string; id?: string; active?: boolean;
    label?: string; tier?: number; cost?: number; multiplier?: number; baseMissionPoints?: number;
    title?: string; image?: boolean; ribbon?: string; valor?: boolean; copies?: number; pilots?: number; totalPm?: number;
  };
}
export interface ApprovalItem { id: string; email: string; name: string | null; avatarUrl: string | null; status: 'pending' | 'rejected'; createdAt: string; decidedAt: string | null }
export interface Approvals { total: number; pending: number; items: ApprovalItem[] }
export interface Activity { total: number; items: ActivityItem[] }

export interface OverviewAircraft { id: string; name: string; role: AircraftRole; icon: string | null; tier: number; tierLabel: string; cost: number; owners?: number }
export interface MonthStats { distributed: number; spent: number; purchases: number; payers: number }
export interface Overview {
  players: { active: number; banned: number; awaiting: number; pending: number; recent: number; admins: number };
  month: { current: MonthStats; previous: MonthStats };
  circulation: { circulating: number; avg: number };
  weekly: { week: string; earned: number }[];
  topAircraft: OverviewAircraft[];
  neverBought: OverviewAircraft[];
  tiers: { tier: number; label: string; cost: number; aircraft: number; purchases: number; spent: number }[];
}

export interface RankingItem {
  id: string; nickname: string; avatarUrl: string | null; createdAt: string;
  pos: number; earned: number; fleet: number; medals: MedalLite[]; medalCount: number; tied: number;
}
export type RankingPeriod = 'all' | 'month';
export interface Ranking {
  meId: string; total: number; aircraftTotal: number; items: RankingItem[];
  period: RankingPeriod; periodLabel: string; podium: RankingItem[];
  personal: {
    pilot: RankingItem; next: { nickname: string; earned: number; pos: number } | null;
    gap: number; progress: number; pageOffset: number;
  } | null;
}
