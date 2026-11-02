import { weekdayOf } from "../src/game/calendar";
import { describe, it, expect } from "vitest";
import { createGame, displayName, entryTeam } from "../src/game/state";
import { advance, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { simulateMatch, BattleSession } from "../src/battle/engine";
import { standings } from "../src/game/league";
import { allTrainers } from "../src/game/lineups";
import { scoutStartOptions, startMission, signCandidate } from "../src/game/scouting";
import { koSpecies } from "../src/data/dex";

const sim: Simulator = async jobs => {
  // A full season can exceed the worker RPC timeout; let queued messages run between batches.
  await new Promise<void>(resolve => setImmediate(resolve));
  return jobs.map(j => simulateMatch(j.p1, j.p2, j.seed));
};

async function playSeason(state: any) {
  let matches = 0;
  for (let i = 0; i < 2000 && state.season === 1; i++) {
    const r = await advance(state, sim);
    if (r.type === "match") {
      const opp = sideFor(state, r.pending.opponent);
      const s = new BattleSession({ ...sideFor(state, state.player.slotId), human: false }, opp, "t" + i);
      s.start();
      const res = s.runToEnd();
      recordPlayerGame(state, res);
      matches++;
    }
  }
  return matches;
}

describe("season", () => {
  it("plays a full season in trainer mode", async () => {
    const t = allTrainers().find(x => x.name === "난천")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "난천" });
    const t0 = performance.now();
    const n = await playSeason(st);
    console.log("player games", n, "sec", ((performance.now() - t0) / 1000).toFixed(1), "season", st.season, "day", st.day);
    const p = st.player;
    console.log("history", JSON.stringify(p.history), "money", p.money, "fans", p.fans, "rep", p.reputation, "titles", p.titles);
    for (const r of ["kanto", "sinnoh", "paldea"]) {
      const lg = (st as any).leagues[r];
    }
    expect(st.season).toBe(2);
    expect(p.history.length).toBe(1);
  }, 600000);
  it("scout mode basics", async () => {
    const t = allTrainers().find(x => x.name === "반바지 꼬마 오성")!;
    const picks = scoutStartOptions("kanto", "x").map(l => l[0]);
    const st = createGame({ mode: "scout", slotId: t.id, name: "나", scoutPicks: picks });
    console.log(st.player.squad.map(m => `${koSpecies(m.species)} Lv${m.level} ${m.moves.join(",")}`));
    expect(startMission(st, "johto", null)).toBeNull();
    // 8/1 .. 8/28 (preseason): 4 weekly reports (league matches go to the match screen)
    let sundays = 0;
    for (let i = 0; i < 40 && st.day < 28; i++) {
      const r = await advance(st, sim);
      if (r.type === "match") {
        const s = new BattleSession({ ...sideFor(st, st.player.slotId), human: false }, sideFor(st, r.pending.opponent), "m" + i);
        s.start();
        recordPlayerGame(st, s.runToEnd());
      } else if (r.type === "day" && weekdayOf(r.day) === 6 && r.day < 28) sundays++;
    }
    expect(sundays).toBe(4);
    console.log("after 4 weeks", st.day, st.player.squad.map(m => `${koSpecies(m.species)} Lv${m.level} ${m.moves.join(",")}`), "cands", st.player.candidates.length, "money", st.player.money);
    const c = st.player.candidates[0];
    expect(signCandidate(st, c.id)).toBeNull();
    expect(st.player.squad.length).toBe(4);
  }, 600000);
});
