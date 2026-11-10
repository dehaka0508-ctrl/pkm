// Prize money: league prize by rank bands; cups and national tournaments pay places (우승/준우승/3위) and a
// broadcast fee for every game played.
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { LEAGUE_PRIZE } from "../src/game/finance";
import { pendingDecided, recordPlayerGame, type Simulator } from "../src/game/season";
import { seasonEvents } from "../src/game/calendar";
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

describe("prize money", () => {
  it("league prize by rank", () => {
    expect([1, 2, 3, 4, 7, 8, 15, 16, 20].map(LEAGUE_PRIZE)).toEqual([100000, 80000, 80000, 60000, 60000, 40000, 40000, 20000, 20000]);
  });

  it("cup: a broadcast fee each game and the places at the final", async () => {
    const t = allTrainers().find(x => x.role === "챔피언" && x.region === "kanto")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    const final = seasonEvents(st.season).find(e => e.kind === "cupFinal")!.day;
    const lines: string[] = [];
    let cupGames = 0;
    for (let i = 0; i < 2000 && st.day <= final; i++) {
      const r = await advance(st, fastSim);
      if (r.type === "match") {
        if (r.pending.tie?.kind === "cup") cupGames++;
        // the player wins every game
        while (st.pending && !pendingDecided(st)) recordPlayerGame(st, { winner: 0, remaining: [3, 0], turns: 5, picks: [[0, 1, 2, 3], [0, 1, 2, 3]], kos: [{}, {}] } as any);
        continue;
      }
      if (r.type === "day") lines.push(...r.summary);
    }
    expect(cupGames).toBeGreaterThan(0);
    const fees = lines.filter(l => l === "중계권료 ₽5,000").length;
    expect(fees).toBeGreaterThanOrEqual(cupGames);
    expect(lines).toContain("관동 컵 우승 상금 ₽70,000");
    expect(lines.some(l => /승리 수당|^상금 ₽/.test(l))).toBe(false);
  }, 300000);
});

describe("super cups", () => {
  it("the winner gets ₽30,000 and a 동색병뚜껑, the loser ₽10,000", async () => {
    const t = allTrainers().find(x => x.role === "챔피언" && x.region === "kanto")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    // season 2's August: last season's league winner (the player) meets the cup winner
    const sc = seasonEvents(2).find(e => e.kind === "superCup")!.day;
    st.season = 2;
    st.day = sc;
    st.prev = { season: 1, virtual: false, tables: { ...st.prev.tables, kanto: [{ id: t.id, rank: 1, pts: 90, diff: 0, gf: 0 }, ...st.prev.tables.kanto.filter(r => r.id !== t.id)] }, cupWinners: { kanto: st.prev.tables.kanto.find(r => r.id !== t.id)!.id } } as any;
    st.supers = null;
    st.dayStep = 0;
    const money = st.player.money;
    const lines: string[] = [];
    for (let i = 0; i < 20 && st.day <= sc; i++) {
      const r = await advance(st, fastSim);
      if (r.type === "match") {
        while (st.pending && !pendingDecided(st)) recordPlayerGame(st, { winner: 0, remaining: [3, 0], turns: 5, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as any);
        continue;
      }
      if (r.type === "day") lines.push(...r.summary);
    }
    expect(lines).toContain("관동 슈퍼컵 우승 상금 ₽30,000");
    expect(st.player.bag["cap:bronze"]).toBeGreaterThanOrEqual(1);
    expect(st.player.money).not.toBe(money);
  }, 120000);
});
