export type Role = 'player' | 'admin';
export type Status = 'pending' | 'active' | 'banned' | 'rejected';
export type LedgerSource = 'manual' | 'unlock' | 'refund' | 'server';

export interface Me {
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

export interface NewsItem { kind: 'points' | 'grant' | 'achievement' | 'goal' | 'mission'; amount: number; reason: string; createdAt: string; unread: boolean; icon?: string; rarity?: Rarity }
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
  baseMissionPoints: number;
  aircraft: TreeAircraft[];
}

export interface MissionSignup { missionId: string; userId: string; nickname: string; aircraftId: string; aircraftName: string; attended: boolean; pmAwarded: number }
export interface Mission {
  mapName: string; briefingImageUrl: string;
  id: string; title: string; briefing: string; startsAt: string; defaultPm: number | null;
  status: 'scheduled' | 'closed' | 'cancelled'; seriesId: string | null; closedAt: string | null;
  signups: MissionSignup[]; mine: MissionSignup | null;
}
export interface MissionInput { title: string; briefing: string; startsAt: string; defaultPm: number | null; repeatWeeks?: number; mapName?: string; briefingImageUrl?: string }

export interface AdminTree {
  tiers: Tier[];
  bands: Band[];
  baseMissionPoints: number;
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

export interface Profile {
  user: { nickname: string; email: string; avatarUrl: string | null; role: Role; createdAt: string; medals: MedalLite[] };
  rank: { position: number | null; total: number };
  totals: { balance: number; earned: number; spent: number; refunded: number; fleet: number; aircraftTotal: number };
  estimate: { baseMissionPoints: number; bestMultiplier: number; perMission: number };
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
    title?: string; copies?: number; pilots?: number; totalPm?: number;
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
