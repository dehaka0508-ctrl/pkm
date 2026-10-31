import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("karen lineup battles", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("카렌");
  const team = resolveTeam(t);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "));
  expect(team.map(m => m.species)).toEqual(["Umbreon", "Vileplume", "Honchkrow", "Gengar", "Houndoom", "Absol"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  for (let i = 0; i < 4; i++) {
    const foe = get(["일목", "목호", "그린", "초련"][i]);
    const r = simulateMatch({ name: t.name, team, gimmick: null, skill: roleSkill(t.role) }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "kr" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
