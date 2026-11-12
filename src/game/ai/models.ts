// NPC trainer AI: the data it works with.
//  - TrainerProfile: how the trainer spends money
//  - RosterMon / ScoutTask: the NPC's own squad beyond the six in the lineup data, and scouts it sends out
//  - Role / DoublesRole: what a Pokémon does in a team
import type { StatTable, TeamMember } from "../types";

export type SpendingStyle = "aggressive" | "balanced" | "frugal";

export interface TrainerProfile {
  id: string;
  style: SpendingStyle;
}

/** Singles roles. */
export type Role = "physSweeper" | "specSweeper" | "physWall" | "specWall" | "lead" | "pivot";
/** Doubles roles (a Pokémon can have several). */
export type DoublesRole = "speedControl" | "support" | "spreadAttacker" | "weather";

export const ROLE_KO: Record<Role, string> = {
  physSweeper: "물리 어태커",
  specSweeper: "특수 어태커",
  physWall: "물리 막이",
  specWall: "특수 막이",
  lead: "선발 기점",
  pivot: "대면 조작",
};
export const DOUBLES_ROLE_KO: Record<DoublesRole, string> = {
  speedControl: "스피드 조절",
  support: "서포터",
  spreadAttacker: "전체 공격",
  weather: "날씨·필드",
};

/** A Pokémon an NPC brought in by scouting (fully trained off-screen; battles use Lv.50 stats anyway). */
export interface RosterMon {
  key: string; // "S…": stable key for items / EVs / Tera
  mon: TeamMember;
  stars: number;
  joined: number; // day
  /** why it was scouted: a wildcard that covers a weakness, or a plain upgrade ("theme" in older saves) */
  why: "theme" | "wildcard" | "upgrade";
  /** weeks in a row outside the six (a long-benched recruit is let go: it still costs food) */
  benchWeeks?: number;
}

/** A scout an NPC has sent out: the report comes back after `weeksLeft` weeks. */
export interface ScoutTask {
  id: string;
  region: string;
  /** type the scout looks for (one that covers a weakness), or null */
  type: string | null;
  purpose: RosterMon["why"];
  weeksLeft: number;
}

/** What an NPC has done to a member beyond the lineup data, keyed like items ("0".."5", "L0".., "S…"). */
export interface MemberCare {
  evs?: StatTable;
  nature?: string;
  moves?: string[];
  tera?: string;
}

/** Most Pokémon an NPC keeps (like the player's squad). */
export const NPC_ROSTER_MAX = 10;

// ---------- team building ----------

/** The three match formats: "singles" picks 3 of 6, "league" fields up to six, "doubles" picks 4 of 6. */
export type Format = import("../match-rules").MatchRules;

/** What a team is built around (worked out from its members). */
export type Archetype = "offense" | "cycle" | "setup" | "weather" | "trickroom" | "stall";
export const ARCHETYPE_KO: Record<Archetype, string> = {
  offense: "대면 공격",
  cycle: "사이클",
  setup: "기점 스윕",
  weather: "날씨·필드",
  trickroom: "트릭룸",
  stall: "막이 사이클",
};

/** Something a team still lacks (what a scout, an item or a move could fix). */
export type Need =
  | "physical" | "special" | "speedControl" | "antiSetup"
  | "hazard" | "hazardRemoval" | "wallbreaker" | "wallCore"
  | "protect" | "fakeOut" | "doublesSpeed" | "spread"
  | `cushion:${string}`;
export const NEED_KO: Record<string, string> = {
  physical: "물리 어태커", special: "특수 어태커", speedControl: "스피드 조절", antiSetup: "기점 차단",
  hazard: "장판 설치", hazardRemoval: "장판 제거", wallbreaker: "막이 돌파", wallCore: "물리·특수 막이",
  protect: "방어", fakeOut: "속이다·위협", doublesSpeed: "순풍·트릭룸", spread: "광역기",
};

/** How well a team hangs together for a format: a multiplier around 1, why, and what is missing. */
export interface Synergy {
  score: number;
  archetype: Archetype;
  missing: Need[];
  /** each part's share of the score (for tests and the trainer window) */
  parts: Record<string, number>;
}

/** A match-day set for one member: what the night-before preparation changed for that match only. */
export interface MatchSet {
  moves?: string[];
  item?: string;
}
