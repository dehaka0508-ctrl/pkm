import { it, expect } from "vitest";
import { BattleSession, forcedMove } from "../src/battle/engine";

const mon = (species: string, moves: string[]) => ({ species, level: 50, ability: "", item: "", nature: "Serious", moves, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: "" as const });

it("recharge turn after Giga Impact is detected as forced and 'move 1' is accepted", () => {
  const p1 = { name: "A", team: [0, 1, 2].map(() => mon("Snorlax", ["gigaimpact"])), gimmick: null, skill: 1, human: true, picks: [0, 1, 2] };
  const p2 = { name: "B", team: [0, 1, 2].map(() => mon("Blissey", ["tackle"])), gimmick: null, skill: 1 };
  const s = new BattleSession(p1 as any, p2 as any, "rc");
  s.start();
  let forced = 0;
  for (let i = 0; i < 40 && !s.battle.ended; i++) {
    if (s.humanPending() !== 0) {
      s.stepAI();
      continue;
    }
    const req = s.request(0);
    if (forcedMove(req)) {
      forced++;
      expect(req.active[0].moves[0].id).toBe("recharge");
    }
    expect(s.choose(0, "move 1")).toBe(true);
  }
  expect(forced).toBeGreaterThan(0);
});
