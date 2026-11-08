// Records for every Pokémon in every official game (player's and NPCs'): appearances, KOs, damage dealt and
// damage taken (HP from hits on / by the other side, ai: engine.ts scanKOs).
//  - this season, per competition: each region's league and cup, PWT, PCT → top 10 tables
//  - league end: individual awards per region (most KOs / most damage dealt / most damage taken)
//  - all time, per league: Pokémon totals; trainer titles, best champion points, longest win / loss runs
import type { MatchResult } from "../battle/engine";
import type { GameState } from "./state";
import type { TeamMember } from "./types";

/** One Pokémon's line: species (latest form), appearances, KOs, damage dealt, damage taken. */
export interface MonStat {
  s: string;
  a: number;
  k: number;
  d: number;
  t: number;
}
/** key: "owner|uid" (owner = league slot id of the trainer who has it) */
export type MonTable = Record<string, MonStat>;
export type AwardKind = "k" | "d" | "t";
export const AWARD_KO: Record<AwardKind, string> = { k: "최다 KO상", d: "최다 피해상", t: "최다 피해 흡수상" };
export const STAT_KO: Record<keyof Omit<MonStat, "s">, string> = { a: "출전", k: "KO", d: "입힌 피해", t: "받은 피해" };

export interface Award {
  season: number;
  region: string;
  /** "cup", "pwt" or "pct" (league awards have none) */
  comp?: string;
  kind: AwardKind;
  owner: string;
  uid: string;
  species: string;
  value: number;
}
export interface Run {
  len: number;
  season: number;
}
export interface LeagueRecords {
  mons: MonTable;
  titles: Record<string, number>;
  /** champions' points, best first (top 10) */
  champPts: { owner: string; season: number; pts: number }[];
  /** current league-game runs (+n wins / −n losses) and each trainer's longest */
  run: Record<string, number>;
  bestW: Record<string, Run>;
  bestL: Record<string, Run>;
}
export interface Records {
  season: number;
  /** "league:<region>", "cup:<region>", "pwt", "pct" */
  comps: Record<string, MonTable>;
  awards: Award[];
  leagues: Record<string, LeagueRecords>;
}

export function recordsOf(state: GameState): Records {
  const r = ((state as any).records ||= { season: state.season, comps: {}, awards: [], leagues: {} }) as Records;
  if (r.season !== state.season) {
    r.season = state.season;
    r.comps = {};
  }
  return r;
}

export function leagueRecords(state: GameState, region: string): LeagueRecords {
  return (recordsOf(state).leagues[region] ||= { mons: {}, titles: {}, champPts: [], run: {}, bestW: {}, bestL: {} });
}

export const statKey = (owner: string, uid: string) => `${owner}|${uid}`;
export const keyParts = (key: string) => {
  const i = key.indexOf("|");
  return { owner: key.slice(0, i), uid: key.slice(i + 1) };
};

function add(table: MonTable, key: string, m: TeamMember, k: number, d: number, t: number) {
  const line = (table[key] ||= { s: m.species, a: 0, k: 0, d: 0, t: 0 });
  line.s = m.species; // evolutions show their latest form
  line.a++;
  line.k += k;
  line.d += d;
  line.t += t;
}

/** Books one finished game: every Pokémon that took part, for the competition (and all time for leagues). */
export function recordGame(state: GameState, comp: string | null, owners: [string, string], teams: [TeamMember[], TeamMember[]], r: MatchResult) {
  if (!comp) return;
  const rec = recordsOf(state);
  const table = (rec.comps[comp] ||= {});
  const league = comp.startsWith("league:") ? leagueRecords(state, comp.slice(7)).mons : null;
  for (const i of [0, 1] as const) {
    for (const idx of r.picks[i] || []) {
      const m = teams[i][idx];
      if (!m) continue;
      const key = statKey(owners[i], m.uid);
      const k = r.kos?.[i]?.[idx] || 0;
      const d = r.dmg?.[i]?.[idx]?.dealt || 0;
      const t = r.dmg?.[i]?.[idx]?.taken || 0;
      add(table, key, m, k, d, t);
      if (league) add(league, key, m, k, d, t);
    }
  }
}

/** A league game's result for a trainer's runs: "w", "l" or "d" (a draw ends both). */
export function leagueRun(state: GameState, region: string, owner: string, out: "w" | "l" | "d") {
  const L = leagueRecords(state, region);
  const cur = L.run[owner] || 0;
  const next = out === "w" ? Math.max(0, cur) + 1 : out === "l" ? Math.min(0, cur) - 1 : 0;
  L.run[owner] = next;
  if (next > 0 && next > (L.bestW[owner]?.len || 0)) L.bestW[owner] = { len: next, season: state.season };
  if (next < 0 && -next > (L.bestL[owner]?.len || 0)) L.bestL[owner] = { len: -next, season: state.season };
}

/** Top n of a table by one stat (ties: fewer appearances first, then more KOs). */
export function topOf(table: MonTable | undefined, kind: keyof Omit<MonStat, "s">, n = 10): ({ key: string; owner: string; uid: string } & MonStat)[] {
  if (!table) return [];
  return Object.entries(table)
    .filter(([, v]) => v[kind] > 0)
    .sort(([, a], [, b]) => b[kind] - a[kind] || (kind === "a" ? 0 : a.a - b.a) || b.k - a.k)
    .slice(0, n)
    .map(([key, v]) => ({ key, ...keyParts(key), ...v }));
}

/** League over in a region: the title, the champion's points, and the individual awards. */
export function leagueEndRecords(state: GameState, region: string, champion: { id: string; pts: number }): Award[] {
  const L = leagueRecords(state, region);
  L.titles[champion.id] = (L.titles[champion.id] || 0) + 1;
  L.champPts = [...L.champPts, { owner: champion.id, season: state.season, pts: champion.pts }].sort((a, b) => b.pts - a.pts || a.season - b.season).slice(0, 10);
  const table = recordsOf(state).comps[`league:${region}`];
  const out: Award[] = [];
  for (const kind of ["k", "d", "t"] as AwardKind[]) {
    const best = topOf(table, kind, 1)[0];
    if (!best) continue;
    out.push({ season: state.season, region, kind, owner: best.owner, uid: best.uid, species: best.s, value: best[kind] });
  }
  recordsOf(state).awards.push(...out);
  return out;
}

/** A cup / PWT / PCT is over: its individual awards (most KOs / damage dealt / damage taken). */
export function compEndAwards(state: GameState, comp: "cup" | "pwt" | "pct" | "ect", region: string): Award[] {
  const table = recordsOf(state).comps[compOf(comp, region)!];
  const out: Award[] = [];
  for (const kind of ["k", "d", "t"] as AwardKind[]) {
    const best = topOf(table, kind, 1)[0];
    if (!best) continue;
    out.push({ season: state.season, region, comp, kind, owner: best.owner, uid: best.uid, species: best.s, value: best[kind] });
  }
  recordsOf(state).awards.push(...out);
  return out;
}

/** Competition key of a game: league / cup of a region, PWT or PCT (super cups and friendlies are not counted). */
export function compOf(kind: "league" | "cup" | "pwt" | "pct" | "ect" | null, region: string): string | null {
  if (!kind) return null;
  return kind === "league" || kind === "cup" ? `${kind}:${region}` : kind;
}
