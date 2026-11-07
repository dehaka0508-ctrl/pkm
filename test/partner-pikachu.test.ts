// 레드's Pikachu: a Pikachu by every visible measure, with the partner Pikachu's base stats in battle
// (45/80/50/75/60/120) and no evolution.
import { describe, expect, it } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam, trainerById } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { calcStats } from "../src/battle/calc";
import { sideFor } from "../src/game/season";
import { koSpecies } from "../src/data/dex";
import { evolutionOptions } from "../src/game/moves";

const PARTNER = { hp: 45, atk: 80, def: 50, spa: 75, spd: 60, spe: 120 };
const red = () => trainerById("kanto-레드")!;

describe("레드's partner Pikachu", () => {
  it("is a plain Pikachu by name and species, with its own base stats and no evolution", () => {
    const pika = resolveTeam(red()).find(m => m.species === "Pikachu")!;
    expect(koSpecies(pika.species)).toBe("피카츄");
    expect(pika.baseStats).toEqual(PARTNER);
    expect(pika.noEvolve).toBe(true);
    const plain = { ...pika, baseStats: undefined };
    expect(calcStats(pika).spe).toBeGreaterThan(calcStats(plain).spe);
    expect(calcStats(pika).hp).toBeGreaterThan(calcStats(plain).hp);
    // other Pikachu stay ordinary
    for (const t of allTrainers()) if (t.id !== "kanto-레드") for (const m of resolveTeam(t)) if (m.species === "Pikachu") expect(m.baseStats).toBeUndefined();
  });

  it("battles with those stats (same name and details as any Pikachu)", () => {
    const st = createGame({ mode: "trainer", slotId: "kanto-레드", name: "레드" });
    const me = sideFor(st, st.player.slotId);
    const slot = me.team.findIndex(m => m.species === "Pikachu");
    expect(slot).toBeGreaterThanOrEqual(0);
    const opp = sideFor(st, st.leagues.kanto.teams.find(id => id !== st.player.slotId)!);
    const s = new BattleSession({ ...me, human: false, picks: [slot, (slot + 1) % me.team.length, (slot + 2) % me.team.length] }, { ...opp, human: false }, "partner");
    const pk = s.battle.sides[0].pokemon.find((p: any) => p.set.name === `m${slot}`);
    const want = calcStats(me.team[slot]);
    expect(pk.maxhp).toBe(want.hp);
    expect(pk.storedStats).toEqual({ atk: want.atk, def: want.def, spa: want.spa, spd: want.spd, spe: want.spe });
    expect(pk.species.name).toBe("Pikachu");
    expect(pk.details.startsWith("Pikachu")).toBe(true);
    s.start();
    const r = s.runToEnd();
    expect([0, 1, -1]).toContain(r.winner);
  });

  it("a trainer start as 레드 gets it; an older save's Pikachu is given the traits", () => {
    const st = createGame({ mode: "trainer", slotId: "kanto-레드", name: "레드" });
    const pika = st.player.squad.find(m => m.species === "Pikachu")!;
    expect(pika.baseStats).toEqual(PARTNER);
    expect(pika.noEvolve).toBe(true);
    expect(evolutionOptions(pika.species, 100).length).toBeGreaterThan(0); // a Pikachu could evolve…
    delete pika.baseStats;
    delete pika.noEvolve;
    const old = migrate(JSON.parse(JSON.stringify(st)));
    const again = old.player.squad.find(m => m.species === "Pikachu")!;
    expect(again.baseStats).toEqual(PARTNER);
    expect(again.noEvolve).toBe(true);
  });
});
