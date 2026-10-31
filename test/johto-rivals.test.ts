import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove } from "../src/data/dex";
it("silver/ethan/lyra battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const ns = ["실버", "심향", "금선"];
  const iv = { 실버: 28, 심향: 30, 금선: 30 } as Record<string, number>;
  for (const n of ns) {
    const team = resolveTeam(get(n));
    console.log(n, team.map(m => `${koSpecies(m.species)}:${m.moves.map(koMove).join("/")}`).join("  "));
    expect(team.every(m => !m.placeholder && m.ivs.hp === iv[n])).toBe(true);
  }
  expect(get("실버").sprite).toBe("silver");
  for (let i = 0; i < 3; i++) {
    const a = get(ns[i]), b = get(ns[(i + 1) % 3]);
    const r = simulateMatch({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "rv" + i);
    expect(r.turns).toBeGreaterThan(0);
  }
});
