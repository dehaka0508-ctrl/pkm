// Knockout ties: single game, two legs (wins → remaining-Pokémon difference → one extra game), best of 3.

export interface TieGame {
  /** 0 = a won, 1 = b won, -1 = draw */
  w: 0 | 1 | -1;
  ra: number;
  rb: number;
  /** who hosted: 0 = a, 1 = b, -1 = neutral */
  home: 0 | 1 | -1;
  extra?: boolean;
}

export interface Tie {
  a: string; // hosts the first leg
  b: string; // hosts the second leg
  format: "single" | "two-leg" | "bo3";
  games: TieGame[];
  winner?: string;
}

export const newTie = (a: string, b: string, format: Tie["format"]): Tie => ({ a, b, format, games: [] });

const MAX_EXTRA = 6;

/** Does the tie need another game on this leg's day? (leg is 0/1 for two-leg ties, 0 otherwise) */
export function needsGame(t: Tie, leg = 0): boolean {
  if (t.winner) return false;
  if (t.format === "two-leg" && leg === 0) return t.games.length === 0;
  return true;
}

/** Host of the next game: 0 = a, 1 = b, -1 = neutral. */
export function nextHome(t: Tie): 0 | 1 | -1 {
  if (t.format === "bo3") return -1;
  if (t.format === "single") return 0;
  return t.games.length === 0 ? 0 : 1;
}

export function addGame(t: Tie, g: Omit<TieGame, "home" | "extra">) {
  const home = nextHome(t);
  const extra = t.format === "two-leg" && t.games.length >= 2;
  t.games.push({ ...g, home, ...(extra ? { extra } : {}) });
  decide(t);
}

export function tieScore(t: Tie): { wa: number; wb: number; da: number } {
  let wa = 0;
  let wb = 0;
  let da = 0;
  for (const g of t.games) {
    if (g.extra) continue;
    if (g.w === 0) wa++;
    else if (g.w === 1) wb++;
    da += g.ra - g.rb;
  }
  return { wa, wb, da };
}

function decide(t: Tie) {
  const n = t.games.length;
  if (t.format === "single") {
    const last = t.games[n - 1];
    if (last.w !== -1) t.winner = last.w === 0 ? t.a : t.b;
    else if (n >= MAX_EXTRA) t.winner = last.ra >= last.rb ? t.a : t.b;
    return;
  }
  if (t.format === "bo3") {
    const { wa, wb, da } = tieScore(t);
    if (wa >= 2) t.winner = t.a;
    else if (wb >= 2) t.winner = t.b;
    else if (n >= 3 + MAX_EXTRA) t.winner = wa !== wb ? (wa > wb ? t.a : t.b) : da >= 0 ? t.a : t.b;
    return;
  }
  if (n < 2) return;
  const { wa, wb, da } = tieScore(t);
  if (wa !== wb) t.winner = wa > wb ? t.a : t.b;
  else if (da !== 0) t.winner = da > 0 ? t.a : t.b;
  else {
    const extra = t.games.slice(2).find(g => g.w !== -1);
    if (extra) t.winner = extra.w === 0 ? t.a : t.b;
    else if (n >= 2 + MAX_EXTRA) t.winner = t.b;
  }
}

/** Short score text from `me`'s point of view (or a's when me isn't in the tie). */
export function tieText(t: Tie, me?: string): string {
  if (!t.games.length) return "";
  const flip = me === t.b;
  const { wa, wb, da } = tieScore(t);
  if (t.format === "bo3") return flip ? `${wb}:${wa}` : `${wa}:${wb}`;
  if (t.format === "single") {
    const g = t.games.find(x => x.w !== -1) ?? t.games[t.games.length - 1];
    return flip ? `${g.rb}:${g.ra}` : `${g.ra}:${g.rb}`;
  }
  const legs = t.games.filter(g => !g.extra).map(g => (flip ? `${g.rb}:${g.ra}` : `${g.ra}:${g.rb}`));
  let s = legs.join(", ");
  if (t.games.length >= 2 && wa === wb && da === 0) s += " · 추가전";
  return s;
}

export function loserOf(t: Tie): string | undefined {
  return t.winner ? (t.winner === t.a ? t.b : t.a) : undefined;
}
