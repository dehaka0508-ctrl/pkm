import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { pendingDecided, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { advanceWithRegistration as advance } from "./registered-advance";
import { Rng } from "../src/game/rng";
import { REGIONS } from "../src/data/dex";
import { leagueRecords, leagueRun, recordGame, recordsOf, topOf } from "../src/game/stats";
import { standings } from "../src/game/league";

/** Stand-in battles that still report KOs and damage, like the real engine. */
const statSim: Simulator = async jobs =>
  jobs.map(j => {
    const rng = new Rng(j.seed);
    const w = rng.chance(0.5) ? 0 : 1;
    const n = j.doubles ? 4 : 3;
    const rem: [number, number] = [0, 0];
    rem[w] = rng.int(1, n);
    const picks: [number[], number[]] = [[0, 1, 2, 3].slice(0, n), [0, 1, 2, 3].slice(0, n)];
    const side = (win: boolean) => Object.fromEntries(picks[0].map(i => [i, win ? rng.int(0, 2) : rng.int(0, 1)]));
    const dmg = () => Object.fromEntries(picks[0].map(i => [i, { dealt: rng.int(0, 300), taken: rng.int(0, 200) }]));
    return { winner: w, remaining: rem, turns: 10, picks, kos: [side(w === 0), side(w === 1)], dmg: [dmg(), dmg()] } as any;
  });

describe("records", () => {
  it("books every Pokémon of a game, and league runs", () => {
    const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "나" });
    const [a, b] = allTrainers().filter(t => t.region === "kanto" && t.id !== st.player.slotId);
    const ta = resolveTeam(a);
    const tb = resolveTeam(b);
    recordGame(st, "league:kanto", [a.id, b.id], [ta, tb], { winner: 0, remaining: [2, 0], turns: 9, picks: [[0, 1, 2], [3, 4, 5]], kos: [{ 0: 2, 1: 1 }, {}], dmg: [{ 0: { dealt: 300, taken: 40 } }, { 3: { dealt: 40, taken: 150 } }] });
    const lg = recordsOf(st).comps["league:kanto"];
    expect(Object.keys(lg).length).toBe(6);
    expect(lg[`${a.id}|${ta[0].uid}`]).toMatchObject({ a: 1, k: 2, d: 300, t: 40 });
    expect(lg[`${b.id}|${tb[3].uid}`]).toMatchObject({ a: 1, k: 0, d: 40, t: 150 });
    expect(topOf(lg, "k")[0].uid).toBe(ta[0].uid);
    expect(leagueRecords(st, "kanto").mons[`${a.id}|${ta[0].uid}`].k).toBe(2); // all time too
    // runs: W W L L L D W → best win run 2, best loss run 3
    for (const o of ["w", "w", "l", "l", "l", "d", "w"] as const) leagueRun(st, "kanto", a.id, o);
    expect(leagueRecords(st, "kanto").bestW[a.id].len).toBe(2);
    expect(leagueRecords(st, "kanto").bestL[a.id].len).toBe(3);
    expect(leagueRecords(st, "kanto").run[a.id]).toBe(1);
  });

  it("a whole season: every competition's table, league awards, titles and champion points", async () => {
    const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "나" });
    const start = st.season;
    for (let guard = 0; guard < 6000 && st.season === start; guard++) {
      const r = await advance(st, statSim, undefined, { toMyNext: true });
      if (r.type === "match" && st.pending && !pendingDecided(st)) {
        const [res] = await statSim([{ p1: sideFor(st, st.player.slotId, !!st.pending.doubles), p2: sideFor(st, st.pending.opponent, !!st.pending.doubles), seed: `p${st.day}:${st.pending.games.length}`, doubles: st.pending.doubles }]);
        recordPlayerGame(st, res, []);
      }
    }
    const rec = (st as any).records;
    // last season's tables were reset at the rollover; the awards and all-time records stay
    const awards = rec.awards.filter((a: any) => a.season === start);
    expect(awards.length).toBe(REGIONS.length * 3);
    for (const r of REGIONS) {
      const L = leagueRecords(st, r.id);
      expect(Object.values(L.titles).reduce((a: number, b: number) => a + b, 0)).toBe(1);
      expect(L.champPts.length).toBe(1);
      expect(Object.keys(L.mons).length).toBeGreaterThan(40);
      expect(Object.keys(L.bestW).length).toBeGreaterThan(5);
    }
    // the player's own Pokémon are in the all-time league records
    expect(Object.keys(leagueRecords(st, st.player.region).mons).some(k => k.startsWith(`${st.player.slotId}|`))).toBe(true);
    // the news has the awards
    expect(st.inbox.some(m => m.title.includes("리그 개인상"))).toBe(true);
    void standings;
  }, 600000);
});
