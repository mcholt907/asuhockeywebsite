// Shared types for the /api/* surface served by server.js.
//
// Kept intentionally permissive (most fields optional) for incremental
// adoption — every existing JS call site keeps working as we convert
// files one at a time. Tighten the unions as the consumer code is
// migrated and field-presence becomes provable.

export interface NewsArticle {
  title: string;
  link: string;
  date: string;
  source: string;
}

export interface NewsResponse {
  data: NewsArticle[];
  source?: string;
  timestamp?: string;
}

export interface Player {
  number: string;
  name: string;
  position: string;
  height: string;
  weight: string;
  shoots: string;
  born: string;
  birthplace: string;
  nationality: string;
  player_link: string;
}

export interface Game {
  date: string;          // 'YYYY-MM-DD'
  opponent?: string;
  location?: string;
  time?: string;
  result?: string;       // e.g. 'W 4-2', 'L 1-3', 'OTL 2-3'
  box_link?: string;
  metrics_link?: string;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  npi?: number | null;
}

export interface ScheduleResponse {
  data: Game[];
  source?: string;
  timestamp?: string;
  team_record?: TeamRecord;
}

export interface Recruit {
  name: string;
  position?: string;
  height?: string;
  weight?: string;
  birth_year?: string | number;
  birthplace?: string;
  current_team?: string;
  last_team?: string;
  player_link: string;
  player_photo?: string;
}

// /api/recruits returns an object keyed by season label ("2026-2027").
export type RecruitsResponse = Record<string, Recruit[]>;

export interface Transfer {
  playerName: string;
  playerUrl: string;
  position?: string;
  team?: string;
  transferDate?: string;
  direction: 'incoming' | 'outgoing';
}

export interface TransfersResponse {
  incoming: Transfer[];
  outgoing: Transfer[];
  lastUpdated?: string | null;
}

export interface AlumniSkater {
  name: string;
  team?: string;
  league?: string;
  // Season-summary fields (gp/g/a/pts) are present on the row level.
  gp?: number | string;
  g?: number | string;
  a?: number | string;
  pts?: number | string;
}

export interface AlumniGoalie {
  name: string;
  team?: string;
  league?: string;
  gp?: number | string;
  gaa?: number | string;
  svpct?: number | string;
}

export interface AlumniResponse {
  skaters: AlumniSkater[];
  goalies: AlumniGoalie[];
  lastUpdated?: string | null;
}

export interface StandingsTeam {
  rank: number | string;
  team: string;
  pts: number | string;
  confRecord: string;
  overallRecord: string;
  isASU?: boolean;
}

export interface StandingsResponse {
  data: StandingsTeam[];
  source?: string;
  timestamp?: string;
}

export interface PlayerStat {
  name: string;
  number?: string;
  position?: string;
  gp?: number | string;
  g?: number | string;
  a?: number | string;
  pts?: number | string;
  pim?: number | string;
}

export interface GoalieStat {
  name: string;
  number?: string;
  gp?: number | string;
  gaa?: number | string;
  svpct?: number | string;
  w?: number | string;
  l?: number | string;
}

export interface StatsResponse {
  skaters: PlayerStat[];
  goalies: GoalieStat[];
  source?: string;
  timestamp?: string;
}
