import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("bugsy lineup battles (shedinja wonder guard)", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("호일");
  const team = resolveTeam(t);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "));
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 27)).toBe(true);
  for (let i = 0; i < 6; i++) {
    const foe = get(["비상", "카렌", "독수", "웅", "이슬", "목호"][i]);
    const r = simulateMatch({ name: t.name, team, gimmick: null, skill: roleSkill(t.role), picks: [1, i % 6 === 1 ? 0 : i % 6, 5] }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "bg" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
