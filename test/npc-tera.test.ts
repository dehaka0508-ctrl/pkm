import { describe, it, expect } from "vitest";
import { teraChoice } from "../src/game/npc";
import type { TeamMember } from "../src/game/types";

const mon = (species: string, ability: string, moves: string[]): TeamMember => ({
  uid: species, species, level: 50, ability, item: "", nature: "Serious", moves, gender: "",
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, teraType: null, shiny: false,
});
const tera = (m: TeamMember) => teraChoice(m)?.type;

describe("NPC Tera choice", () => {
  it("never builds around Explosion: Levitate Weezing goes Electric (no weaknesses left)", () => {
    expect(tera(mon("Weezing", "Levitate", ["thunderbolt", "sludgebomb", "toxic", "explosion"]))).toBe("Electric");
  });
  it("attackers boost their main attack", () => {
    expect(tera(mon("Mamoswine", "Thick Fat", ["earthquake", "superpower", "doubleedge", "toxic"]))).toBe("Ground");
    expect(tera(mon("Togekiss", "Serene Grace", ["dazzlinggleam", "airslash", "psychic", "hypervoice"]))).toBe("Fairy");
  });
  it("walls never pick up a new weakness", () => {
    expect(tera(mon("Lapras", "Water Absorb", ["raindance", "perishsong", "blizzard", "surf"]))).toBe("Water");
    expect(tera(mon("Politoed", "Drizzle", ["hydropump", "icebeam", "hypervoice", "toxic"]))).toBe("Water");
  });
});
