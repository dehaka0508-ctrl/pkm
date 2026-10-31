import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";

it("archer lineup (two Houndoom) battles", () => {
  const t = allTrainers().find(x => x.name === "아폴로")!;
  const team = resolveTeam(t);
  console.log(team.map(m => `${m.species} ${m.ability} | ${m.moves.join("/")} iv${m.ivs.hp}`).join("\n"));
  expect(team.filter(m => m.species === "Houndoom").length).toBe(2);
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  const foe = allTrainers().find(x => x.name === "강연")!;
  for (let i = 0; i < 4; i++) {
    const r = simulateMatch({ name: t.name, team, gimmick: null, skill: roleSkill(t.role), picks: [4, 5, i] }, { name: foe.name, team: resolveTeam(foe), gimmick: null, skill: 0.7 }, "ar" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
