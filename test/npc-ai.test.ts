import { describe, it, expect } from "vitest";
import { dex } from "../src/data/dex";
import { createGame } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { profileOf } from "../src/game/ai/themes";
import { criticalTypes, pickEntry, starsOf, type Candidate } from "../src/game/ai/evaluator";
import { buildMoveset, evTarget, itemWishes } from "../src/game/ai/loadout";
import { aiWeek, planActions, reserveOf } from "../src/game/ai/controller";
import { npcMembers, npcOf, npcRoster, npcTeam } from "../src/game/npc";
import { NPC_ROSTER_MAX, type Role } from "../src/game/ai/models";
import { STATS, zeroStats } from "../src/game/types";

const byName = (name: string) => allTrainers().find(t => t.name === name)!;

describe("NPC AI: profiles", () => {
  it("a profile is only a spending style, set by role", () => {
    const p = profileOf(byName("목호"));
    expect(Object.keys(p).sort()).toEqual(["id", "style"]);
    expect(["aggressive", "balanced", "frugal"]).toContain(p.style);
  });
});

describe("NPC AI: evaluator", () => {
  it("stars, critical types and the best six", () => {
    expect(starsOf({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 })).toBe(5);
    expect(starsOf({ hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 })).toBe(3);
    const fire = ["Arcanine", "Ninetales", "Rapidash", "Flareon"].map(species => ({ species }));
    expect(criticalTypes(fire)).toContain("Water");
    const t = byName("이슬");
    const own = resolveTeam(t).map((mon, i): Candidate => ({ key: String(i), mon, signature: true, placeholder: false }));
    const strong = ["Garchomp", "Metagross", "Tyranitar", "Salamence", "Dragonite"].map((sp, i): Candidate => ({ key: `S${i}`, mon: { ...own[0].mon, species: sp, uid: sp }, signature: false, placeholder: false }));
    const keys = pickEntry([...own, ...strong]);
    expect(keys.length).toBe(6);
  });
});

describe("NPC AI: loadout", () => {
  it("four moves for every role, EVs within limits, choice items only on all-attack sets", () => {
    const roles: Role[] = ["physSweeper", "specSweeper", "physWall", "specWall", "lead", "pivot"];
    for (const sp of ["Garchomp", "Rotom-Wash", "Blissey", "Skarmory", "Gengar", "Kyurem-Black", "Weezing"]) {
      for (const role of roles) {
        const moves = buildMoveset(sp, role, sp + role);
        expect(new Set(moves).size).toBe(moves.length);
        expect(moves.length).toBe(4);
        const ev = evTarget({ species: sp, moves, item: "", nature: "Serious" });
        expect(STATS.reduce((a, k) => a + ev[k], 0)).toBeLessThanOrEqual(510);
        expect(STATS.every(k => ev[k] <= 252)).toBe(true);
        const status = moves.filter(m => dex.moves.get(m).category === "Status" && m !== "trick").length;
        if (status) for (const i of itemWishes({ species: sp, moves }, role)) expect(/^Choice |^Assault Vest$/.test(i)).toBe(false);
      }
    }
  });

  it("allocates by damage category, speed, bulk, and Defense-based damage", () => {
    const target = (species: string, moves: string[], nature = "Serious", item = "") =>
      evTarget({ species, moves, nature, item });
    expect(target("Garchomp", ["Earthquake", "Dragon Claw", "Swords Dance"])).toMatchObject({ atk: 252, spe: 252, hp: 6 });
    expect(target("Gengar", ["Shadow Ball", "Sludge Bomb", "Focus Blast"])).toMatchObject({ spa: 252, spe: 252, hp: 6 });
    expect(target("Conkeldurr", ["Drain Punch", "Mach Punch", "Knock Off"])).toMatchObject({ atk: 252, hp: 252, def: 6 });
    expect(target("Hatterene", ["Trick Room", "Psychic", "Dazzling Gleam", "Mystical Fire"])).toMatchObject({ spa: 252, hp: 252, spe: 0 });
    expect(target("Skarmory", ["Body Press", "Iron Defense", "Roost", "Spikes"])).toMatchObject({ def: 252, hp: 252, spd: 6 });
    expect(target("Tentacruel", ["Scald", "Protect", "Toxic Spikes", "Haze"], "Calm")).toMatchObject({ spd: 252 });
    expect(target("Infernape", ["Close Combat", "Fire Blast", "U-turn"])).toMatchObject({ spe: 252, atk: 132, spa: 126 });
  });
});

describe("NPC AI: weekly controller", () => {
  it("trains the whole roster gradually, preserves authored sets, and finishes at the cap", () => {
    const st = createGame({ mode: "trainer", slotId: byName("그린").id, name: "나" });
    const id = byName("목호").id;
    const n = npcOf(st, id);
    const [first, second, ...rest] = resolveTeam(byName("목호"));
    const preset = { ...zeroStats(), hp: 252, def: 252, spd: 4 };
    n.money = 0;
    n.lineup = [
      { ...first, species: "Gengar", nature: "Timid", moves: ["Shadow Ball", "Sludge Bomb", "Focus Blast"], evs: zeroStats() },
      { ...second, evs: preset },
      ...rest,
    ];
    aiWeek(st, id);
    const [rookie, authored] = npcRoster(st, id).map(c => c.mon);
    expect(rookie.evs.spa).toBe(16);
    expect(authored.evs).toEqual(preset);
    for (let i = 1; i < 35; i++) aiWeek(st, id);
    expect(npcRoster(st, id)[0].mon.evs).toEqual({ ...zeroStats(), hp: 6, spa: 252, spe: 252 });
    expect(npcRoster(st, id)[1].mon.evs).toEqual(preset);
  });

  it("spends only above its reserve, keeps the roster within 10 and a valid six", () => {
    const st = createGame({ mode: "trainer", slotId: byName("그린").id, name: "나" });
    const ids = ["목호", "마적", "아강", "도희", "마마네"].map(n => byName(n).id);
    for (const id of ids) npcOf(st, id).money = 400000;
    for (let w = 0; w < 30; w++) {
      st.day += 7;
      for (const id of ids) {
        const n = npcOf(st, id);
        const before = n.money;
        const reserve = reserveOf(st, id);
        aiWeek(st, id);
        // whatever it bought, it did not dig into its reserve (scout fees allow half of it)
        if (n.money < before) expect(n.money).toBeGreaterThanOrEqual(Math.min(before, reserve / 2) - 1);
        expect(npcRoster(st, id).length).toBeLessThanOrEqual(NPC_ROSTER_MAX);
        const team = npcTeam(st, id);
        expect(team.length).toBe(6);
        expect(new Set(npcMembers(st, id).map(m => m.key)).size).toBe(6);
        for (const m of npcRoster(st, id)) expect(STATS.reduce((a, k) => a + m.mon.evs[k], 0)).toBeLessThanOrEqual(510);
      }
    }
    // The training budget is separate from item shopping.
    const lance = npcTeam(st, byName("목호").id);
    const original = resolveTeam(byName("목호"));
    expect(lance.some(m => STATS.reduce((sum, k) => sum + m.evs[k], 0) >
      STATS.reduce((sum, k) => sum + original.find(o => o.uid === m.uid)!.evs[k], 0))).toBe(true);
    expect(npcOf(st, byName("목호").id).log.some(l => l.text.includes("노력치"))).toBe(false);
    expect(lance.filter(m => m.item).length).toBeGreaterThanOrEqual(5);
    expect(lance.filter(m => m.teraType).length).toBeGreaterThanOrEqual(3);
    for (const id of Object.keys(st.npcs!)) {
      const n = npcOf(st, id);
      expect(n.roster || []).toEqual([]);
      expect(n.legends).toEqual([]);
    }
    for (const a of planActions(st, byName("목호").id)) expect(["item", "budgetItem", "gimmick", "tera"]).toContain(a.kind);
    // what it plans next has a price and a reason the trainer window can show
    for (const a of planActions(st, byName("목호").id)) {
      expect(a.cost).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });
});
