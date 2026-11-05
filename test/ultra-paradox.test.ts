import { describe, it, expect } from "vitest";
import { dex, SCOUT_PARADOX, SCOUT_ULTRA_BEASTS } from "../src/data/dex";
import { rarePool, rollCandidate } from "../src/game/scouting";
import { isHomegrown } from "../src/game/registration";
import { foodCost } from "../src/game/finance";
import { Rng } from "../src/game/rng";

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
    const a = count("alola", 6);
    expect(a).toBeGreaterThan(100); // about 1 in 10 candidates
    expect(a).toBeLessThan(300);
    expect(count("paldea", 6)).toBeGreaterThan(100);
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
});
