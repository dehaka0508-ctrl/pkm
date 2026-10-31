import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove } from "../src/data/dex";
it("psychic & swimmer battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const a = get("초능력자"), b = get("비키니 아가씨");
  for (const t of [a, b]) { console.log(t.name, resolveTeam(t).map(m => `${koSpecies(m.species)}:${m.moves.map(koMove).join("/")}`).join("  ")); expect(resolveTeam(t).every(m => !m.placeholder)).toBe(true); }
  const r = simulateMatch({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "ps");
  expect(r.turns).toBeGreaterThan(0);
});
