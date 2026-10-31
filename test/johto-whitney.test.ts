import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("whitney lineup battles (rollout, assist, baton pass)", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("꼭두");
  const team = resolveTeam(t);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "));
  expect(team[5].moves[0]).toBe("Rollout");
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 27)).toBe(true);
  const used = new Map<string, number>();
  for (let i = 0; i < 8; i++) {
    const foe = get(["호일", "비상", "카렌", "웅"][i % 4]);
    const s = new BattleSession({ name: t.name, team, gimmick: null, skill: roleSkill(t.role), picks: [5, i % 5, (i + 2) % 5] }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "wt" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
