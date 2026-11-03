import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";

it("신오 동관·무청·멜리사: user lineups", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  expect(team("sinnoh-동관").map(m => m.species)).toEqual(["Skarmory", "Steelix", "Magnezone", "Bastiodon", "Aggron", "Forretress"]);
  expect(team("sinnoh-무청").map(m => m.species)).toEqual(["Weavile", "Mamoswine", "Abomasnow", "Froslass", "Glaceon", "Glalie"]);
  for (const id of ["sinnoh-동관", "sinnoh-무청", "sinnoh-멜리사"]) expect(team(id).every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
  expect(team("sinnoh-멜리사")[4].item).toBe("Sitrus Berry");
  expect(team("sinnoh-무청")[5].item).toBe("Rock Gem");
  expect(team("sinnoh-전진").map(m => m.species)).toEqual(["Jolteon", "Raichu", "Luxray", "Lanturn", "Electivire", "Electrode"]);
  expect(team("sinnoh-전진").every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});
