import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove, koNature } from "../src/data/dex";

it("hiker and ace trainer battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const a = get("등산가"), b = get("엘리트 트레이너");
  for (const t of [a, b]) {
    console.log(t.name, resolveTeam(t).map(m => `${koSpecies(m.species)}(${koNature(m.nature)}):${m.moves.map(koMove).join("/")}`).join("  "));
    expect(resolveTeam(t).every(m => !m.placeholder)).toBe(true);
  }
  let w = [0, 0];
  for (let i = 0; i < 6; i++) {
    const r = simulateMatch({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "ha" + i);
    if (r.winner >= 0) w[r.winner]++;
  }
  console.log("wins", w);
});
