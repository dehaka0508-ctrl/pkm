import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

it("blue lineup (no Rhyperior) battles, IV 31", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const a = get("그린");
  const team = resolveTeam(a);
  expect(team.map(m => m.species)).toEqual(["Exeggutor", "Machamp", "Arcanine", "Tyranitar", "Pidgeot", "Gyarados"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.spe === 31)).toBe(true);
  const used = new Map<string, number>();
  for (let i = 0; i < 9; i++) {
    const b = get(["칸나", "시바", "레드"][i % 3]);
    const s = new BattleSession({ name: a.name, team, gimmick: a.gimmick, skill: roleSkill(a.role), picks: [i % 6, (i + 2) % 6, (i + 4) % 6] }, { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: roleSkill(b.role) }, "bl" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
