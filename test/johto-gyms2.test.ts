import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("chuck/jasmine/pryce/clair lineups battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const names = ["사도", "규리", "류옹", "이향"];
  for (const n of names) {
    const team = resolveTeam(get(n));
    console.log(n, team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "));
    expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 25)).toBe(true);
  }
  for (let i = 0; i < 8; i++) {
    const a = get(names[i % 4]), b = get(names[(i + 1) % 4]);
    const r = simulateMatch({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "g2" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
