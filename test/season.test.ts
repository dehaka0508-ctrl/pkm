import { describe, it, expect } from "vitest";
import { createGame, displayName, entryTeam } from "../src/game/state";
import { advance, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { simulateMatch, BattleSession } from "../src/battle/engine";
import { standings } from "../src/game/league";
import { allTrainers } from "../src/game/lineups";
import { starterCandidates, startMission, signCandidate } from "../src/game/scouting";
import { koSpecies } from "../src/data/dex";

const sim: Simulator = async jobs => jobs.map(j => simulateMatch(j.p1, j.p2, j.seed));

async function playSeason(state: any, weeks = 52) {
  let matches = 0;
  for (let i = 0; i < weeks * 3 && state.season === 1; i++) {
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
    console.log("player games", n, "sec", ((performance.now() - t0) / 1000).toFixed(1), "season", st.season, "week", st.week);
    const p = st.player;
    console.log("history", JSON.stringify(p.history), "money", p.money, "fans", p.fans, "rep", p.reputation, "titles", p.titles);
    for (const r of ["kanto", "sinnoh", "paldea"]) {
      const lg = (st as any).leagues[r];
    }
    expect(st.season).toBe(2);
    expect(p.history.length).toBe(1);
  }, 600000);
  it("scout mode basics", async () => {
    const t = allTrainers().find(x => x.name === "반바지 꼬마")!;
    const picks = starterCandidates("kanto", "x").slice(0, 3);
    const st = createGame({ mode: "scout", slotId: t.id, name: "나", scoutPicks: picks });
    console.log(st.player.squad.map(m => `${koSpecies(m.species)} Lv${m.level} ${m.moves.join(",")}`));
    expect(startMission(st, "johto", null)).toBeNull();
    for (let i = 0; i < 4; i++) {
      const r = await advance(st, sim);
      expect(r.type).toBe("week");
    }
    console.log("after 4 weeks", st.player.squad.map(m => `${koSpecies(m.species)} Lv${m.level} ${m.moves.join(",")}`), "cands", st.player.candidates.length, "money", st.player.money);
    const c = st.player.candidates[0];
    expect(signCandidate(st, c.id)).toBeNull();
    expect(st.player.squad.length).toBe(4);
  }, 600000);
});
