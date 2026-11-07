import { it, expect } from "vitest";
import { dex } from "../src/data/dex";
import { basePools } from "../src/game/scouting";
import { legendPools } from "../src/game/legend";
import { isRegistrationLegend } from "../src/game/registration";

const SIX = ["Walking Wake", "Iron Leaves", "Gouging Fire", "Raging Bolt", "Iron Boulder", "Iron Crown"];
it("legendary Paradox Pokémon are legends, not ordinary scouting finds", () => {
  const pool = new Set(Object.values(basePools()).flat());
  for (const n of SIX) {
    const id = dex.species.get(n).id;
    expect(pool.has(id)).toBe(false);
    expect(legendPools().legend.paldea).toContain(id);
    expect(isRegistrationLegend(n)).toBe(true);
  }
});
