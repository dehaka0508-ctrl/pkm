import type { GameState, TieRef } from "./state";
import { leagueLineupRun } from "./rotation";

/** Late-round stakes use strict point bounds. Ties on points can still move either club. */
export function leagueGateImportance(state: GameState, region: string, home: string, away: string): number {
  const league = state.leagues[region];
  if (!league) return 0;
  const left = league.rounds.length - league.nextRound;
  if (left < 1 || left > 5) return 0;
  const bounds = league.teams.map(id => {
    const row = league.table[id];
    const points = row?.pts ?? 0;
    return { id, points, max: points + 3 * left };
  });
  const clubs = [home, away].map(id => {
    const team = bounds.find(row => row.id === id);
    if (!team) return { best: 1, worst: league.teams.length };
    const others = bounds.filter(row => row !== team);
    return {
      best: 1 + others.filter(row => row.points > team.max).length,
      worst: 1 + others.filter(row => row.max >= team.points).length,
    };
  });
  if (clubs.some(c => c.best === 1 && c.worst > 1)) return left <= 2 ? 10 : 6;
  // At most five local PWT entrants, five PST entrants and four PCT entrants
  // can take places before the next eligible league rank, including holders and wild cards.
  const fixed = clubs.every(c => c.best > 14 || c.best === c.worst && c.best <= 3);
  return fixed ? -5 : 0;
}

export function leagueGateAfterLineup(state: GameState, host: string, importance: number): number {
  return (leagueLineupRun(state, host)?.streak ?? 0) >= 5 ? -5 : importance;
}

export function tieGateImportance(ref: TieRef): number {
  switch (ref.kind) {
    case "pwtFinal": case "pctFinal": case "ectFinal": case "world": case "super": return 10;
    case "worldSemi": return 7;
    case "cup": return ref.key === "F" ? 10 : ref.key.endsWith("WF") ? 7 : ref.key === "T" ? 2 : 3;
    case "psb": return ref.key === "final" ? 10 : ref.key.endsWith(":3") ? 7 : 4;
    case "ko": case "pctKo": case "ectKo": return ref.round === 2 ? 7 : 4;
    case "po": case "kpo": return 4;
    case "third": return 2;
  }
}
