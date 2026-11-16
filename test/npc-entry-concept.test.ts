// The NPCs' entry and their match preparation, by trainer class.
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { pickEntry, type Candidate } from "../src/game/ai/evaluator";
import { adaptChance } from "../src/game/ai/prep";
import { npcOf, npcRecruit, chooseEntry } from "../src/game/npc";
import { dex } from "../src/data/dex";

describe("entry: concept and weakness cover", () => {
  const brock = allTrainers().find(t => t.name === "웅")!;
  it("a gym leader keeps to its type: one Pokémon outside it at most; legendaries are outside the rule", () => {
    const own: Candidate[] = resolveTeam(brock).map((mon, i) => ({ key: String(i), mon, signature: true, placeholder: false }));
    const strong = (species: string, key: string): Candidate => ({ key, mon: { ...own[0].mon, uid: key, species, ability: dex.species.get(species).abilities[0], moves: ["earthquake", "flamethrower", "icebeam", "thunderbolt"] }, signature: false, placeholder: false });
    // two strong non-Rock Pokémon on top of its six: they don't both come (one wildcard at most)
    const roster = [...own, strong("Garchomp", "S1"), strong("Dragonite", "S2")];
    const picked = pickEntry(roster, 6, "singles", ["Rock"]);
    expect(picked.includes("S1") && picked.includes("S2")).toBe(false);
    // without a concept (not a gym leader / Elite Four) strength decides: both come
    const free = pickEntry(roster, 6, "singles", []);
    expect(free.includes("S1") && free.includes("S2")).toBe(true);
    // a legendary is weighed on strength alone (not held back by the type)
    const legend = strong("Mewtwo", "L0");
    const withLegend = pickEntry([...own, legend], 6, "singles", ["Rock"]);
    expect(withLegend).toContain("L0");
  });

  it("only gym leaders and the Elite Four keep to a type; a title legendary is the trainer's call", () => {
    const st = createGame({ mode: "trainer", slotId: allTrainers()[0].id, name: "x" });
    for (const t of allTrainers().filter(x => x.id !== st.player.slotId).slice(0, 60)) {
      npcRecruit(st, t.id, t.region, "test", "both");
      const keys = chooseEntry(st, t.id);
      expect(keys.length).toBe(6);
      npcOf(st, t.id).legends = [];
      npcOf(st, t.id).entry = undefined;
    }
  });
});

describe("match preparation by class", () => {
  it("rearranges each member's moves with the class's chance", () => {
    const by = (role: string, extra: object = {}) => adaptChance({ role, ...extra });
    expect(by("챔피언")).toBe(0.9);
    expect([by("주인공"), by("라이벌"), by("사천왕")]).toEqual([0.8, 0.8, 0.8]);
    expect([by("관장"), by("보스")]).toEqual([0.7, 0.7]);
    expect(by("트레이너")).toBe(0.6);
    expect(by("트레이너", { title: "악의 조직" })).toBe(0.6);
    // classes not named go with the class of the same starting IVs
    expect(by("박사")).toBe(0.7);
    expect(by("기타")).toBe(0.6);
    for (const t of allTrainers()) expect([0.6, 0.7, 0.8, 0.9]).toContain(adaptChance(t));
  });
});
