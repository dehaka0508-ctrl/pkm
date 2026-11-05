import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { npcOf, slotMarks, startingItems } from "../src/game/npc";
import { toShowdownSet } from "../src/battle/engine";

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
    expect(cheren.slots).toEqual(slotMarks(allTrainers().find(t => t.name === "체렌")!));
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

  it("same Pokémon with edited moves or items resets that slot too", () => {
    const st = createGame({ mode: "trainer", slotId: id("그린"), name: "나" });
    const n = npcOf(st, id("레드"));
    n.items["3"] = "Life Orb";
    n.care = { "3": { evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } } };
    n.slots = [...n.slots!];
    n.slots[3] = n.slots[3].split("|")[0] + "|oldhash"; // same species, different data then
    const r = npcOf(migrate(JSON.parse(JSON.stringify(st))), id("레드"));
    expect(r.items["3"] || "").not.toBe("Life Orb");
    expect(r.care?.["3"]).toBeUndefined();
  });

  it("species-only marks from older saves: only trainers edited since (보미카, 게치스) reset", () => {
    const st = createGame({ mode: "trainer", slotId: id("그린"), name: "나" });
    for (const name of ["레드", "게치스"]) {
      const n = npcOf(st, id(name));
      n.items["1"] = "Choice Band";
      n.care = { "1": { evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 4 } } };
      n.slots = resolveTeam(allTrainers().find(t => t.name === name)!).map(m => m.species);
    }
    const s = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcOf(s, id("레드")).items["1"]).toBe("Choice Band");
    expect(npcOf(s, id("레드")).care?.["1"]).toBeDefined();
    expect(npcOf(s, id("게치스")).items["1"] || "").not.toBe("Choice Band");
    expect(npcOf(s, id("게치스")).care?.["1"]).toBeUndefined();
    // marks are upgraded, so the next load keeps everything
    const again = migrate(JSON.parse(JSON.stringify(s)));
    expect(npcOf(again, id("레드")).items["1"]).toBe("Choice Band");
  });

  it("게치스's Hydreigon: Frustration at full power (no friendship); others keep full friendship", () => {
    const t = allTrainers().find(x => x.name === "게치스")!;
    const team = resolveTeam(t);
    const hyd = team.findIndex(m => m.species === "Hydreigon");
    expect(team[hyd].moves).toContain("Frustration");
    expect(toShowdownSet(team[hyd], hyd).happiness).toBe(0);
    expect(toShowdownSet(team[0], 0).happiness).toBe(255);
  });
});
