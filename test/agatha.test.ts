import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";

it("agatha lineup battles (Levitate Gengar, Alolan Marowak)", () => {
  const t = allTrainers().find(x => x.name === "국화")!;
  const team = resolveTeam(t);
  console.log(team.map(m => `${m.species} ${m.ability} ${m.item} ${m.moves.join("/")} iv${m.ivs.hp}`).join("\n"));
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  const foe = resolveTeam(allTrainers().find(x => x.name === "시바")!);
  for (let i = 0; i < 4; i++) {
    const r = simulateMatch({ name: "국화", team, gimmick: null, skill: 0.85 }, { name: "시바", team: foe, gimmick: null, skill: 0.85 }, "a" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
