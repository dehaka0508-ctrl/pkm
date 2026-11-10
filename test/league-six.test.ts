import { expect, it } from "vitest";
import { BattleSession, type SideConfig } from "../src/battle/engine";

it("shows eight league candidates and fields the selected six against all four opposing Pokémon", () => {
  const side = (name: string, count: number): SideConfig => ({
    name, skill: 0.8, gimmick: null, rules: "league",
    team: Array.from({ length: count }, (_, i) => ({
      uid: `${name}-${i}`, species: "Pikachu", moves: ["Thunderbolt"], level: 50,
    })) as SideConfig["team"],
  });
  const home = { ...side("Home", 8), picks: [7, 6, 2, 3, 4, 5] };
  const session = new BattleSession(home, side("Away", 4), 42);
  expect(session.battle.sides.map((s: { pokemon: unknown[] }) => s.pokemon.length)).toEqual([8, 4]);
  session.start();
  expect(session.picks[0]).toEqual([7, 6, 2, 3, 4, 5]);
  expect([...session.picks[1]].sort()).toEqual([0, 1, 2, 3]);
  for (const [i, picks] of session.picks.entries()) {
    expect(session.battle.sides[i].pokemon.map((p: { set: { name: string } }) => p.set.name))
      .toEqual(picks.map(index => `m${index}`));
  }
});
