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

export interface TeamMember extends MonSet {
  uid: string;
  placeholder?: boolean;
  autoMoves?: boolean;
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
}

export interface TrainerMonDef {
  species: string;
  gender?: "M" | "F" | null;
  item: string | null;
  ability: string | null;
  nature: string | null;
  moves: (string | null)[];
  teraType: string | null;
}

export interface TrainerDef {
  id: string;
  name: string;
  role: string;
  sprite: string;
  source: string;
  gimmick: Gimmick;
  team: (TrainerMonDef | null)[];
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
