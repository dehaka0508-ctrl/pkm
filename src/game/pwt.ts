// Three continental tournaments, UEFA style (as in 2021–24):
//  PWT (Pokémon World Tournament, Champions League), PST (Pokémon Star Tournament, Europa League; internally "pct"),
//  PCT (Pokémon Challengers Tournament, Conference League; internally "ect").
// Group 3rds of the PWT play the PST group runners-up in a two-legged knockout playoff, PST 3rds the PCT runners-up;
// the playoff winners meet the group winners in the round of 16.
// Pokémon World Tournament, Champions-League style.
// Qualification: every league's top 3 + defending champion + last season's PCT winner (no playoff).
// 32 trainers → 4 pots → 8 groups of 4 (double round robin)
// → top 2 → two-legged knockout (R16 / QF / SF) → best-of-3 final.
import { REGIONS, regionById } from "../data/dex";
import { compareRows, rankRows, tableFrom, type Fixture, type TableRow } from "./league";
import { drawGroups, drawKnockout, GROUP_NAMES, type DrawData } from "./draw";
import { newTie, type Tie } from "./tie";
import { Rng, hashStr } from "./rng";
import { trainerById } from "./lineups";

export interface PrevRow {
  id: string;
  rank: number;
  pts: number;
  diff: number;
  gf: number;
}

/** Final standings of the season before (season 1 uses a strength estimate instead). */
export interface PrevSeason {
  season: number;
  virtual: boolean;
  tables: Record<string, PrevRow[]>;
  champion?: string; // PWT
  pctChampion?: string; // PST (2nd tier)
  ectChampion?: string; // PCT (3rd tier)
  cupWinners?: Record<string, string>;
}

export interface Qual {
  /** The playoff draw is announced after season-roster registration. */
  announced?: boolean;
  season: number; // the PWT season these spots are for
  direct: string[];
  seeds: Record<string, string>;
  po: { entrants: string[]; byes: string[]; ties: Tie[]; draw: DrawData };
}

export type Tier = "pwt" | "pct" | "ect";
export const TIER_NAME: Record<Tier, string> = { pwt: "PWT", pct: "PST", ect: "PCT" };
export const TIER_LONG: Record<Tier, string> = { pwt: "포켓몬 월드 토너먼트", pct: "포켓몬 스타 토너먼트", ect: "포켓몬 챌린저스 토너먼트" };

export interface PwtState {
  /** shown name: "PWT", "PST" or "PCT" (same format) */
  name?: string;
  tier?: Tier;
  /** PST / PCT: knockout playoff (group runners-up vs the tier above's group 3rds) */
  kpo?: Tie[];
  kpoDraw?: DrawData;
  season: number;
  entrants: string[];
  seeds: Record<string, string>;
  pots: string[][];
  groups: string[][];
  groupDraw: DrawData;
  fixtures: Fixture[][]; // 6 matchdays × 16
  koDraw?: DrawData;
  ko: Tie[][]; // R16, QF, SF
  final?: Tie;
  champion?: string;
}

export const regionOf = (id: string) => trainerById(id)?.region ?? "";
const lotKey = (season: number) => `pwt${season}`;

function prevRow(prev: PrevSeason, id: string): PrevRow | undefined {
  return prev.tables[regionOf(id)]?.find(r => r.id === id);
}

/**
 * PWT qualification (no playoff): every league's top 3 (30), the defending PWT champion and last season's PCT
 * winner. A cup winner already among a league's top 3 hands that spot to the league's next place
 * (e.g. 난천 wins the PWT and finished in 신오's top 3 → 신오's 4th goes). Short of 32 (season 1), the best
 * remaining league places fill in by points, goal difference, then lot.
 */
export function buildQual(prev: PrevSeason, season: number, rng: Rng): Qual {
  void rng;
  const seeds: Record<string, string> = {};
  const holders: string[] = [];
  if (prev.champion && trainerById(prev.champion)) {
    holders.push(prev.champion);
    seeds[prev.champion] = "디펜딩 챔피언";
  }
  if (prev.pctChampion && trainerById(prev.pctChampion) && !holders.includes(prev.pctChampion)) {
    holders.push(prev.pctChampion);
    seeds[prev.pctChampion] = "전 시즌 PST 우승";
  }
  const direct: string[] = [...holders];
  for (const r of REGIONS) {
    const table = (prev.tables[r.id] || []).filter(row => !holders.includes(row.id));
    for (const row of table.slice(0, 3)) {
      direct.push(row.id);
      seeds[row.id] = `${r.name} ${row.rank}위`;
    }
  }
  if (direct.length < 32) {
    const next = REGIONS.flatMap(r => (prev.tables[r.id] || []).filter(row => !direct.includes(row.id)).slice(0, 2));
    for (const row of pickBy(next, lotKey(season)).slice(0, 32 - direct.length)) {
      direct.push(row.id);
      seeds[row.id] = `${regionById(regionOf(row.id)).name} ${row.rank}위`;
    }
  }
  const draw: DrawData = { title: `시즌 ${season} PWT 진출권`, pools: [], boxes: [], steps: [] };
  return { season, direct: direct.slice(0, 32), seeds, po: { entrants: [], byes: [], ties: [], draw } };
}

/** Points, then goal difference, then a drawn lot (goals scored do not count here). */
function pickBy<T extends { id: string; pts: number; diff: number }>(rows: T[], lot: string): T[] {
  return rows.slice().sort((x, y) => y.pts - x.pts || y.diff - x.diff || hashStr(`${lot}:${x.id}`) - hashStr(`${lot}:${y.id}`));
}

export const qualDone = (q: Qual) => q.po.ties.every(t => t.winner);
export const qualified = (q: Qual) => [...q.direct, ...q.po.byes, ...q.po.ties.map(t => t.winner).filter((x): x is string => !!x)];

/** Pot 1: holder + best league winners; then the rest of the winners, 2nd places, 3rd places, playoff winners. */
export function makePots(q: Qual, prev: PrevSeason): string[][] {
  const list = qualified(q);
  const lot = lotKey(q.season);
  const row = (id: string): PrevRow => prevRow(prev, id) ?? { id, rank: 99, pts: 0, diff: 0, gf: 0 };
  const order: string[] = [];
  if (prev.champion && list.includes(prev.champion)) order.push(prev.champion);
  for (const rank of [1, 2, 3]) {
    const tier = list.filter(id => !order.includes(id) && row(id).rank === rank).map(row);
    order.push(...rankRows(tier, lot).map(r => r.id));
  }
  order.push(...rankRows(list.filter(id => !order.includes(id)).map(row), lot).map(r => r.id));
  return [0, 1, 2, 3].map(i => order.slice(i * 8, i * 8 + 8));
}

// round-robin for a group of 4 (indices into the group, home first)
const GROUP_ROUNDS: [number, number][][] = [
  [[0, 3], [1, 2]],
  [[2, 0], [3, 1]],
  [[0, 1], [2, 3]],
  [[1, 0], [3, 2]],
  [[0, 2], [1, 3]],
  [[3, 0], [2, 1]],
];

function startTournament(name: string, season: number, pots: string[][], seedOf: (id: string) => string, rng: Rng): PwtState {
  const { groups, draw } = drawGroups(pots, regionOf, rng, `시즌 ${season} ${name} 조 추첨`);
  const fixtures = GROUP_ROUNDS.map(md => groups.flatMap(g => md.map(([h, a]) => ({ home: g[h], away: g[a] }) as Fixture)));
  const entrants = pots.flat();
  const seeds: Record<string, string> = {};
  for (const id of entrants) seeds[id] = seedOf(id);
  return { name, season, entrants, seeds, pots, groups, groupDraw: draw, fixtures, ko: [] };
}

export function startPwt(q: Qual, prev: PrevSeason, rng: Rng): PwtState {
  return startTournament("PWT", q.season, makePots(q, prev), id => q.seeds[id] ?? "", rng);
}

/**
 * PCT (Pokémon Challenge Tournament) for those not in the PWT: from every league its top 3 not in the PWT,
 * the league's cup winner first (30), then the next one of each league (10) by points, goal difference and lot:
 * the best 2 go (32). Pots: cup winners, then by league place and points.
 */
export function pctEntrants(prev: PrevSeason, season: number, pwtEntrants: string[], tier: "pct" | "ect" = "pct"): { order: string[]; seeds: Record<string, string> } {
  const lot = `${tier}${season}`;
  const seeds: Record<string, string> = {};
  const inPwt = new Set(pwtEntrants);
  const row = (id: string): PrevRow => prevRow(prev, id) ?? { id, rank: 99, pts: 0, diff: 0, gf: 0 };
  const picked: PrevRow[] = [];
  // the PST holds a place for last season's PCT winner (like the Conference League winner in the Europa League)
  const holder = tier === "pct" ? prev.ectChampion : undefined;
  if (holder && trainerById(holder) && !inPwt.has(holder)) {
    picked.push(row(holder));
    seeds[holder] = "전 시즌 PCT 우승";
    inPwt.add(holder);
  }
  const nextUp: PrevRow[] = [];
  for (const r of REGIONS) {
    const cup = prev.cupWinners?.[r.id];
    const rest = (prev.tables[r.id] || []).filter(x => !inPwt.has(x.id) && x.id !== cup);
    const list = cup && !inPwt.has(cup) && trainerById(cup) ? [row(cup), ...rest] : rest;
    list.slice(0, 3).forEach(x => {
      picked.push(x);
      seeds[x.id] = x.id === cup ? `${r.name} 컵 우승` : `${r.name} ${x.rank}위`;
    });
    if (list[3]) nextUp.push(list[3]);
  }
  for (const x of pickBy(nextUp, lot).slice(0, Math.max(0, 32 - picked.length))) {
    picked.push(x);
    seeds[x.id] = `${regionById(regionOf(x.id)).name} ${x.rank}위`;
  }
  const cups = new Set(Object.values(prev.cupWinners || {}));
  const order = [...rankRows(picked.filter(x => cups.has(x.id)), lot), ...rankRows(picked.filter(x => !cups.has(x.id)).sort((a, b) => a.rank - b.rank), lot).sort((a, b) => a.rank - b.rank)].map(x => x.id);
  return { order: order.slice(0, 32), seeds };
}

export function startPct(prev: PrevSeason, season: number, pwtEntrants: string[], rng: Rng): PwtState {
  const { order, seeds } = pctEntrants(prev, season, pwtEntrants, "pct");
  return { ...startTournament("PST", season, [0, 1, 2, 3].map(i => order.slice(i * 8, i * 8 + 8)), id => seeds[id] ?? "", rng), tier: "pct" };
}

/** The third tier (PCT): picked the same way from those in neither the PWT nor the PST. */
export function startEct(prev: PrevSeason, season: number, above: string[], rng: Rng): PwtState {
  const { order, seeds } = pctEntrants(prev, season, above, "ect");
  return { ...startTournament("PCT", season, [0, 1, 2, 3].map(i => order.slice(i * 8, i * 8 + 8)), id => seeds[id] ?? "", rng), tier: "ect" };
}

/** Whether `id` takes part in this tournament (an entrant, or dropped in from the tier above for the playoff). */
export const takesPart = (T: PwtState | null | undefined, id: string) => !!T && (T.entrants.includes(id) || !!T.kpo?.some(t => t.a === id || t.b === id));

/** Group places (1-based) of every group: [winners, runners-up, thirds]. */
function groupPlaces(T: PwtState): string[][] {
  const out: string[][] = [[], [], []];
  T.groups.forEach((_, gi) => {
    const t = groupTable(T, gi);
    for (let k = 0; k < 3; k++) out[k].push(t[k].id);
  });
  return out;
}

/**
 * Knockout playoff draw for a lower tier: its group runners-up (seeded, at home in the 2nd leg) against the tier
 * above's group 3rds. No two from the same region where possible.
 */
export function drawKoPlayoff(lower: PwtState, upper: PwtState, rng: Rng) {
  const runners = groupPlaces(lower)[1];
  const thirds = groupPlaces(upper)[2];
  const groupOf = (id: string) => (lower.entrants.includes(id) ? groupIndex(lower, id) : 100 + groupIndex(upper, id));
  const { pairs, draw } = drawKnockout(runners, thirds, groupOf, regionOf, rng, `시즌 ${lower.season} ${lower.name} 녹아웃 플레이오프 추첨`);
  lower.kpoDraw = draw;
  lower.kpo = pairs.map(([third, runner]) => newTie(third, runner, "two-leg"));
}

export function groupIndex(pwt: PwtState, id: string): number {
  return pwt.groups.findIndex(g => g.includes(id));
}

export function groupTable(pwt: PwtState, gi: number): TableRow[] {
  const teams = pwt.groups[gi];
  const fx = pwt.fixtures.flat().filter(f => teams.includes(f.home));
  const t = tableFrom(teams, fx);
  return rankRows(teams.map(id => t[id]), `${(pwt.name || "PWT").toLowerCase()}${pwt.season}g${gi}`);
}

export function groupStageDone(pwt: PwtState): boolean {
  return pwt.fixtures.every(md => md.every(f => f.result));
}

export function drawPwtKnockout(pwt: PwtState, rng: Rng) {
  const winners: string[] = [];
  let runners: string[] = [];
  pwt.groups.forEach((_, gi) => {
    const t = groupTable(pwt, gi);
    winners.push(t[0].id);
    runners.push(t[1].id);
  });
  // PST / PCT: the group winners meet the knockout playoff winners
  if (pwt.kpo?.length) runners = pwt.kpo.map(t => t.winner).filter((x): x is string => !!x);
  const groupOf = (id: string) => (pwt.entrants.includes(id) ? groupIndex(pwt, id) : 100 + runners.indexOf(id));
  const { pairs, draw } = drawKnockout(winners, runners, groupOf, regionOf, rng, `시즌 ${pwt.season} ${pwt.name || "PWT"} 토너먼트 추첨`);
  pwt.koDraw = draw;
  // group winners host the second leg
  pwt.ko = [pairs.map(([r, w]) => newTie(r, w, "two-leg"))];
}

/** Builds knockout round `r` from the previous round's winners when it doesn't exist yet. */
export function ensureKoRound(pwt: PwtState, r: number): Tie[] | null {
  if (pwt.ko[r]) return pwt.ko[r];
  const prev = pwt.ko[r - 1];
  if (!prev || prev.some(t => !t.winner)) return null;
  const next: Tie[] = [];
  for (let i = 0; i + 1 < prev.length; i += 2) next.push(newTie(prev[i].winner!, prev[i + 1].winner!, "two-leg"));
  pwt.ko[r] = next;
  return next;
}

export function ensureFinal(pwt: PwtState): Tie | null {
  if (pwt.final) return pwt.final;
  const sf = pwt.ko[2];
  if (!sf || sf.length < 2 || sf.some(t => !t.winner)) return null;
  pwt.final = newTie(sf[0].winner!, sf[1].winner!, "bo3");
  return pwt.final;
}

export const KO_NAMES = ["16강", "8강", "4강"];

/** Player-facing summary of how far `id` went. */
export function pwtResult(pwt: PwtState | null, q: Qual | null, id: string): string {
  if (!pwt || !takesPart(pwt, id)) {
    if (q && q.po.entrants.includes(id)) return "플레이오프 탈락";
    return "진출 실패";
  }
  if (pwt.champion === id) return "우승";
  if (pwt.final && (pwt.final.a === id || pwt.final.b === id)) return pwt.final.winner ? "준우승" : "결승";
  for (let r = pwt.ko.length - 1; r >= 0; r--) {
    const t = pwt.ko[r].find(x => x.a === id || x.b === id);
    if (t) return t.winner && t.winner !== id ? `${KO_NAMES[r]} 탈락` : KO_NAMES[r];
  }
  const po = pwt.kpo?.find(x => x.a === id || x.b === id);
  if (po) return po.winner && po.winner !== id ? "플레이오프 탈락" : "녹아웃 플레이오프";
  if (groupStageDone(pwt)) {
    const place = groupTable(pwt, groupIndex(pwt, id)).findIndex(r => r.id === id) + 1;
    if (pwt.tier !== "ect" && place === 3) return `조 3위 (${pwt.tier === "pct" ? "PCT" : "PST"} 플레이오프로)`;
    if (pwt.tier && pwt.tier !== "pwt" && place === 2) return "조 2위 (녹아웃 플레이오프)";
    return place <= (pwt.tier && pwt.tier !== "pwt" ? 1 : 2) ? "조별리그 통과" : "조별리그 탈락";
  }
  return `조별리그 (${GROUP_NAMES[groupIndex(pwt, id)]}조)`;
}

/** Is `id` still in the tournament? */
export function pwtAlive(pwt: PwtState, id: string): boolean {
  if (!takesPart(pwt, id) || pwt.champion) return pwt.champion === id;
  if (pwt.final) return pwt.final.a === id || pwt.final.b === id;
  if (pwt.ko.length) {
    const last = pwt.ko[pwt.ko.length - 1];
    const t = last.find(x => x.a === id || x.b === id);
    return !!t && (!t.winner || t.winner === id);
  }
  if (pwt.kpo?.length) {
    if (groupStageDone(pwt) && pwt.entrants.includes(id) && groupTable(pwt, groupIndex(pwt, id))[0].id === id) return true;
    const t = pwt.kpo.find(x => x.a === id || x.b === id);
    return !!t && (!t.winner || t.winner === id);
  }
  if (groupStageDone(pwt)) {
    const gi = groupIndex(pwt, id);
    if (gi < 0) return false;
    return groupTable(pwt, gi).slice(0, 2).some(r => r.id === id);
  }
  return true;
}
