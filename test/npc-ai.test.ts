import { describe, it, expect } from "vitest";
import { dex } from "../src/data/dex";
import { createGame } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { conceptFit, profileOf } from "../src/game/ai/themes";
import { criticalTypes, pickEntry, starsOf, type Candidate } from "../src/game/ai/evaluator";
import { buildMoveset, evTarget, itemWishes } from "../src/game/ai/loadout";
import { aiWeek, planActions, reserveOf } from "../src/game/ai/controller";
import { npcMembers, npcOf, npcRoster, npcTeam } from "../src/game/npc";
import { NPC_ROSTER_MAX, type Role } from "../src/game/ai/models";
import { STATS } from "../src/game/types";

const byName = (name: string) => allTrainers().find(t => t.name === name)!;

describe("NPC AI: profiles", () => {
  it("specialists get their type and theme tags; theme Pokémon fit without the type", () => {
    const lance = profileOf(byName("목호"));
    expect(lance.archetype).toBe("specialist");
    expect(lance.primaryTypes).toEqual(["Dragon"]);
    expect(conceptFit(lance, "Gyarados")).toBe("theme");
    expect(conceptFit(lance, "Magikarp")).toBe("theme"); // whole families count
    expect(conceptFit(lance, "Garchomp")).toBe("type");
    expect(conceptFit(lance, "Blissey")).toBeNull();
    const maxie = profileOf(byName("마적"));
    expect(maxie.primaryTypes).toEqual(["Ground", "Fire"]);
    expect(conceptFit(maxie, "Crobat")).toBe("theme");
    const archie = profileOf(byName("아강"));
    expect(conceptFit(archie, "Sharpedo")).toBe("type");
    expect(conceptFit(archie, "Muk")).toBe("theme");
    // gym leaders take their lineup's type; plain trainers are standard
    expect(profileOf(byName("이슬")).primaryTypes).toEqual(["Water"]);
    expect(profileOf(allTrainers().find(t => t.role === "트레이너")!).archetype).toBe("standard");
  });
});

describe("NPC AI: evaluator", () => {
  it("stars, critical types and the wildcard limit", () => {
    expect(starsOf({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 })).toBe(5);
    expect(starsOf({ hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 })).toBe(3);
    const fire = ["Arcanine", "Ninetales", "Rapidash", "Flareon"].map(species => ({ species }));
    expect(criticalTypes(fire)).toContain("Water");
    // a Water specialist with five strong non-Water Pokémon still keeps to two wildcards
    const t = byName("이슬");
    const own = resolveTeam(t).map((mon, i): Candidate => ({ key: String(i), mon, signature: true, placeholder: false }));
    const strong = ["Garchomp", "Metagross", "Tyranitar", "Salamence", "Dragonite"].map((sp, i): Candidate => ({ key: `S${i}`, mon: { ...own[0].mon, species: sp, uid: sp }, signature: false, placeholder: false }));
    const p = profileOf(t);
    const keys = pickEntry(true, sp => !!conceptFit(p, sp), [...own, ...strong]);
    expect(keys.length).toBe(6);
    expect(keys.filter(k => k.startsWith("S")).length).toBeLessThanOrEqual(2);
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
        const ev = evTarget(role, sp);
        expect(STATS.reduce((a, k) => a + ev[k], 0)).toBeLessThanOrEqual(510);
        expect(STATS.every(k => ev[k] <= 252)).toBe(true);
        const status = moves.filter(m => dex.moves.get(m).category === "Status" && m !== "trick").length;
        if (status) for (const i of itemWishes({ species: sp, moves }, role)) expect(/^Choice |^Assault Vest$/.test(i)).toBe(false);
      }
    }
  });
});

describe("NPC AI: weekly controller", () => {
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
    // a rich specialist ends up investing: EVs, items and Tera on its six
    const lance = npcTeam(st, byName("목호").id);
    expect(lance.filter(m => m.item).length).toBeGreaterThanOrEqual(5);
    expect(lance.filter(m => STATS.some(k => m.evs[k] > 0)).length).toBeGreaterThanOrEqual(3);
    expect(lance.filter(m => m.teraType).length).toBeGreaterThanOrEqual(3);
    // what it plans next has a price and a reason the trainer window can show
    for (const a of planActions(st, byName("목호").id)) {
      expect(a.cost).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });
});
