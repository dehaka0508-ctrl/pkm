import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

it("jessie & james practical sets battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const a = get("로사&로이");
  const team = resolveTeam(a);
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  expect(team.map(m => m.nature)).toEqual(["Serious", "Serious", "Adamant", "Bold", "Adamant", "Jolly"]);
  const used = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const b = get(["비주기", "도희", "진우"][i % 3]);
    const s = new BattleSession({ name: a.name, team, gimmick: null, skill: roleSkill(a.role), picks: [2 + (i % 4), (3 + i) % 6, (4 + i) % 6].filter((v, k, arr) => arr.indexOf(v) === k) }, { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: roleSkill(b.role) }, "rk" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
