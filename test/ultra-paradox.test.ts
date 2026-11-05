import { describe, it, expect } from "vitest";
import { dex, SCOUT_PARADOX, SCOUT_ULTRA_BEASTS } from "../src/data/dex";
import { basePools, rarePool, rollCandidate } from "../src/game/scouting";
import { isHomegrown } from "../src/game/registration";
import { foodCost } from "../src/game/finance";
import { Rng } from "../src/game/rng";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { createGame, migrate } from "../src/game/state";

describe("Ultra Beasts and Paradox Pokémon from scouting", () => {
  it("10 Ultra Beasts and 14 non-legendary Paradox Pokémon, all real species", () => {
    expect(SCOUT_ULTRA_BEASTS.length).toBe(10);
    expect(SCOUT_PARADOX.length).toBe(14);
    for (const n of [...SCOUT_ULTRA_BEASTS, ...SCOUT_PARADOX]) expect(dex.species.get(n).exists).toBe(true);
    expect(SCOUT_PARADOX.map(n => dex.species.get(n).id)).not.toContain("walkingwake");
  });
  it("only from scouting level 5, only in Alola / Paldea", () => {
    expect(rarePool("alola", 4)).toEqual([]);
    expect(rarePool("alola", 5).length).toBe(10);
    expect(rarePool("paldea", 5).length).toBe(14);
    expect(rarePool("kanto", 10)).toEqual([]);
    expect(rarePool("paldea", 5, "Fairy").length).toBeGreaterThan(0); // Flutter Mane, Scream Tail, Iron Valiant
    const count = (region: string, facility: number) => {
      const rng = new Rng(`rare:${region}:${facility}`);
      let n = 0;
      const rare = new Set([...rarePool(region, 10), "naganadel"]);
      for (let i = 0; i < 2000; i++) if (rare.has(dex.species.get(rollCandidate(rng, region, { facility, expires: 0 }).species).id)) n++;
      return n;
    };
    expect(count("alola", 4)).toBe(0);
    expect(count("paldea", 6)).toBeGreaterThan(0);
    // each rare species turns up about half as often as each ordinary one
    for (const region of ["alola", "paldea"]) {
      const rng = new Rng(`ratio:${region}`);
      const rare = new Set(rarePool(region, 10));
      const seen: Record<string, number> = {};
      for (let i = 0; i < 40000; i++) {
        const id = dex.species.get(rollCandidate(rng, region, { facility: 6, expires: 0 }).species).id;
        seen[id] = (seen[id] || 0) + 1;
      }
      const normal = basePools()[region];
      const perNormal = normal.reduce((a, id) => a + (seen[id] || 0), 0) / normal.length;
      const perRare = [...rare].reduce((a, id) => a + (seen[id] || 0), 0) / rare.size;
      expect(perRare / perNormal).toBeGreaterThan(0.4);
      expect(perRare / perNormal).toBeLessThan(0.6);
    }
  });
  it("never homegrown, and 50% more food than an ordinary Pokémon with the same stats", () => {
    expect(isHomegrown("Buzzwole", "alola")).toBe(false);
    expect(isHomegrown("Iron Hands", "paldea")).toBe(false);
    expect(isHomegrown("Great Tusk", "paldea")).toBe(false);
    expect(isHomegrown("Mimikyu", "alola")).toBe(true);
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    const plain = (sp: string) => Math.round(dex.species.get(sp).bst * 186 * (2000 / (600 * 186)));
    expect(foodCost({ species: "Great Tusk", ivs })).toBe(Math.round(plain("Great Tusk") * 1.5));
    expect(foodCost({ species: "Kartana", ivs })).toBe(Math.round(plain("Kartana") * 1.5));
    expect(foodCost({ species: "Garchomp", ivs })).toBe(plain("Garchomp"));
  });
  it("올림박사's and 투로박사's own six eat like ordinary Pokémon — as NPCs and as the player's start", () => {
    for (const name of ["올림박사", "투로박사"]) {
      const t = allTrainers().find(x => x.name === name)!;
      for (const m of resolveTeam(t)) {
        expect(m.foodNative).toBe(true);
        expect(foodCost(m)).toBe(Math.round(dex.species.get(m.species).bst * Object.values(m.ivs).reduce((a, b) => a + b, 0) * (2000 / (600 * 186))));
      }
      const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
      expect(st.player.squad.every(m => m.foodNative)).toBe(true);
      // an old save made before the rule gets it on load
      const old = JSON.parse(JSON.stringify(st));
      for (const m of old.player.squad) delete m.foodNative;
      expect(migrate(old).player.squad.every((m: any) => m.foodNative)).toBe(true);
    }
    // anyone else's Paradox Pokémon still pays the surcharge
    expect(resolveTeam(allTrainers().find(x => x.name === "그린")!).some(m => m.foodNative)).toBe(false);
  });
});
