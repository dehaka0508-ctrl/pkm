import { it, expect } from "vitest";
import { simulateMatch } from "../src/battle/engine";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";

it("doubles: AI vs AI, four of six (Champions rules), finishes", () => {
  const t = (n: string) => allTrainers().find(x => x.name === n)!;
  const side = (n: string) => ({ name: n, team: resolveTeam(t(n)), gimmick: t(n).gimmick, skill: roleSkill(t(n).role) });
  let decided = 0;
  for (let i = 0; i < 6; i++) {
    const r = simulateMatch(side("난천"), side("성호"), `d${i}`, { doubles: true });
    expect(r.remaining[0] + r.remaining[1]).toBeGreaterThan(0);
    expect(r.remaining[0]).toBeLessThanOrEqual(4);
    if (r.winner !== -1) decided++;
    console.log(i, r.winner, r.remaining, r.turns, JSON.stringify(r.kos));
  }
  expect(decided).toBeGreaterThan(3);
});

import { autoRegistration, registrationProblems } from "../src/game/cup";
it("cup registration follows Champions rules (no duplicate species or items)", () => {
  const mk = (species: string, item: string) => ({ species, item, level: 50, ability: "", nature: "", moves: ["tackle"], evs: {}, ivs: {}, gender: "", teraType: null, uid: species + item }) as any;
  const team = [mk("Pikachu", "Light Ball"), mk("Pikachu", "Leftovers"), mk("Snorlax", "Leftovers"), mk("Lapras", "Leftovers"), mk("Gengar", "Focus Sash"), mk("Dragonite", "")];
  const r = autoRegistration(team);
  expect(r.idx.length).toBe(5); // one Pikachu
  expect(registrationProblems(r.team, r.team.map((_, i) => i))).toEqual([]);
  expect(registrationProblems(team, [0, 1, 2, 3])).toContain("같은 포켓몬을 두 마리 등록할 수 없습니다.");
  expect(registrationProblems(team, [2, 3, 4, 5])).toContain("같은 도구를 지닌 포켓몬을 두 마리 등록할 수 없습니다.");
});

import { BattleSession } from "../src/battle/engine";
it("gimmick limit: one per singles battle, two different ones in doubles", () => {
  const mk = (species: string, item: string, moves: string[], tera: string | null = null) => ({ species, item, level: 50, ability: "", nature: "Adamant", moves, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: "", teraType: tera, uid: species }) as any;
  const team = [mk("Garchomp", "Garchompite", ["earthquake", "dragonclaw"]), mk("Snorlax", "Normalium Z", ["bodyslam", "earthquake"]), mk("Dragonite", "", ["extremespeed", "earthquake"], "Normal"), mk("Gengar", "", ["shadowball"]), mk("Lapras", "", ["surf"]), mk("Mew", "", ["psychic"])];
  const used = (doubles: boolean, seed: string) => {
    const s = new BattleSession({ name: "A", team, gimmick: null, skill: 1, picks: [0, 1, 2, 3] }, { name: "B", team, gimmick: null, skill: 1, picks: [0, 1, 2, 3] }, seed, { doubles });
    s.start();
    s.runToEnd();
    return s.gimmicksUsed;
  };
  for (let i = 0; i < 6; i++) {
    for (const side of used(false, `s${i}`)) expect(side.length).toBeLessThanOrEqual(1);
    for (const side of used(true, `d${i}`)) {
      expect(side.length).toBeLessThanOrEqual(2);
      expect(new Set(side).size).toBe(side.length);
    }
  }
  console.log("singles", JSON.stringify(used(false, "x")), "doubles", JSON.stringify(used(true, "y")));
});
