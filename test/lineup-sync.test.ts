import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { npcOf, startingItems } from "../src/game/npc";

const id = (name: string) => allTrainers().find(t => t.name === name)!.id;

describe("NPC progress follows lineup edits", () => {
  it("a save from before slot tracking resets the five edited Unova lineups once; others keep their progress", () => {
    const st = createGame({ mode: "trainer", slotId: id("그린"), name: "나" });
    for (const name of ["체렌", "레드"]) {
      const n = npcOf(st, id(name));
      n.items["0"] = "Choice Band";
      n.care = { "0": { evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 4 }, tera: "Fire" } };
      delete n.slots;
    }
    const s = migrate(JSON.parse(JSON.stringify(st)));
    const cheren = npcOf(s, id("체렌"));
    expect(cheren.items["0"] || "").toBe(startingItems(allTrainers().find(t => t.name === "체렌")!)["0"] || "");
    expect(cheren.care?.["0"]).toBeUndefined();
    expect(cheren.slots).toEqual(resolveTeam(allTrainers().find(t => t.name === "체렌")!).map(m => m.species));
    const red = npcOf(s, id("레드"));
    expect(red.items["0"]).toBe("Choice Band");
    expect(red.care?.["0"]?.tera).toBe("Fire");
    // loading again changes nothing
    const again = migrate(JSON.parse(JSON.stringify(s)));
    expect(npcOf(again, id("레드")).items["0"]).toBe("Choice Band");
  });

  it("a later edit resets only the slot whose Pokémon changed", () => {
    const st = createGame({ mode: "trainer", slotId: id("그린"), name: "나" });
    const n = npcOf(st, id("레드"));
    n.items["1"] = "Leftovers";
    n.items["2"] = "Life Orb";
    n.slots = [...n.slots!];
    n.slots[2] = "Pikachu-Original"; // as if slot 2 held something else when the Life Orb was bought
    const s = migrate(JSON.parse(JSON.stringify(st)));
    const r = npcOf(s, id("레드"));
    expect(r.items["1"]).toBe("Leftovers");
    expect(r.items["2"] || "").not.toBe("Life Orb");
  });
});
