import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove, koNature } from "../src/data/dex";
it("elm battles", () => {
  const t = allTrainers().find(x => x.name === "공박사")!;
  console.log(resolveTeam(t).map(m => `${koSpecies(m.species)}(${koNature(m.nature)}):${m.moves.map(koMove).join("/")}`).join("  "));
  expect(resolveTeam(t).every(m => !m.placeholder && m.ivs.hp === 25)).toBe(true);
  const r = simulateMatch({ name: t.name, team: resolveTeam(t), gimmick: null, skill: roleSkill(t.role) }, { name: "x", team: resolveTeam(allTrainers().find(x => x.name === "실버")!), gimmick: null, skill: 0.75 }, "elm");
  expect(r.turns).toBeGreaterThan(0);
});
