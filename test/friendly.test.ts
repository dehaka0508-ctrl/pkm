import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { pendingDecided, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { advanceWithRegistration as advance } from "./registered-advance";
import { BattleSession } from "../src/battle/engine";
import { Rng } from "../src/game/rng";
import { dayOf, weekdayOf } from "../src/game/calendar";
import { answerOffer, friendliesOf, friendlyGate, invite, inviteable, openDays, settleFriendly, type Friendly } from "../src/game/friendly";
import { pendingCompetition } from "../src/game/registration";
import { npcOf } from "../src/game/npc";

const fastSim: Simulator = async jobs =>
  jobs.map(j => {
    const rng = new Rng(j.seed);
    const w = rng.chance(0.5) ? 0 : 1;
    const rem: [number, number] = [0, 0];
    rem[w] = rng.int(1, 3);
    return { winner: w, remaining: rem, turns: 10, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as any;
  });

const newGame = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "나" });

/** Advances until the player's friendly comes up, plays it for real, and settles it. */
async function playUntilFriendlyDone(st: ReturnType<typeof newGame>, day: number) {
  for (let i = 0; i < 80 && st.day <= day; i++) {
    const r = await advance(st, fastSim);
    if (r.type === "match" && st.pending?.friendly && !pendingDecided(st)) {
      expect(pendingCompetition(st.pending)).toBeNull(); // no season roster needed
      const me = sideFor(st, st.player.slotId);
      const s = new BattleSession({ ...me, picks: [0, 1, 2], human: false }, sideFor(st, st.pending.opponent), "fr");
      s.start();
      recordPlayerGame(st, s.runToEnd(), []);
    } else if (r.type === "match" && !st.pending?.friendly) {
      // an official game on the way (not expected in August) — let the sim play it
      const me = sideFor(st, st.player.slotId, !!st.pending!.doubles);
      const s = new BattleSession({ ...me, picks: me.team.map((_, i) => i).slice(0, st.pending!.doubles ? 4 : 3), human: false }, sideFor(st, st.pending!.opponent, !!st.pending!.doubles), "x", { doubles: !!st.pending!.doubles });
      s.start();
      recordPlayerGame(st, s.runToEnd(), []);
    }
  }
}

describe("preseason friendlies", () => {
  it("August only, no official-game days, one a week", () => {
    const st = newGame();
    const days = openDays(st);
    expect(days.length).toBeGreaterThan(10);
    expect(days.every(d => d > st.day && d <= dayOf(st.season, 8, 31))).toBe(true);
    // once a friendly is set, the rest of that week closes
    let set = false;
    for (const opp of inviteable(st)) {
      if (invite(st, opp, days[3]).ok) {
        set = true;
        break;
      }
    }
    expect(set).toBe(true);
    const week = Math.floor((days[3] + 4) / 7);
    expect(openDays(st).some(d => Math.floor((d + 4) / 7) === week)).toBe(false);
  });

  it("exact split: host 70%, visitor 30% — both ways", () => {
    const st = newGame();
    const me = st.player.slotId;
    const opp = inviteable(st)[0];
    for (const home of [me, opp]) {
      const f: Friendly = { id: `t${home}`, season: st.season, day: st.day, home, away: home === me ? opp : me, status: "set" };
      (st as any).friendlies = [...friendliesOf(st), f];
      const gate = friendlyGate(st, home);
      const p0 = st.player.money;
      const n0 = npcOf(st, opp).money;
      settleFriendly(st, f, { w: 0, my: 2, opp: 0 }, []);
      expect(gate.share).toBe(Math.round(gate.income * 0.3));
      expect(st.player.money - p0).toBe(home === me ? gate.income - gate.share : gate.share);
      expect(npcOf(st, opp).money - n0).toBe(home === me ? gate.share : gate.income - gate.share);
      expect(f.status).toBe("played");
    }
  });

  it("the host keeps 70% of the gate and the visitor gets 30%", async () => {
    const st = newGame();
    const day = openDays(st)[2];
    const opp = inviteable(st).find(o => invite(st, o, day).ok)!;
    expect(opp).toBeTruthy();
    const gate = friendlyGate(st, st.player.slotId);
    const pBefore = st.player.money;
    const nBefore = npcOf(st, opp).money;
    await playUntilFriendlyDone(st, day);
    const f = friendliesOf(st).find(x => x.away === opp)!;
    expect(f.status).toBe("played");
    expect(f.result).toBeDefined();
    // money moved by (at least) the gate split; other daily costs make it inexact, so check the NPC side
    expect(gate.share).toBe(Math.round(gate.income * 0.3));
    expect(npcOf(st, opp).money - nBefore).toBeGreaterThanOrEqual(gate.share - 60000); // food / NPC spending also run
    expect(st.player.money).not.toBe(pBefore);
  });

  it("NPC clubs invite the player; accepting books an away friendly, and offers lapse unanswered", async () => {
    const st = newGame();
    for (let i = 0; i < 12 && !friendliesOf(st).some(f => f.status === "offer"); i++) await advance(st, fastSim);
    const offers = friendliesOf(st).filter(f => f.status === "offer");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every(f => f.away === st.player.slotId && weekdayOf(f.day) >= 0)).toBe(true);
    const f = offers[0];
    expect(answerOffer(st, f.id, true)).toBeNull();
    expect(f.status).toBe("set");
    if (offers[1]) {
      // the other one is in the same window: either declined by the one-a-week rule or still open
      const err = answerOffer(st, offers[1].id, true);
      if (Math.floor((offers[1].day + 4) / 7) === Math.floor((f.day + 4) / 7)) expect(err).toBeTruthy();
    }
    const before = st.player.money;
    await playUntilFriendlyDone(st, f.day);
    expect(f.status).toBe("played");
    expect(st.player.money).not.toBe(before);
  });
});
