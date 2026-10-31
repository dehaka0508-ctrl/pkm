import { it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";

const get = (n: string) => allTrainers().find(x => x.name === n)!;

it("trace: no mega, 3-move sets kept", () => {
  const t = get("진우");
  const team = resolveTeam(t);
  console.log(team.map(m => `${m.species} @${m.item} ${m.moves.join("/")} auto=${!!m.autoMoves}`).join("\n"));
  expect(team[0].species).toBe("Pidgeot");
  expect(team[0].item).toBe("");
  expect(team[0].moves.length).toBe(3);
  expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
  expect(t.gimmick).toBe(null);
  let megas = 0;
  for (let i = 0; i < 4; i++) {
    const s = new BattleSession({ name: t.name, team, gimmick: t.gimmick, skill: roleSkill(t.role), picks: [0, 1, 2] }, { name: "x", team: resolveTeam(get("도희")), gimmick: null, skill: 0.7 }, "tr" + i);
    s.start();
    s.runToEnd();
    if ((s.battle.log as string[]).some(l => l.startsWith("|-mega|p1a"))) megas++;
  }
  expect(megas).toBe(0);
});

it("giovanni and janine battle", () => {
  for (const [x, y] of [["비주기", "도희"], ["도희", "진우"]]) {
    const a = get(x), b = get(y);
    for (const t of [a, b]) expect(resolveTeam(t).every(m => !m.placeholder && !m.autoMoves)).toBe(true);
    const s = new BattleSession({ name: a.name, team: resolveTeam(a), gimmick: a.gimmick, skill: roleSkill(a.role) }, { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: roleSkill(b.role) }, x + y);
    s.start();
    const r = s.runToEnd();
    expect(r.turns).toBeGreaterThan(0);
  }
});
