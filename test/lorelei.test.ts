import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

it("lorelei lineup resolves and battles with her moves", () => {
  const t = allTrainers().find(x => x.name === "칸나")!;
  const team = resolveTeam(t);
  expect(team.map(m => m.species)).toEqual(["Dewgong", "Cloyster", "Mamoswine", "Jynx", "Lapras", "Slowbro"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  expect(team[3].gender).toBe("F");
  const foe = allTrainers().find(x => x.name === "그린")!;
  const used = new Set<string>();
  for (let i = 0; i < 6; i++) {
    const s = new BattleSession({ name: "칸나", team, gimmick: null, skill: 0.85, picks: [i % 6, (i + 1) % 6, (i + 2) % 6] }, { name: "그린", team: resolveTeam(foe), gimmick: null, skill: 0.85 }, "l" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.add(m[1]); }
  }
  console.log([...used].join(", "));
  expect(used.size).toBeGreaterThan(3);
});
