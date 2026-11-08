import { expect, it } from "vitest";
import { freshTeam } from "../src/game/fresh";
import { resolveTeam, trainerById } from "../src/game/lineups";
import { startingItems, startingTera } from "../src/game/npc";

it("uses Penny’s Team Star rematch aces and starts their first forms on 새출발", () => {
  const penny = trainerById("paldea-모란")!;
  const team = resolveTeam(penny);
  expect(team.map(m => m.species)).toEqual(["Kingambit", "Armarouge", "Revavroom", "Dachsbun", "Annihilape", "Sylveon"]);
  expect(team.slice(0, 5).map(m => m.ability)).toEqual(["Defiant", "Flash Fire", "Overcoat", "Well-Baked Body", "Vital Spirit"]);
  expect(team.slice(0, 5).every(m => m.nature === "Hardy" && m.item === "" && m.moves.length === 4)).toBe(true);
  expect(startingTera(penny)).toEqual({ key: "5", type: "Fairy" });
  const items = startingItems(penny);
  expect(Object.keys(items)).toHaveLength(1);
  expect(items["0"]).toBeTruthy();
  expect(freshTeam(penny, "test").map(m => m.species)).toEqual(["Pawniard", "Charcadet", "Varoom", "Fidough", "Mankey", "Eevee"]);
});
