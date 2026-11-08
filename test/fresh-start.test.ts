// 새출발 (fresh start): every trainer's six from Lv.5 first stages, rookie fame and ground, growing week by week.
import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam, trainerById } from "../src/game/lineups";
import { npcGimmick, npcOf, npcTeam } from "../src/game/npc";
import { evoChain, freshTeam, growFresh, isFirstStage, nextEvolution, freshMon } from "../src/game/fresh";
import { freshGrowth } from "../src/game/ai/controller";
import { Rng } from "../src/game/rng";
import { dex } from "../src/data/dex";

const champ = allTrainers().find(t => t.role === "챔피언")!;
const other = allTrainers().find(t => t.id !== champ.id && t.role === "관장")!;

describe("fresh start", () => {
  it("NPCs start from Lv.5 first stages with a rookie's means", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    expect(st.fresh).toBe("seed1");
    for (const t of allTrainers()) {
      if (t.id === champ.id) continue;
      const n = npcOf(st, t.id);
      expect(n.lineup!.length).toBe(resolveTeam(t).length);
      expect(n.money).toBe(90000);
      expect(n.reputation).toBe(10);
      expect(n.seats).toBe(0);
      expect(Object.values(n.items).filter(Boolean)).toEqual([]);
      expect(n.tera).toBeNull();
      expect(npcGimmick(st, t.id)).toBeNull();
      n.lineup!.forEach((m, i) => {
        expect(m.level).toBe(5);
        expect(isFirstStage(m.species)).toBe(true);
        // it grows into the lineup's own Pokémon
        expect(evoChain(m.target!)).toContain(dex.species.get(m.species).name);
        expect(dex.species.get(m.target!).name).toBe(dex.species.get(resolveTeam(t)[i].species).name);
        expect(m.moves.length).toBeGreaterThan(0);
      });
    }
    // the same seed gives the same six (the start screen shows them before the game is made)
    expect(npcOf(st, other.id).lineup).toEqual(freshTeam(other, "seed1"));
    // and another start rolls new ones
    expect(freshTeam(other, "seed2").map(m => m.nature + m.ability + JSON.stringify(m.ivs))).not.toEqual(freshTeam(other, "seed1").map(m => m.nature + m.ability + JSON.stringify(m.ivs)));
  });

  it("taking over a trainer on a fresh start gives its Lv.5 six and a rookie's fame and ground", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    const p = st.player;
    expect(p.squad.map(m => m.species)).toEqual(freshTeam(trainerById(champ.id)!, "seed1").map(m => m.species));
    for (const m of p.squad) {
      expect(m.level).toBe(5);
      expect(m.item).toBe("");
      expect(m.teraType).toBeNull();
      expect((m as any).target).toBeUndefined();
    }
    expect(p.reputation).toBe(10);
    expect(p.facilities.seats).toBe(0);
    expect(p.gimmick).toBeNull();
    // without 새출발 the champion keeps its finished six and its fame
    const done = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    expect(done.fresh).toBeUndefined();
    expect(done.player.reputation).toBeGreaterThan(10);
    expect(npcOf(done, other.id).lineup).toBeUndefined();
  });

  it("growing: levels, evolutions toward the target, new moves", () => {
    const m = freshMon("Charizard", "x#0", new Rng("g"));
    expect(m.species).toBe("Charmander");
    expect(nextEvolution(m)).toEqual({ species: "Charmeleon", level: 16 });
    for (let w = 0; w < 30; w++) growFresh(m, 200, "s");
    expect(m.species).toBe("Charizard");
    expect(m.level).toBeGreaterThanOrEqual(36);
    // regional and item evolutions follow the lineup's line (Pichu → Pikachu → Alolan Raichu)
    const r = freshMon("Raichu-Alola", "x#1", new Rng("g"));
    expect(r.species).toBe("Pichu");
    for (let w = 0; w < 30; w++) growFresh(r, 200, "s");
    expect(r.species).toBe("Raichu-Alola");
    // a female-only evolution comes from a female
    expect(freshMon("Froslass", "x#2", new Rng("g")).gender).toBe("F");
  });

  it("NPC weeks grow their six", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    const before = npcTeam(st, other.id).map(m => m.level);
    for (let w = 0; w < 12; w++) freshGrowth(st, other.id);
    const n = npcOf(st, other.id);
    expect(n.lineup!.every(m => m.level > 5)).toBe(true);
    expect(npcTeam(st, other.id).map(m => m.level)).not.toEqual(before);
    // the save keeps the growing six
    const back = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcOf(back, other.id).lineup).toEqual(n.lineup);
  });

  it("rookie and custom starts in a fresh world", () => {
    const st = createGame({ mode: "custom", slotId: other.id, name: "나", fresh: "s", customTeam: [{ species: "Bulbasaur", level: 5, ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 }, nature: "Bold", ability: "Overgrow", moves: ["tackle"] }] });
    expect(st.fresh).toBe("s");
    expect(st.player.squad[0].level).toBe(5);
    expect(npcOf(st, champ.id).lineup!.every(m => m.level === 5)).toBe(true);
  });
});
