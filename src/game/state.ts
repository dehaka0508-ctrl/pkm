// Game state, new-game setup, save/load.
import type { Gimmick, OwnedMon, StatTable, TeamMember } from "./types";
import { makeSchedule, type League } from "./league";
import { roundWeeks } from "./calendar";
import { allTrainers, resolveTeam, trainerById, teamRating } from "./lineups";
import { REGIONS, dex, speciesRegion } from "../data/dex";
import { Rng } from "./rng";
import { expForLevel } from "./training";
import { defaultMoves } from "./moves";

export interface ScoutMission {
  id: string;
  region: string;
  type: string | null;
  weeksLeft: number;
}

export interface ScoutCandidate {
  id: string;
  species: string;
  level: number;
  ivs: StatTable;
  nature: string;
  ability: string;
  gender: "M" | "F" | "";
  shiny: boolean;
  stars: number; // estimated quality 1..5 (0.5 steps)
  fee: number;
  region: string;
  expires: number; // absolute week
}

export interface InboxMsg {
  id: string;
  t: number; // absolute week
  title: string;
  body: string;
  kind: "info" | "match" | "scout" | "train" | "money" | "pwt";
  read?: boolean;
}

export interface Facilities {
  training: number; // 1..10
  scouting: number; // 1..10
  stadium: number; // 1..8 (capacity tier)
}

export interface SeasonRecord {
  season: number;
  region: string;
  rank: number;
  pts: number;
  w: number;
  d: number;
  l: number;
  pwt: string;
}

export interface PlayerState {
  name: string;
  slotId: string; // league slot (trainer id) the player occupies
  replaced: string; // original trainer of the slot
  region: string;
  sprite: string;
  money: number;
  fans: number;
  reputation: number;
  ticketPrice: number;
  facilities: Facilities;
  squad: OwnedMon[];
  entry: string[]; // uids, up to 6
  plan: Record<string, string>; // uid -> "level" | stat id | "rest"
  missions: ScoutMission[];
  candidates: ScoutCandidate[];
  gimmick: Gimmick;
  history: SeasonRecord[];
  titles: string[];
  debtWeeks: number;
}

export interface PwtMatch {
  a: string;
  b: string;
  bestOf: 1 | 3;
  games: { w: 0 | 1 | -1; ra: number; rb: number }[];
  winner?: string;
}

export interface PwtState {
  season: number;
  entrants: string[];
  seeds: Record<string, string>; // id -> "관동 1위"
  records: Record<string, { w: number; l: number }>;
  swiss: PwtMatch[][];
  advanced: string[];
  eliminated: string[];
  ko: PwtMatch[][]; // R16, QF, SF, F
  champion?: string;
}

export interface PendingMatch {
  kind: "league" | "pwt";
  label: string;
  opponent: string;
  home: boolean;
  bestOf: 1 | 3;
  games: { w: 0 | 1 | -1; my: number; opp: number }[];
  /** league: region + round; pwt: stage + index */
  ref: { region?: string; round?: number; stage?: "swiss" | "ko"; round2?: number; index?: number };
}

export interface GameState {
  version: 1;
  seed: number;
  season: number;
  week: number;
  mode: "trainer" | "scout";
  player: PlayerState;
  leagues: Record<string, League>;
  coefficients: Record<string, number>;
  pwt: PwtState | null;
  /** matchdays already resolved this week */
  doneMatchdays: number;
  pending: PendingMatch | null;
  inbox: InboxMsg[];
  lastWeekSummary: string[];
  settings: { battleSpeed: number; moveAnims: boolean };
}

export const absWeek = (s: { season: number; week: number }) => s.season * 52 + s.week;

let uidCounter = 0;
export function newUid(prefix = "u"): string {
  uidCounter = (uidCounter + 1) % 100000;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function displayName(state: GameState, id: string): string {
  if (id === state.player.slotId) return state.player.name;
  return trainerById(id)?.name ?? id;
}

export function displaySprite(state: GameState, id: string): string {
  if (id === state.player.slotId) return state.player.sprite;
  return trainerById(id)?.sprite ?? "unknown_m";
}

export function displayRole(state: GameState, id: string): string {
  if (id === state.player.slotId) return state.mode === "scout" ? "신인" : trainerById(id)?.role ?? "";
  return trainerById(id)?.role ?? "";
}

/** Team used in a match for a league slot. */
export function teamOf(state: GameState, id: string): TeamMember[] {
  if (id === state.player.slotId) return entryTeam(state);
  const t = trainerById(id);
  return t ? resolveTeam(t) : [];
}

export function entryTeam(state: GameState): OwnedMon[] {
  const p = state.player;
  const list = p.entry.map(u => p.squad.find(m => m.uid === u)).filter((m): m is OwnedMon => !!m);
  if (list.length >= Math.min(3, p.squad.length)) return list.slice(0, 6);
  return p.squad.slice(0, 6);
}

export function regionCoefficients(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of REGIONS) {
    const ts = allTrainers().filter(t => t.region === r.id);
    const avg = ts.reduce((a, t) => a + teamRating(resolveTeam(t)), 0) / Math.max(1, ts.length);
    out[r.id] = Math.round(avg) / 10;
  }
  return out;
}

export function makeLeagues(season: number, seed: number): Record<string, League> {
  const leagues: Record<string, League> = {};
  for (const r of REGIONS) {
    const teams = allTrainers().filter(t => t.region === r.id).map(t => t.id);
    const rounds = makeSchedule(teams, `${seed}:${season}:${r.id}`);
    leagues[r.id] = { region: r.id, teams, rounds, roundWeeks: roundWeeks(rounds.length), table: {}, nextRound: 0 };
  }
  return leagues;
}

export function ownedFromMember(m: TeamMember, origin: string, season: number, fromTrainer: boolean): OwnedMon {
  return {
    ...JSON.parse(JSON.stringify(m)),
    uid: newUid("p"),
    exp: expForLevel(m.level),
    origin,
    joinedSeason: season,
    record: { played: 0, wins: 0, kos: 0 },
    fromTrainer,
  };
}

export const START_MONEY = { trainer: 60000, scout: 90000 };
const ROLE_REP: Record<string, number> = { 챔피언: 80, 사천왕: 65, 보스: 60, 관장: 50, 라이벌: 45, 주인공: 45, 박사: 40, 기타: 35, 트레이너: 25 };

export interface NewGameOptions {
  mode: "trainer" | "scout";
  slotId: string; // trainer slot to take
  name: string;
  sprite?: string;
  scoutPicks?: ScoutCandidate[];
}

export function createGame(opts: NewGameOptions): GameState {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const t = trainerById(opts.slotId)!;
  const region = t.region;
  const season = 1;
  let squad: OwnedMon[] = [];
  if (opts.mode === "trainer") {
    squad = resolveTeam(t).map(m => ownedFromMember(m, speciesRegion(m.species), season, true));
  } else {
    squad = (opts.scoutPicks || []).map(c => candidateToOwned(c, season));
  }
  const rep = opts.mode === "trainer" ? ROLE_REP[t.role] ?? 40 : 10;
  const player: PlayerState = {
    name: opts.name || t.name,
    slotId: t.id,
    replaced: t.id,
    region,
    sprite: opts.sprite || t.sprite,
    money: START_MONEY[opts.mode],
    fans: opts.mode === "trainer" ? 300 + rep * 40 : 150,
    reputation: rep,
    ticketPrice: 20,
    facilities: { training: 1, scouting: 1, stadium: 1 },
    squad,
    entry: squad.slice(0, 6).map(m => m.uid),
    plan: Object.fromEntries(squad.map(m => [m.uid, m.level < 50 ? "level" : "spe"])),
    missions: [],
    candidates: [],
    gimmick: t.gimmick ?? null,
    history: [],
    titles: [],
    debtWeeks: 0,
  };
  const state: GameState = {
    version: 1,
    seed,
    season,
    week: 1,
    mode: opts.mode,
    player,
    leagues: makeLeagues(season, seed),
    coefficients: regionCoefficients(),
    pwt: null,
    doneMatchdays: 0,
    pending: null,
    inbox: [],
    lastWeekSummary: [],
    settings: { battleSpeed: 1, moveAnims: true },
  };
  return state;
}

export function candidateToOwned(c: ScoutCandidate, season: number): OwnedMon {
  const s = dex.species.get(c.species);
  return {
    uid: newUid("p"),
    species: s.name,
    level: c.level,
    ability: c.ability,
    item: "",
    nature: c.nature,
    moves: defaultMoves(s.id, c.level),
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: c.ivs,
    gender: c.gender,
    shiny: c.shiny,
    teraType: null,
    exp: expForLevel(c.level),
    origin: c.region,
    joinedSeason: season,
    record: { played: 0, wins: 0, kos: 0 },
  };
}

// ---- persistence ----
const SAVE_KEY = "pl:save";

export function saveGame(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("save failed", e);
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}

export function pushMsg(state: GameState, kind: InboxMsg["kind"], title: string, body = "") {
  state.inbox.unshift({ id: newUid("m"), t: absWeek(state), title, body, kind });
  if (state.inbox.length > 200) state.inbox.length = 200;
}

export function rngFor(state: GameState, tag: string): Rng {
  return new Rng(`${state.seed}:${state.season}:${state.week}:${tag}`);
}
