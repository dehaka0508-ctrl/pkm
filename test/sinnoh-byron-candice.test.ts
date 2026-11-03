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

it("신오 빛나·용식: user lineups (빛나: 6V, natures, EVs)", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  const dawn = team("sinnoh-빛나");
  expect(dawn.map(m => m.species)).toEqual(["Wormadam-Trash", "Magmortar", "Froslass", "Milotic", "Clefable", "Torterra"]);
  expect(dawn.every(m => Object.values(m.ivs).every(v => v === 31))).toBe(true);
  expect(dawn[5].evs).toEqual({ hp: 128, atk: 252, def: 128, spa: 0, spd: 0, spe: 0 });
  expect(dawn[1].nature).toBe("Modest");
  expect(team("sinnoh-용식").map(m => m.species)).toEqual(["Staraptor", "Heracross", "Snorlax", "Rapidash", "Roserade", "Empoleon"]);
  for (const id of ["sinnoh-빛나", "sinnoh-용식"]) expect(team(id).every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});
