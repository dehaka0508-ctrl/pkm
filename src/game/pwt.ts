// Pokémon World Tournament, Champions-League style.
// Qualification: last season's league top 3 + defending champion; 4th places play a one-game
// playoff for the remaining spots. 32 trainers → 4 pots → 8 groups of 4 (double round robin)
// → top 2 → two-legged knockout (R16 / QF / SF) → best-of-3 final.
import { REGIONS, regionById } from "../data/dex";
import { compareRows, rankRows, tableFrom, type Fixture, type TableRow } from "./league";
import { drawGroups, drawKnockout, GROUP_NAMES, type DrawData } from "./draw";
import { newTie, type Tie } from "./tie";
import { Rng } from "./rng";
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
  pctChampion?: string;
  cupWinners?: Record<string, string>;
}

export interface Qual {
  season: number; // the PWT season these spots are for
  direct: string[];
  seeds: Record<string, string>;
  po: { entrants: string[]; byes: string[]; ties: Tie[]; draw: DrawData };
}

export interface PwtState {
  /** "PWT" or "PCT" (same format) */
  name?: string;
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

export function buildQual(prev: PrevSeason, season: number, rng: Rng): Qual {
  const seeds: Record<string, string> = {};
  const direct: string[] = [];
  const champ = prev.champion;
  if (champ) {
    direct.push(champ);
    seeds[champ] = "디펜딩 챔피언";
  }
  for (const r of REGIONS) {
    for (const row of (prev.tables[r.id] || []).slice(0, 3)) {
      if (!direct.includes(row.id)) direct.push(row.id);
      seeds[row.id] ||= `${r.name} ${row.rank}위`;
    }
  }
  const slots = Math.max(0, 32 - direct.length);
  let fourths = REGIONS.map(r => prev.tables[r.id]?.[3])
    .filter((x): x is PrevRow => !!x && !direct.includes(x.id))
    .sort((a, b) => compareRows(a, b, lotKey(season)));
  if (fourths.length > slots * 2) fourths = fourths.slice(0, slots * 2);
  const byeN = Math.max(0, slots * 2 - fourths.length);
  const byes = fourths.slice(0, byeN).map(x => x.id);
  for (const x of fourths) seeds[x.id] = `${regionById(regionOf(x.id)).name} 4위 (PO)`;
  const rest = rng.shuffle(fourths.slice(byeN).map(x => x.id));
  const ties: Tie[] = [];
  const steps: DrawData["steps"] = [];
  const off = byes.length ? 1 : 0;
  byes.forEach((id, i) => steps.push({ team: id, pool: 0, box: 0, slot: i }));
  for (let i = 0; i + 1 < rest.length; i += 2) {
    ties.push(newTie(rest[i], rest[i + 1], "single"));
    steps.push({ team: rest[i], pool: 0, box: off + i / 2, slot: 0 });
    steps.push({ team: rest[i + 1], pool: 0, box: off + i / 2, slot: 1 });
  }
  const draw: DrawData = {
    title: `시즌 ${season} PWT 플레이오프 추첨`,
    pools: [{ name: "지방 리그 4위", teams: fourths.map(x => x.id) }],
    boxes: [...(byes.length ? [{ name: "부전승 (전 시즌 승점 상위)", size: byes.length }] : []), ...ties.map((_, i) => ({ name: `플레이오프 ${i + 1}`, size: 2 }))],
    steps,
  };
  return { season, direct, seeds, po: { entrants: fourths.map(x => x.id), byes, ties, draw } };
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
 * PCT (Pokémon Challenge Tournament): last season's cup winners and league 4th–6th who are not in the PWT,
 * then 7th places by points, then 8th places… until 32. Pots: cup winners, then by league rank and points.
 */
export function pctEntrants(prev: PrevSeason, season: number, pwtEntrants: string[]): { order: string[]; seeds: Record<string, string> } {
  const lot = `pct${season}`;
  const seeds: Record<string, string> = {};
  const inPwt = new Set(pwtEntrants);
  const row = (id: string): PrevRow => prevRow(prev, id) ?? { id, rank: 99, pts: 0, diff: 0, gf: 0 };
  const cups = Object.entries(prev.cupWinners || {})
    .filter(([, id]) => id && !inPwt.has(id))
    .map(([r, id]) => {
      seeds[id] = `${regionById(r).name} 컵 우승`;
      return row(id);
    });
  const order: string[] = rankRows(cups, lot).map(x => x.id);
  const add = (rank: number, limit: number) => {
    const tier = REGIONS.map(r => prev.tables[r.id]?.[rank - 1]).filter((x): x is PrevRow => !!x && !inPwt.has(x.id) && !order.includes(x.id));
    for (const x of rankRows(tier, lot).slice(0, limit)) {
      order.push(x.id);
      seeds[x.id] = `${regionById(regionOf(x.id)).name} ${rank}위`;
    }
  };
  for (const rank of [4, 5, 6]) add(rank, 99);
  for (let rank = 7; order.length < 32 && rank <= 20; rank++) add(rank, 32 - order.length);
  return { order: order.slice(0, 32), seeds };
}

export function startPct(prev: PrevSeason, season: number, pwtEntrants: string[], rng: Rng): PwtState {
  const { order, seeds } = pctEntrants(prev, season, pwtEntrants);
  return startTournament("PCT", season, [0, 1, 2, 3].map(i => order.slice(i * 8, i * 8 + 8)), id => seeds[id] ?? "", rng);
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
  const runners: string[] = [];
  pwt.groups.forEach((_, gi) => {
    const t = groupTable(pwt, gi);
    winners.push(t[0].id);
    runners.push(t[1].id);
  });
  const { pairs, draw } = drawKnockout(winners, runners, id => groupIndex(pwt, id), regionOf, rng, `시즌 ${pwt.season} ${pwt.name || "PWT"} 토너먼트 추첨`);
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
  if (!pwt || !pwt.entrants.includes(id)) {
    if (q && q.po.entrants.includes(id)) return "플레이오프 탈락";
    return "진출 실패";
  }
  if (pwt.champion === id) return "우승";
  if (pwt.final && (pwt.final.a === id || pwt.final.b === id)) return pwt.final.winner ? "준우승" : "결승";
  for (let r = pwt.ko.length - 1; r >= 0; r--) {
    const t = pwt.ko[r].find(x => x.a === id || x.b === id);
    if (t) return t.winner && t.winner !== id ? `${KO_NAMES[r]} 탈락` : KO_NAMES[r];
  }
  if (groupStageDone(pwt)) return "조별리그 탈락";
  return `조별리그 (${GROUP_NAMES[groupIndex(pwt, id)]}조)`;
}

/** Is `id` still in the tournament? */
export function pwtAlive(pwt: PwtState, id: string): boolean {
  if (!pwt.entrants.includes(id) || pwt.champion) return pwt.champion === id;
  if (pwt.final) return pwt.final.a === id || pwt.final.b === id;
  if (pwt.ko.length) {
    const last = pwt.ko[pwt.ko.length - 1];
    const t = last.find(x => x.a === id || x.b === id);
    return !!t && (!t.winner || t.winner === id);
  }
  if (groupStageDone(pwt)) {
    const gi = groupIndex(pwt, id);
    return groupTable(pwt, gi).slice(0, 2).some(r => r.id === id);
  }
  return true;
}
