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
  /** base stats of its own instead of the species' (레드's partner Pikachu); everything else is the species' */
  baseStats?: StatTable;
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
  /** scouted in 레전드 as Rowlet / Cyndaquil / Oshawott: evolves into the Hisui form */
  hisuian?: boolean;
  /** never evolves (e.g. 글라디오's Type: Null) */
  noEvolve?: boolean;
  /** does not take the one legendary / mythical registration slot */
  notLegend?: boolean;
  placeholder?: boolean;
  autoMoves?: boolean;
  /** not yet treated after the last battle (missing = full health) */
  cond?: MonCondition;
  /** PP Ups used per move id (0–3; PP Max = 3). Missing = 0: every move starts at its base PP. */
  ppUps?: Record<string, number>;
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
  /** the competition whose trophy brought it ("관동 리그", "PWT"): winning it again can renew the stay */
  loanComp?: string;
  /** individual league awards it won ("시즌 1 관동 리그 최다 KO상 (23 KO)") */
  awards?: string[];
  /** the evolution(s) the manager was last told it can take now (told once) */
  evoNoted?: string;
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
  /** base stats replacing the species' in battle (the Pokémon still looks and is named like its species) */
  baseStats?: StatTable;
  noEvolve?: boolean;
  notLegend?: boolean;
}

export interface TrainerDef {
  id: string;
  name: string;
  role: string;
  /** shown instead of the role (e.g. Alola's 캡틴, treated as 관장) */
  title?: string;
  /** 레전드 리그: which Pokémon are homegrown for this trainer (Legends Z-A side: 6th gen; Legends: Arceus side: Hisui dex) */
  homegrownDex?: "gen6" | "hisui";
  /** no gimmick at the start unless the data gives one: the AI buys it during the season */
  noStartGimmick?: boolean;
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
