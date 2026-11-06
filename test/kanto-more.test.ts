import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

const get = (n: string) => allTrainers().find(x => x.name === n)!;

it("leaf: the six from the user's list, all filled in", () => {
  const team = resolveTeam(get("리프"));
  expect(team.map(m => m.species)).toEqual(["Blastoise", "Rapidash", "Vileplume", "Marowak", "Raichu", "Dragonite"]);
  expect(team.every(m => !m.placeholder && m.moves.length === 4)).toBe(true);
});

it("giovanni and janine battle", () => {
  for (const [x, y] of [["비주기", "도희"], ["도희", "리프"]]) {
    const a = get(x), b = get(y);
    for (const t of [a, b]) expect(resolveTeam(t).every(m => !m.placeholder && (t.name === "리프" || !m.autoMoves))).toBe(true);
    const s = new BattleSession({ name: a.name, team: resolveTeam(a), gimmick: a.gimmick, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: roleSkill(b.role) }, x + y);
    s.start();
    const r = s.runToEnd();
    expect(r.turns).toBeGreaterThan(0);
  }
});
