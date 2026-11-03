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
