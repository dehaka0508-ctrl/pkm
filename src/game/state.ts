import { pendingCompetition, registeredEntry, type Competition, type SeasonRegistration } from "./registration";
// Game state, new-game setup, save/load.
import type { LeagueLineupRun } from "./rotation";
import type { Gimmick, OwnedMon, StatTable, TeamMember } from "./types";
import type { Friendly } from "./friendly";
import { makeSchedule, type League } from "./league";
import type { PrevSeason, PwtState, Qual } from "./pwt";
import type { Cup } from "./cup";
import type { Tie } from "./tie";
import { allTrainers, FOOD_NATIVE, resolveTeam, trainerById, teamRating } from "./lineups";
import { REGIONS, dex, speciesRegion } from "../data/dex";
import { Rng } from "./rng";
import { expForLevel } from "./training";
import { defaultMoves } from "./moves";
import { seasonStart } from "./calendar";
import { bestPrice, capacityOf, RENTED_SEATS, roleRented, roleSeats, tierSeats } from "./finance";
import { SAT_START } from "./fans";
import { fixCupFormat, isSwissCup, makeCup } from "./cup";
import { isRemovedItem, refundRemovedItems } from "./shop";
import { sponsorMigrate, sponsorSeasonStart } from "./sponsor";
import { initNpcs, npcOf, npcTeam, startingItems, syncLineupSlots, trainerFame } from "./npc";

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
  expires: number; // absolute week (day / 7)
}

export interface InboxMsg {
  id: string;
  t: number; // absolute day
  title: string;
  body: string;
  kind: "info" | "match" | "scout" | "train" | "money" | "pwt" | "news";
  read?: boolean;
  /** messages with the same group key are merged into one while unread (pushMsgMerged) */
  group?: string;
}

export interface Facilities {
  training: number; // 1..10
  scouting: number; // 1..10
  /** merch shop 1..10: more merchandise income per level */
  merch?: number;
  /** starting tier, kept for old saves (finance.tierSeats); the ground is `seats` */
  stadium: number;
  /** own seats (0 = no own ground, playing at the rented one) */
  seats?: number;
  /** size of the rented ground (1,000 unless the club started with a bigger one) */
  rented?: number;
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
  cup?: string;
  pct?: string;
}

export interface PlayerState {
  registrations?: Partial<Record<Competition, SeasonRegistration>>;
  name: string;
  slotId: string; // league slot (trainer id) the player occupies
  replaced: string; // original trainer of the slot
  region: string;
  sprite: string;
  money: number;
  fans: number;
  reputation: number;
  ticketPrice: number;
  /** the price fans compare a new price with (resets weekly; fans.ts) */
  priceRef?: number;
  /** fans' mood 0–100 (fans.ts): recent results and club decisions, moves fast */
  satisfaction?: number;
  satLog?: import("./fans").MoodEntry[];
  fameLog?: import("./fans").MoodEntry[];
  /** current run over all games (+ wins / − losses) and over league games */
  streak?: number;
  leagueStreak?: number;
  /** stadium rules v2 / v3 applied (role starting grounds) */
  stadiumV2?: boolean;
  stadiumV3?: boolean;
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
  /** items: Showdown item name or "mint:X", "tera:X", "tm:move", "capsule", "patch", "cap:silver", "cap:gold" */
  bag: Record<string, number>;
  /** sponsor contract and this August's offers (sponsor.ts) */
  sponsor?: import("./sponsor").SponsorState;
  /** unused legendary / mythical scout tickets (legend.ts) */
  tickets?: import("./legend").LegendTicket[];
}

/** A match the player has to play today. */
export interface PendingMatch {
  label: string;
  opponent: string;
  home: boolean;
  /** "fx": single league / group game; "tie": a game of a knockout tie */
  comp: "fx" | "tie";
  tie?: TieRef;
  games: { w: 0 | 1 | -1; my: number; opp: number }[];
  /** regional cup: doubles under Pokémon Champions rules */
  doubles?: boolean;
  /** cup: entry indices the player registered for this game (4–6) */
  reg?: number[];
  /** a preseason friendly (friendly.ts): no registration, no table, gate split 70/30 */
  friendly?: boolean;
}

export type TieRef =
  | { kind: "po"; idx: number; leg: number }
  | { kind: "ko"; round: number; idx: number; leg: number }
  | { kind: "pwtFinal"; leg: number }
  | { kind: "cup"; region: string; key: string; leg: number }
  | { kind: "pctKo"; round: number; idx: number; leg: number }
  | { kind: "pctFinal"; leg: number }
  | { kind: "super"; region: string; leg: number }
  | { kind: "world"; leg: number };

/** Super cups played in late August for the coming season. */
export interface Supers {
  season: number; // the season they open
  regional: Record<string, Tie>;
  world: Tie | null;
}

export interface GameState {
  /** Last selected league trio per club; absent in old saves. */
  leagueLineups?: Record<string, LeagueLineupRun>;
  registrationDue?: Competition;
  /** preseason friendlies of this season (friendly.ts) */
  friendlies?: Friendly[];
  version: 2;
  /** calendar layout: 2 = season starts Aug 1 (older saves started on Sep 1) */
  cal?: number;
  seed: number;
  season: number;
  /** absolute day, 0 = season 1 Aug 1 (Friday); August is the preseason */
  day: number;
  mode: "trainer" | "scout" | "custom";
  player: PlayerState;
  leagues: Record<string, League>;
  /** last season's final tables (seeding, PWT qualification) */
  prev: PrevSeason;
  /** PWT qualification (direct spots + 4th-place playoff) for the current or next season */
  qual: Qual | null;
  pwt: PwtState | null;
  /** Pokémon Challenge Tournament (Europa-style second tournament) */
  pct: PwtState | null;
  cups: Record<string, Cup> | null;
  supers: Supers | null;
  /** calendar events already processed today */
  dayStep: number;
  pending: PendingMatch | null;
  inbox: InboxMsg[];
  lastWeekSummary: string[];
  settings: { battleSpeed: number; moveAnims: boolean };
  /** NPC clubs: money, fans, fame, stadium, sponsor, bought items, recruits (npc.ts) */
  npcs?: Record<string, import("./npc").NpcState>;
}

export const absWeek = (s: { day: number }) => Math.floor(s.day / 7);

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
  if (id === state.player.slotId) return state.mode === "trainer" ? trainerById(id)?.role ?? "" : "신인";
  return trainerById(id)?.role ?? "";
}

/** Team used in a match for a league slot. */
export function teamOf(state: GameState, id: string): TeamMember[] {
  if (id === state.player.slotId) return entryTeam(state);
  return trainerById(id) ? npcTeam(state, id) : [];
}

export function entryTeam(state: GameState): OwnedMon[] {
  const p = state.player;
  const comp = pendingCompetition(state.pending);
  if (comp) return registeredEntry(state, comp);
  const list = p.entry.map(u => p.squad.find(m => m.uid === u)).filter((m): m is OwnedMon => !!m);
  if (list.length >= Math.min(3, p.squad.length)) return list.slice(0, 6);
  return p.squad.slice(0, 6);
}

export function makeLeagues(season: number, seed: number): Record<string, League> {
  const leagues: Record<string, League> = {};
  for (const r of REGIONS) {
    const teams = allTrainers().filter(t => t.region === r.id).map(t => t.id);
    const rounds = makeSchedule(teams, `${seed}:${season}:${r.id}`);
    leagues[r.id] = { region: r.id, teams, rounds, lot: `${seed}:${season}:${r.id}`, table: {}, nextRound: 0 };
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
    known: m.moves.slice(),
  };
}

export const START_MONEY = { trainer: 60000, scout: 90000, custom: 60000 };

/** A Pokémon built on the custom start screen. */
export interface CustomMon {
  species: string;
  level: number;
  ivs: StatTable;
  nature: string;
  ability: string;
  moves: string[];
}

export interface NewGameOptions {
  mode: "trainer" | "scout" | "custom";
  slotId: string; // trainer slot to take
  name: string;
  sprite?: string;
  scoutPicks?: ScoutCandidate[];
  customTeam?: CustomMon[];
}

export function customToOwned(c: CustomMon, season: number): OwnedMon {
  const s = dex.species.get(c.species);
  const gender: "M" | "F" | "" = s.gender === "N" ? "" : s.gender === "M" ? "M" : s.gender === "F" ? "F" : Math.random() < (s.genderRatio?.F ?? 0.5) ? "F" : "M";
  return {
    uid: newUid("p"),
    species: s.name,
    level: c.level,
    ability: c.ability,
    item: "",
    nature: c.nature,
    moves: c.moves.slice(0, 4),
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { ...c.ivs },
    gender,
    shiny: false,
    teraType: null,
    exp: expForLevel(c.level),
    origin: speciesRegion(s.id),
    joinedSeason: season,
    record: { played: 0, wins: 0, kos: 0 },
    known: c.moves.slice(0, 4),
  };
}

export function createGame(opts: NewGameOptions): GameState {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const t = trainerById(opts.slotId)!;
  const region = t.region;
  const season = 1;
  let squad: OwnedMon[] = [];
  if (opts.mode === "trainer") {
    // same start as an NPC in that seat: held items only on the strongest few (by role), no Tera Type yet
    const items = startingItems(t);
    squad = resolveTeam(t).map((m, i) => ownedFromMember({ ...m, item: items[String(i)] || "", teraType: null }, speciesRegion(m.species), season, true));
  } else if (opts.mode === "custom") {
    squad = (opts.customTeam || []).map(c => customToOwned(c, season));
  } else {
    squad = (opts.scoutPicks || []).map(c => candidateToOwned(c, season));
  }
  const rep = opts.mode === "trainer" ? trainerFame(t) : 10;
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
    facilities: { training: 1, scouting: 1, merch: 1, stadium: 1, seats: opts.mode === "trainer" ? roleSeats(t.role) : 0, rented: opts.mode === "trainer" ? roleRented(t.role) : RENTED_SEATS },
    satisfaction: SAT_START,
    stadiumV2: true,
    stadiumV3: true,
    squad,
    entry: squad.slice(0, 6).map(m => m.uid),
    plan: Object.fromEntries(squad.map(m => [m.uid, m.level < 50 ? "level" : "spe"])),
    missions: [],
    candidates: [],
    gimmick: t.gimmick ?? null,
    history: [],
    titles: [],
    debtWeeks: 0,
    bag: {},
    sponsor: { contract: null, offers: [], offersUntil: -1 },
    tickets: [],
  };
  const state: GameState = {
    version: 2,
    cal: 2,
    seed,
    season,
    day: 0,
    mode: opts.mode,
    player,
    leagues: makeLeagues(season, seed),
    prev: { season: 0, virtual: true, tables: {} },
    qual: null,
    pwt: null,
    pct: null,
    cups: null,
    supers: null,
    dayStep: 0,
    pending: null,
    inbox: [],
    lastWeekSummary: [],
    settings: { battleSpeed: 1, moveAnims: true },
  };
  initNpcs(state);
  // open at the ticket price that brings in the most for this club
  state.player.ticketPrice = state.player.priceRef = bestPrice(state.player.fans, state.player.reputation, SAT_START, capacityOf(state.player.facilities.seats ?? 0, state.player.facilities.rented));
  (state as any).fameSet = 1;
  state.prev = virtualPrev(state);
  sponsorSeasonStart(state);
  pushMsg(state, "info", "시즌 1 프리시즌 시작", "8월은 프리시즌입니다. 첫 월요일에 스폰서 제의가 도착하고, 셋째 주 수요일 PWT 플레이오프, 9월 첫 일요일 리그가 개막합니다.");
  return state;
}

/** Season 1 has no previous season: rank each region by team strength instead. */
export function virtualPrev(state: GameState): PrevSeason {
  const tables: PrevSeason["tables"] = {};
  for (const r of REGIONS) {
    const rows = state.leagues[r.id].teams
      .map(id => ({ id, rating: teamRating(teamOf(state, id)) }))
      .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
    tables[r.id] = rows.map((x, i) => ({ id: x.id, rank: i + 1, pts: x.rating, diff: 0, gf: 0 }));
  }
  return { season: 0, virtual: true, tables };
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
    return s && s.version === 2 ? migrate(s) : null;
  } catch {
    return null;
  }
}

/**
 * Trainers removed from the data since the save was made (e.g. 클라벨 → 카지) are swapped for the
 * region's new trainers everywhere in the save, so no league or tournament refers to a missing id.
 */
export function remapTrainers(s: GameState): GameState {
  const valid = new Set(allTrainers().map(t => t.id));
  const pairs: [string, string][] = [];
  for (const r of REGIONS) {
    const teams: string[] = s.leagues?.[r.id]?.teams || [];
    const missing = teams.filter(id => !valid.has(id));
    if (!missing.length) continue;
    const fresh = allTrainers()
      .filter(t => t.region === r.id && !teams.includes(t.id))
      .map(t => t.id);
    missing.forEach((id, i) => fresh[i] && pairs.push([id, fresh[i]]));
  }
  if (!pairs.length) return s;
  let json = JSON.stringify(s);
  for (const [a, b] of pairs) json = json.split(JSON.stringify(a)).join(JSON.stringify(b));
  console.info("save: replaced removed trainers", pairs);
  return JSON.parse(json);
}

/**
 * Saves made when seasons started on Sep 1: the same calendar date is now 31 days later
 * (August moved to the front of the season). Old end-of-season August days wait on Jul 31.
 */
function shiftCalendar(s: GameState) {
  const end = seasonStart(s.season + 1) - 1;
  const day = s.day + 31;
  if (day > end) {
    s.day = end;
    s.dayStep = 0;
  } else s.day = day;
  for (const m of s.inbox) m.t = Math.min(m.t + 31, s.day);
  for (const c of s.player.candidates) c.expires += 4;
  s.cal = 2;
}

/** Fills fields added after a save was made. */
export function migrate(s0: GameState): GameState {
  const s = remapTrainers(s0);
  s.player.registrations ??= {};
  s.player.bag ||= {};
  s.player.facilities.seats ??= tierSeats(s.player.facilities.stadium);
  s.player.facilities.merch ??= 1;
  s.player.satisfaction ??= SAT_START;
  if (!s.player.stadiumV2) {
    // stadium rules v2: grounds never built on go to the new starting grounds (champion 2,000 … others rent)
    s.player.stadiumV2 = true;
    const f = s.player.facilities;
    if (f.seats === tierSeats(f.stadium)) f.seats = s.mode === "trainer" ? roleSeats(trainerById(s.player.replaced)?.role) : 0;
    for (const [id, n] of Object.entries(s.npcs || {})) {
      if (n.seats == null || n.seats === tierSeats(n.stadium)) n.seats = roleSeats(trainerById(id)?.role);
    }
  }
  if (!s.player.stadiumV3) {
    // stadium rules v3: champion 1,500 own, Elite Four rent 1,500, gym leader 1,000 own, the rest rent 1,000.
    // Grounds still at a starting size (v2 or v3) move to v3; grounds the club built on stay.
    s.player.stadiumV3 = true;
    const V2: Record<string, number> = { 챔피언: 2000, 사천왕: 1500, 관장: 1000, 보스: 1000 };
    const reset = (seats: number | undefined, role: string | undefined) => seats == null || seats === (role ? V2[role] ?? 0 : 0) || seats === roleSeats(role);
    const role = s.mode === "trainer" ? trainerById(s.player.replaced)?.role : undefined;
    const f = s.player.facilities;
    if (reset(f.seats, role)) {
      f.seats = roleSeats(role);
      f.rented = roleRented(role);
    }
    for (const [id, n] of Object.entries(s.npcs || {})) {
      const r = trainerById(id)?.role;
      if (reset(n.seats, r)) {
        n.seats = roleSeats(r);
        n.rented = roleRented(r);
      }
    }
  }
  for (const m of s.player.squad) m.known ||= m.moves.slice();
  (s as any).pct ??= null;
  (s as any).supers ??= null;
  s.player.tickets ||= [];
  if (!s.cal) shiftCalendar(s);
  if (!(s as any).npcs) initNpcs(s);
  // regional cup: every tie is a single doubles game now. Open two-legged / best-of-3 ties are settled by the
  // game already played; a cup saved in the short-lived Swiss format is drawn again as a wing bracket
  // (rounds whose day has passed are played automatically on the next cup day).
  if (s.cups) {
    for (const [rid, c] of Object.entries(s.cups)) {
      if (isSwissCup(c)) {
        const old = c as any;
        s.cups[rid] = makeCup(rid, old.season, s.leagues[rid].teams, s.prev.tables[rid], old.season === 1, new Rng(`${s.seed}:cup:${rid}:${old.season}`));
        if (old.champion) s.cups[rid].champion = old.champion;
      } else fixCupFormat(c);
    }
  }
  // items taken out of the game: the player gets their price back, NPCs buy something else
  const refund = refundRemovedItems(s);
  if (refund) pushMsg(s, "money", "판매 중지 도구 환불", `더 이상 쓸 수 없게 된 도구(클리어참·은밀망토·풍선 등)를 회수하고 ₽${refund.toLocaleString()}을 돌려받았습니다.`);
  for (const n of Object.values(s.npcs || {})) for (const k of Object.keys(n.items)) if (isRemovedItem(n.items[k])) n.items[k] = "";
  // lineup data edited since the save: changed slots start over (the Unova lineups edited before slot tracking)
  syncLineupSlots(s, new Set(["unova-체렌", "unova-주박사", "unova-명희", "unova-알로에", "unova-아티", "unova-카밀레", "unova-야콘", "unova-풍란", "unova-담죽", "unova-사간", "unova-보미카", "unova-시즈"]), new Set(["unova-보미카", "unova-게치스"]));
  // trainers whose data now sets a higher fame (e.g. 레드) get it once
  if (!(s as any).fameSet) {
    for (const t of allTrainers()) {
      if (t.fame == null) continue;
      if (t.id === s.player.slotId) {
        if (s.mode === "trainer" && s.player.replaced === t.id) s.player.reputation = Math.max(s.player.reputation, t.fame);
      } else {
        const n = npcOf(s, t.id);
        n.reputation = Math.max(n.reputation, t.fame);
      }
    }
    (s as any).fameSet = 1;
  }
  if (!s.player.sponsor) {
    s.player.sponsor = { contract: null, offers: [], offersUntil: -1 };
    sponsorMigrate(s);
  }
  // playing as 올림박사 / 투로박사: their own six eat like ordinary Pokémon (no Paradox surcharge)
  if (s.mode === "trainer" && FOOD_NATIVE.has(s.player.slotId)) for (const m of s.player.squad) if (m.fromTrainer) m.foodNative = true;
  return s;
}

export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}

export function pushMsg(state: GameState, kind: InboxMsg["kind"], title: string, body = "") {
  state.inbox.unshift({ id: newUid("m"), t: state.day, title, body, kind });
  if (state.inbox.length > 200) state.inbox.length = 200;
}

/**
 * Adds to an unread message of the same group instead of piling up a new one (routine match reports,
 * same-day news). `title` is the merged message's title; `line` is appended to its body.
 */
export function pushMsgMerged(state: GameState, kind: InboxMsg["kind"], group: string, title: (count: number) => string, line: string) {
  const m = state.inbox.find(x => x.group === group && !x.read);
  if (m) {
    const count = ((m as any).count || 1) + 1;
    (m as any).count = count;
    m.title = title(count);
    m.body = `${m.body}\n\n${line}`;
    m.t = state.day;
    // keep it near the top
    state.inbox.splice(state.inbox.indexOf(m), 1);
    state.inbox.unshift(m);
    return;
  }
  state.inbox.unshift({ id: newUid("m"), t: state.day, title: title(1), body: line, kind, group });
  if (state.inbox.length > 200) state.inbox.length = 200;
}

export function rngFor(state: GameState, tag: string): Rng {
  return new Rng(`${state.seed}:${state.day}:${tag}`);
}
