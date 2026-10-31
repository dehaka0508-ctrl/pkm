import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { koSpecies, koMove, koNature } from "../src/data/dex";

it("oak (gen1 moves) and joey battle", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const oak = get("오박사"), joey = get("반바지 꼬마 오성");
  for (const t of [oak, joey]) {
    console.log(t.name, t.role);
    console.log(resolveTeam(t).map(m => `  ${koSpecies(m.species)} ${koNature(m.nature)} | ${m.moves.map(koMove).join("/")}${m.autoMoves ? " (자동)" : ""}`).join("\n"));
    expect(resolveTeam(t).every(m => !m.placeholder)).toBe(true);
  }
  const used = new Map<string, number>();
  for (let i = 0; i < 8; i++) {
    const s = new BattleSession({ name: oak.name, team: resolveTeam(oak), gimmick: null, skill: roleSkill(oak.role), picks: [i % 4, (i + 1) % 4, 4 + (i % 2)] }, { name: joey.name, team: resolveTeam(joey), gimmick: null, skill: roleSkill(joey.role) }, "oj" + i);
    s.start();
    s.runToEnd();
    for (const l of s.battle.log as string[]) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
