// League schedule (double round-robin) and standings.
import { Rng } from "./rng";

export interface Fixture {
  home: string;
  away: string;
  /** remaining Pokémon for home/away, winner index (0 home, 1 away, -1 draw) */
  result?: { h: number; a: number; w: 0 | 1 | -1 };
}

export interface TableRow {
  id: string;
  p: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  diff: number;
  form: string[]; // last results "W" | "D" | "L"
}

export interface League {
  region: string;
  teams: string[];
  rounds: Fixture[][];
  roundWeeks: number[];
  table: Record<string, TableRow>;
  nextRound: number;
}

/** Circle-method double round-robin. N must be even (a "BYE" is inserted otherwise). */
export function makeSchedule(teams: string[], seed: string): Fixture[][] {
  const rng = new Rng(seed);
  const list = rng.shuffle(teams.slice());
  if (list.length % 2) list.push("BYE");
  const n = list.length;
  const half: Fixture[][] = [];
  const arr = list.slice();
  for (let r = 0; r < n - 1; r++) {
    const round: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "BYE" || b === "BYE") continue;
      round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    half.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  const second = half.map(round => round.map(f => ({ home: f.away, away: f.home })));
  return [...half, ...second];
}

export function emptyRow(id: string): TableRow {
  return { id, p: 0, w: 0, d: 0, l: 0, pts: 0, diff: 0, form: [] };
}

export function applyResult(table: Record<string, TableRow>, f: Fixture) {
  if (!f.result) return;
  const h = (table[f.home] ||= emptyRow(f.home));
  const a = (table[f.away] ||= emptyRow(f.away));
  h.p++;
  a.p++;
  h.diff += f.result.h - f.result.a;
  a.diff += f.result.a - f.result.h;
  const push = (r: TableRow, x: string) => {
    r.form.push(x);
    if (r.form.length > 5) r.form.shift();
  };
  if (f.result.w === 0) {
    h.w++;
    h.pts += 3;
    a.l++;
    push(h, "W");
    push(a, "L");
  } else if (f.result.w === 1) {
    a.w++;
    a.pts += 3;
    h.l++;
    push(h, "L");
    push(a, "W");
  } else {
    h.d++;
    a.d++;
    h.pts++;
    a.pts++;
    push(h, "D");
    push(a, "D");
  }
}

export function standings(league: League): TableRow[] {
  return league.teams
    .map(id => league.table[id] || emptyRow(id))
    .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.w - x.w || x.id.localeCompare(y.id));
}

export function rankOf(league: League, id: string): number {
  return standings(league).findIndex(r => r.id === id) + 1;
}
