import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
it("kimono girls battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("전통무용수");
  expect(resolveTeam(t).every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 22)).toBe(true);
  const r = simulateMatch({ name: t.name, team: resolveTeam(t), gimmick: null, skill: roleSkill(t.role) }, { name: "x", team: resolveTeam(get("유빈")), gimmick: null, skill: 0.7 }, "km");
  expect(r.turns).toBeGreaterThan(0);
});
