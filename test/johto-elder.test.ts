import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill, trainerIv } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove } from "../src/data/dex";
it("elder battles", () => {
  const t = allTrainers().find(x => x.name === "장로 청성")!;
  console.log(resolveTeam(t).map(m => `${koSpecies(m.species)}:${m.moves.map(koMove).join("/")}`).join("  "));
  expect(resolveTeam(t).every(m => !m.placeholder && m.moves.length > 0 && m.ivs.hp === trainerIv(t))).toBe(true);
  const r = simulateMatch({ name: t.name, team: resolveTeam(t), gimmick: null, skill: roleSkill(t.role) }, { name: "x", team: resolveTeam(allTrainers().find(x => x.name === "유빈")!), gimmick: null, skill: 0.7 }, "el");
  expect(r.turns).toBeGreaterThan(0);
});
