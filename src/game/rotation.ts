import type { GameState } from "./state";

export interface LeagueLineupRun {
  season: number;
  uids: string[];
  streak: number;
  penalty?: number;
}

const lineupKey = (uids: readonly string[]) => uids.length >= 4 && uids.length <= 6 && new Set(uids).size === uids.length ? [...uids].sort() : null;
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((u, i) => u === b[i]);

export function leagueLineupRun(state: GameState, id: string): LeagueLineupRun | undefined {
  const run = state.leagueLineups?.[id];
  return run?.season === state.season ? run : undefined;
}

/** A preview never advances the run: changing pick order or reopening preparation is harmless. */
export function previewLeagueLineup(state: GameState, id: string, uids: readonly string[], rosterSize = 8) {
  const key = lineupKey(uids);
  if (!key) return { streak: 0, penalty: 0 };
  const last = leagueLineupRun(state, id);
  const streak = last && same(last.uids, key) ? last.streak + 1 : 1;
  return { streak, penalty: rosterSize > key.length ? Math.max(0, streak - 4) : 0 };
}

/** Record exactly once per completed league fixture, including all picks, not only field appearances. */
export function recordLeagueLineup(state: GameState, id: string, uids: readonly string[], rosterSize = 8) {
  const key = lineupKey(uids);
  if (!key) {
    // No selection (forfeit) breaks the sequence; other competitions never call this function.
    if (state.leagueLineups) delete state.leagueLineups[id];
    return { streak: 0, penalty: 0 };
  }
  const next = previewLeagueLineup(state, id, key, rosterSize);
  (state.leagueLineups ??= {})[id] = { season: state.season, uids: key, streak: next.streak, penalty: next.penalty };
  return next;
}

/** Only the fifth repeated choice needs intervention. A changed team starts its own run at one. */
export function leagueLineupToAvoid(state: GameState, id: string): string[] | undefined {
  const run = leagueLineupRun(state, id);
  return run && run.streak >= 4 ? run.uids.slice() : undefined;
}

export function avoidLineupIndices(team: readonly { uid: string }[], uids?: readonly string[]): number[] | undefined {
  if (!uids || uids.length < 4 || uids.length > 6) return undefined;
  const indices = uids.map(u => team.findIndex(m => m.uid === u));
  return indices.every(i => i >= 0) ? indices : undefined;
}
