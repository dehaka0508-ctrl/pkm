import { it, expect } from "vitest";
import { BattleSession } from "../src/battle/engine";

const mon = (species: string, item: string, moves: string[]) => ({ species, level: 50, ability: "", item, nature: "Adamant", moves, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: "" as const });

it("a mega stone allows mega evolution outside Kalos (player request + AI)", () => {
  const team = [mon("Steelix", "Steelixite", ["ironhead", "earthquake", "curse", "stealthrock"]), mon("Garchomp", "", ["earthquake"]), mon("Lucario", "", ["aurasphere"])];
  const foe = [mon("Blissey", "", ["seismictoss"]), mon("Blissey", "", ["seismictoss"]), mon("Blissey", "", ["seismictoss"])];
  // human side: the request offers mega evolution even though the region gimmick is none
  const s = new BattleSession({ name: "A", team, gimmick: null, skill: 1, human: true, picks: [0, 1, 2] } as any, { name: "B", team: foe, gimmick: null, skill: 1 } as any, "m1");
  s.start();
  expect(!!s.request(0).active[0].canMegaEvo).toBe(true);
  expect(s.choose(0, "move 1 mega")).toBe(true);
  s.stepAI();
  expect((s.battle.log as string[]).some(l => l.startsWith("|-mega|p1a"))).toBe(true);
  // AI side with a stone mega evolves on its own
  const a = new BattleSession({ name: "A", team, gimmick: null, skill: 1, picks: [0, 1, 2] } as any, { name: "B", team: foe, gimmick: null, skill: 1 } as any, "m2");
  a.start();
  a.runToEnd();
  expect((a.battle.log as string[]).some(l => l.startsWith("|-mega|"))).toBe(true);
});
