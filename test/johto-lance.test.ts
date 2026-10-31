import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("lance lineup battles; oak uses custom sprite", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const lance = get("목호");
  const team = resolveTeam(lance);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)}) iv${m.ivs.hp}`).join(" "));
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 31)).toBe(true);
  expect(get("오박사").sprite).toBe("oak");
  for (let i = 0; i < 4; i++) {
    const foe = get(["그린", "레드", "칸나", "오박사"][i]);
    const r = simulateMatch({ name: lance.name, team, gimmick: lance.gimmick, skill: roleSkill(lance.role) }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "lc" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
