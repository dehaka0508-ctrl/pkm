import { it, expect } from "vitest";
import { simulateMatch } from "../src/battle/engine";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";

it("doubles: AI vs AI with all six, finishes with sensible results", () => {
  const t = (n: string) => allTrainers().find(x => x.name === n)!;
  const side = (n: string) => ({ name: n, team: resolveTeam(t(n)), gimmick: t(n).gimmick, skill: roleSkill(t(n).role) });
  let decided = 0;
  for (let i = 0; i < 6; i++) {
    const r = simulateMatch(side("난천"), side("성호"), `d${i}`, { doubles: true });
    expect(r.remaining[0] + r.remaining[1]).toBeGreaterThan(0);
    expect(r.remaining[0]).toBeLessThanOrEqual(6);
    if (r.winner !== -1) decided++;
    console.log(i, r.winner, r.remaining, r.turns, JSON.stringify(r.kos));
  }
  expect(decided).toBeGreaterThan(3);
});
