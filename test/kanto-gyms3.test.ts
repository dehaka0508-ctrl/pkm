import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

it("sabrina (wobbuffet tricks) vs blaine", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const [a, b] = [get("초련"), get("강연")];
  const used = new Map<string, number>();
  const wins = [0, 0];
  for (let i = 0; i < 16; i++) {
    // always bring Wobbuffet (slot 4) so its moves get exercised
    const s = new BattleSession({ name: a.name, team: resolveTeam(a), gimmick: null, skill: roleSkill(a.role), picks: [4, i % 4, 5] }, { name: b.name, team: resolveTeam(b), gimmick: null, skill: roleSkill(b.role) }, "sb" + i);
    s.start();
    const r = s.runToEnd();
    if (r.winner >= 0) wins[r.winner]++;
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p\da: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log("wins", wins, [...used].map(([k, v]) => `${k}×${v}`).join(", "));
  for (const t of [a, b]) expect(resolveTeam(t).every(m => !m.placeholder && !m.autoMoves)).toBe(true);
});
