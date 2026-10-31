import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

it("brock vs misty with user lineups", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const [a, b] = [get("웅"), get("이슬")];
  const used = new Set<string>();
  let wins = [0, 0];
  for (let i = 0; i < 10; i++) {
    const s = new BattleSession({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "bm" + i);
    s.start();
    const r = s.runToEnd();
    if (r.winner >= 0) wins[r.winner]++;
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p\da: m\d\|([^|]+)/); if (m) used.add(m[1]); }
  }
  console.log("wins", wins, [...used].join(", "));
  expect(resolveTeam(a).every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  expect(resolveTeam(b).every(m => !m.placeholder && !m.autoMoves)).toBe(true);
});
