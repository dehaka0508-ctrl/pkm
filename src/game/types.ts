/** Every battle uses Lv.50 stats (real competitive rule), whatever the trained level. */
export const BATTLE_LEVEL = 50;

export type StatId = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type StatTable = Record<StatId, number>;
export const STATS: StatId[] = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_KO: Record<StatId, string> = { hp: "HP", atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드" };

export const zeroStats = (): StatTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
export const maxIvs = (): StatTable => ({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

export type Gimmick = "mega" | "z" | "tera" | null;

/** A battle-ready Pokémon. */
export interface MonSet {
  species: string;
  level: number;
  ability: string;
  item: string;
  nature: string;
  moves: string[];
  evs: StatTable;
  ivs: StatTable;
  gender: "M" | "F" | "";
  teraType?: string | null;
  shiny?: boolean;
  nickname?: string;
}

/** Damage carried out of a battle when the club could not pay for treatment. */
export interface MonCondition {
  /** HP left, 0..1 (0 = fainted) */
  hp: number;
  /** PP used per move id */
  pp: Record<string, number>;
}

export interface TeamMember extends MonSet {
  uid: string;
  /** one of 올림박사's / 투로박사's own six: no Ultra Beast / Paradox food surcharge */
  foodNative?: boolean;
  placeholder?: boolean;
  autoMoves?: boolean;
  /** not yet treated after the last battle (missing = full health) */
  cond?: MonCondition;
}

/** Player-owned Pokémon (grows with training). */
export interface OwnedMon extends TeamMember {
  exp: number;
  origin: string;
  joinedSeason: number;
  record: { played: number; wins: number; kos: number };
  fromTrainer?: boolean;
  /** moves it has learned before (can be set again any time) */
  known?: string[];
  fatigue?: number;
  /** trophy-ticket legendaries: last season they stay */
  loanUntil?: number;
}

export interface TrainerMonDef {
  species: string;
  gender?: "M" | "F" | null;
  item: string | null;
  ability: string | null;
  nature: string | null;
  moves: (string | null)[];
  teraType: string | null;
  /** effort values when the source gives them (missing stats = 0) */
  evs?: Partial<StatTable>;
}

export interface TrainerDef {
  id: string;
  name: string;
  role: string;
  sprite: string;
  source: string;
  gimmick: Gimmick;
  team: (TrainerMonDef | null)[];
  /** overrides of the role's grade (e.g. 레드: a protagonist with a champion's IVs and fame) */
  iv?: number;
  fame?: number;
}

export interface RegionDef {
  id: string;
  name: string;
  trainers: TrainerDef[];
}

export interface TrainerData {
  version: number;
  regions: RegionDef[];
}
