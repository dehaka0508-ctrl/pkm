import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { createGame } from "../src/game/state";
import { npcTeam } from "../src/game/npc";
import { koItem, koSpecies } from "../src/data/dex";

it("신오 멜리사: user lineup", () => {
  const t = allTrainers().find(x => x.id === "sinnoh-멜리사")!;
  const team = resolveTeam(t);
  expect(team.map(m => m.species)).toEqual(["Banette", "Drifblim", "Dusknoir", "Mismagius", "Gengar", "Rotom"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
  expect(team[4].ability).toBe("Cursed Body");
  const g = createGame({ mode: "trainer", slotId: allTrainers().find(x => x.name === "그린")!.id, name: "나" });
  console.log(npcTeam(g, t.id).map(m => `${koSpecies(m.species)}@${m.item ? koItem(m.item) : "-"}`).join(", "));
});
