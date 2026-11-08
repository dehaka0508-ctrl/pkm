// Season 1 has no previous tables: the national tournament's entrants come from the strength ranking as it
// stands when they are decided (the August playoff / group draw), not from the game's first day.
import { describe, it, expect } from "vitest";
import { createGame, teamOf, virtualPrev } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { entersCompetition, type Simulator } from "../src/game/season";
import { advanceWithRegistration as advance } from "./registered-advance";
import { Rng } from "../src/game/rng";

const fastSim: Simulator = async jobs =>
  jobs.map(j => {
    const rng = new Rng(j.seed);
    const w = rng.chance(0.5) ? 0 : 1;
    const rem: [number, number] = [0, 0];
    rem[w] = rng.int(1, j.doubles ? 4 : 3);
    return { winner: w, remaining: rem, turns: 10, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as any;
  });

describe("season 1 national tournament entry", () => {
  it("follows the ranking just before the entrants are decided", async () => {
    const t = allTrainers().filter(x => x.region === "kanto").find(x => x.role === "트레이너")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    const me = st.player.slotId;
    expect(virtualPrev(st).tables.kanto.findIndex(r => r.id === me)).toBeGreaterThan(2);
    expect(entersCompetition(st, "pwt")).toBe(false);
    // a strong preseason: the six become the strongest in the region
    for (const m of st.player.squad) (m.species = "Mewtwo"), (m.level = 100);
    expect(teamOf(st, me).length).toBeGreaterThan(0);
    expect(entersCompetition(st, "pwt")).toBe(true);
    for (let i = 0; i < 80 && !st.qual; i++) await advance(st, fastSim);
    expect(st.qual?.direct).toContain(me);
    expect(st.prev.tables.kanto[0].id).toBe(me);
  }, 120000);
});
