// Regional cup, run like a Pokémon Champions event: Swiss rounds (best of 1), then the top 8 play a
// single-elimination bracket (quarter-finals, semi-finals, final — every match a single game).
// Every cup match is a doubles battle with all six Pokémon.
import type { Fixture } from "./league";
import { newTie, type Tie } from "./tie";
import { Rng } from "./rng";
import type { PrevRow } from "./pwt";

export const SWISS_ROUNDS = 5;
export const TOP_CUT = 8;
/** Cup round index → name (0..4 Swiss, 5 quarter-finals, 6 semi-finals; the final is its own event). */
export { CUP_ROUND_NAMES } from "./calendar";
export const KO_KEYS = [["QF0", "QF1", "QF2", "QF3"], ["SF0", "SF1"], ["F"]];
export const CUP_STAGE_NAME: Record<string, string> = { QF: "8강", SF: "4강", F: "결승" };
export const stageOf = (key: string) => key.replace(/\d+$/, "");
/** Prize money for winning a knockout match (the player and NPCs alike). */
export const CUP_KO_PRIZE: Record<string, number> = { QF: 20000, SF: 40000, F: 80000 };
export const SWISS_WIN_BONUS = 5000;

export interface SwissRow {
  id: string;
  w: number;
  l: number;
  d: number;
  pts: number; // win 1, draw 0.5
  opp: string[];
  buchholz: number;
}

export interface Cup {
  region: string;
  season: number;
  /** Swiss rounds: pairings with results (home = listed first) */
  swiss: Fixture[][];
  /** knockout ties: QF0..QF3, SF0, SF1, F */
  ties: Record<string, Tie>;
  /** previous-season league rank (Swiss seeding, tie-breaks) */
  rank: Record<string, number>;
  /** top 8 after the Swiss rounds, 1st..8th */
  seeds?: string[];
  champion?: string;
  teams: string[];
}

export function makeCup(region: string, season: number, teams: string[], prev: PrevRow[] | undefined, random: boolean, rng: Rng): Cup {
  const rank: Record<string, number> = {};
  (prev || []).forEach(r => (rank[r.id] = r.rank));
  teams.forEach(id => (rank[id] ??= 99));
  const cup: Cup = { region, season, swiss: [], ties: {}, rank, teams: teams.slice() };
  // round 1: top half vs bottom half by last season's rank (season 1: random)
  const order = random ? rng.shuffle(teams.slice()) : teams.slice().sort((a, b) => rank[a] - rank[b]);
  const half = Math.floor(order.length / 2);
  cup.swiss.push(order.slice(0, half).map((a, i) => fixture(a, order[half + i])));
  return cup;
}

const fixture = (home: string, away: string): Fixture => ({ home, away }) as Fixture;

/** Swiss table: points, then Buchholz (opponents' points), then last season's rank. */
export function swissTable(cup: Cup): SwissRow[] {
  const rows: Record<string, SwissRow> = {};
  for (const id of cup.teams) rows[id] = { id, w: 0, l: 0, d: 0, pts: 0, opp: [], buchholz: 0 };
  for (const round of cup.swiss)
    for (const f of round) {
      const h = rows[f.home];
      const a = rows[f.away];
      if (!h || !a) continue;
      h.opp.push(f.away);
      a.opp.push(f.home);
      if (!f.result) continue;
      if (f.result.w === -1) {
        h.d++;
        a.d++;
        h.pts += 0.5;
        a.pts += 0.5;
      } else if (f.result.w === 0) {
        h.w++;
        a.l++;
        h.pts++;
      } else {
        a.w++;
        h.l++;
        a.pts++;
      }
    }
  for (const r of Object.values(rows)) r.buchholz = r.opp.reduce((s, o) => s + (rows[o]?.pts ?? 0), 0);
  return Object.values(rows).sort((x, y) => y.pts - x.pts || y.buchholz - x.buchholz || cup.rank[x.id] - cup.rank[y.id] || x.id.localeCompare(y.id));
}

const roundDone = (r: Fixture[] | undefined) => !!r && r.every(f => f.result);

/** Pairs Swiss round `round` (0-based) once the previous one is finished: same score first, no rematches. */
export function ensureSwissRound(cup: Cup, round: number): Fixture[] | null {
  if (cup.swiss[round]) return cup.swiss[round];
  if (round >= SWISS_ROUNDS || round !== cup.swiss.length || !roundDone(cup.swiss[round - 1])) return null;
  const table = swissTable(cup);
  const met = new Set(table.flatMap(r => r.opp.map(o => `${r.id}|${o}`)));
  const pairs = pairUp(table.map(r => r.id), (a, b) => !met.has(`${a}|${b}`));
  // the higher-placed trainer is listed first (hosts)
  cup.swiss.push(pairs.map(([a, b]) => fixture(a, b)));
  return cup.swiss[round];
}

/** Pairs a ranked list top-down, backtracking to avoid rematches; falls back to plain order. */
function pairUp(ids: string[], ok: (a: string, b: string) => boolean): [string, string][] {
  const solve = (left: string[]): [string, string][] | null => {
    if (!left.length) return [];
    const [a, ...rest] = left;
    for (let i = 0; i < rest.length; i++) {
      if (!ok(a, rest[i])) continue;
      const sub = solve(rest.filter((_, j) => j !== i));
      if (sub) return [[a, rest[i]], ...sub];
    }
    return null;
  };
  const r = solve(ids);
  if (r) return r;
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) out.push([ids[i], ids[i + 1]]);
  return out;
}

export const swissDone = (cup: Cup) => cup.swiss.length >= SWISS_ROUNDS && roundDone(cup.swiss[SWISS_ROUNDS - 1]);

/** Knockout ties of a stage (0 = QF, 1 = SF, 2 = F), created once the previous stage is decided. */
export function ensureKo(cup: Cup, stage: number): Tie[] {
  if (stage === 0 && !cup.ties.QF0) {
    if (!swissDone(cup)) return [];
    cup.seeds = swissTable(cup)
      .slice(0, TOP_CUT)
      .map(r => r.id);
    const s = cup.seeds;
    // 1v8, 4v5 | 2v7, 3v6 — the better seed is listed first
    [[0, 7], [3, 4], [1, 6], [2, 5]].forEach(([x, y], i) => (cup.ties[`QF${i}`] = newTie(s[x], s[y], "single")));
  }
  if (stage === 1 && !cup.ties.SF0) {
    const w = KO_KEYS[0].map(k => cup.ties[k]?.winner);
    if (w.every(Boolean)) {
      cup.ties.SF0 = newTie(w[0]!, w[1]!, "single");
      cup.ties.SF1 = newTie(w[2]!, w[3]!, "single");
    }
  }
  if (stage === 2 && !cup.ties.F) {
    const a = cup.ties.SF0?.winner;
    const b = cup.ties.SF1?.winner;
    if (a && b) cup.ties.F = newTie(a, b, "single");
  }
  return KO_KEYS[stage].map(k => cup.ties[k]).filter((t): t is Tie => !!t);
}

/** The knockout keys `id` plays (or would play), in order. */
export function cupKoPath(cup: Cup, id: string): string[] {
  const i = cup.seeds?.indexOf(id) ?? -1;
  if (i < 0) return [];
  const qf = ({ 0: 0, 7: 0, 3: 1, 4: 1, 1: 2, 6: 2, 2: 3, 5: 3 } as Record<number, number>)[i];
  return [`QF${qf}`, `SF${qf < 2 ? 0 : 1}`, "F"];
}

export function cupAlive(cup: Cup, id: string): boolean {
  if (!swissDone(cup)) return true;
  const path = cupKoPath(cup, id);
  if (!path.length) return false;
  return !path.some(k => cup.ties[k]?.winner && cup.ties[k].winner !== id);
}

export function cupResult(cup: Cup | undefined, id: string): string {
  if (!cup) return "-";
  if (cup.champion === id) return "우승";
  if (!cup.swiss) return "-";
  const row = swissTable(cup).find(r => r.id === id);
  const rec = row ? `${row.w}승 ${row.l}패${row.d ? ` ${row.d}무` : ""}` : "";
  if (!swissDone(cup)) return `스위스 진행 중 (${rec})`;
  const path = cupKoPath(cup, id);
  if (!path.length) return `스위스 탈락 (${rec})`;
  for (const k of path) {
    const t = cup.ties[k];
    if (!t || !t.winner) return `${CUP_STAGE_NAME[stageOf(k)]} 진행 중`;
    if (t.winner !== id) return k === "F" ? "준우승" : `${CUP_STAGE_NAME[stageOf(k)]} 탈락`;
  }
  return "진행 중";
}

/** Old saves: the wing-bracket cup (two-legged ties) is replaced by this format. */
export function isLegacyCup(c: any): boolean {
  return !!c && !Array.isArray(c.swiss);
}
