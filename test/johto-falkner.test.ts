import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { koSpecies, koMove, koNature } from "../src/data/dex";

it("falkner lineup battles; typed hidden power works", () => {
  const get = (n: string) => allTrainers().find(x => x.name === n)!;
  const t = get("비상");
  const team = resolveTeam(t);
  console.log(team.map(m => `${koSpecies(m.species)}(${koNature(m.nature)})`).join(" "), "|", koMove(team[0].moves[3]));
  expect(koMove(team[0].moves[3])).toBe("잠재파워");
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.ivs.hp === 25)).toBe(true);
  const used = new Map<string, number>();
  let hpFighting = 0;
  for (let i = 0; i < 10; i++) {
    const foe = get(["카렌", "그린", "목호", "웅", "독수"][i % 5]);
    const s = new BattleSession({ name: t.name, team, gimmick: null, skill: roleSkill(t.role), picks: [0, (i % 5) + 1, ((i + 2) % 5) + 1].filter((v, k, a) => a.indexOf(v) === k) }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: roleSkill(foe.role) }, "fk" + i);
    s.start();
    s.runToEnd();
    const log = s.battle.log as string[];
    for (const l of log) { const m = l.match(/^\|move\|p1a: m\d\|([^|]+)/); if (m) used.set(m[1], (used.get(m[1]) || 0) + 1); }
    if (log.some(l => /\|move\|p1a: m0\|Hidden Power\|/.test(l))) hpFighting++;
    const pel = s.battle.sides[0].pokemon.find((p: any) => p.species.name === "Pelipper");
    if (pel) expect(pel.hpType).toBe("Fighting");
  }
  console.log([...used].map(([k, v]) => `${k}×${v}`).join(", "));
});
