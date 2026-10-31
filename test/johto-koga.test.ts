import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { koSpecies, koNature } from "../src/data/dex";

it("koga lineup battles (spider web, toxic spikes, minimize)", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("독수");
  const team = resolveTeam(t);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "));
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 29)).toBe(true);
  const used = new Map<string, number>();
  for (let i = 0; i < 8; i++) {
    const foe = get(["카렌", "일목", "목호", "그린"][i % 4]);
    const s = new BattleSession({ name: t.name, team, gimmick: null, skill: roleSkill(t.role), picks: [i % 6, (i + 2) % 6, (i + 4) % 6] }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "kg" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
