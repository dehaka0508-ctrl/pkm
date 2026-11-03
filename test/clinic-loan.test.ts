import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { sideFor } from "../src/game/season";
import { treatmentCost, treatSquad, afterBattle } from "../src/game/clinic";
import { borrow, lendersFor, loanDay, loansOf, moneyBlocked } from "../src/game/loan";
import { dayOf } from "../src/game/calendar";

const newGame = () => {
  const t = allTrainers().find(x => x.region === "kanto" && x.name === "그린")!;
  return createGame({ mode: "trainer", slotId: t.id, name: "나" });
};

describe("treatment and loans", () => {
  it("untreated damage carries into the next battle; treatment costs HP% × food + 50 per PP", () => {
    const st = newGame();
    const me = sideFor(st, st.player.slotId);
    const opp = sideFor(st, allTrainers().find(x => x.region === "kanto" && x.id !== st.player.slotId)!.id);
    const s = new BattleSession({ ...me, human: false }, { ...opp, human: false }, "x1");
    s.start();
    const r = s.runToEnd();
    const after = r.after![0];
    expect(Object.keys(after).length).toBe(3);
    st.player.money = 0; // cannot pay
    afterBattle(st, after);
    const hurt = st.player.squad.filter(m => m.cond);
    expect(hurt.length).toBeGreaterThan(0);
    const m = hurt[0];
    expect(treatmentCost(st, m)).toBeGreaterThan(0);
    // next battle starts with the HP left (fainted ones at 1 HP)
    const s2 = new BattleSession({ ...sideFor(st, st.player.slotId), human: false }, { ...opp, human: false }, "x2");
    const pk = s2.battle.sides[0].pokemon.find((x: any) => sideFor(st, st.player.slotId).team[Number(x.set.name.slice(1))]?.uid === m.uid);
    expect(pk.hp).toBe(Math.max(1, Math.round(pk.maxhp * m.cond!.hp)));
    // with money, everyone is treated
    st.player.money = 1_000_000;
    const res = treatSquad(st, true);
    expect(res.left.length).toBe(0);
    expect(st.player.squad.some(x => x.cond)).toBe(false);
  });

  it("tiers by fame, monthly repayment, missed payments cost fame", () => {
    const st = newGame();
    st.player.reputation = 30;
    const l1 = lendersFor("kanto").find(l => l.tier === 1)!;
    expect(borrow(st, l1.id, 100000)).toContain("명성 50");
    const l2 = lendersFor("kanto").find(l => l.tier === 2)!;
    const before = st.player.money;
    expect(borrow(st, l2.id, 50000)).toBeNull();
    expect(st.player.money).toBe(before + 50000);
    expect(lendersFor("kanto").some(l => l.name === "로켓 캐피탈")).toBe(true);
    expect(lendersFor("kanto").some(l => l.name === "노랑저축은행")).toBe(true);
    // pay on the 1st
    st.day = dayOf(st.season, 9, 1);
    loanDay(st, []);
    expect(loansOf(st)[0].monthsLeft).toBe(loansOf(st)[0].months - 1);
    // miss: fame drops
    st.player.money = 0;
    st.day = dayOf(st.season, 10, 1);
    const rep = st.player.reputation;
    loanDay(st, []);
    expect(st.player.reputation).toBe(rep - 3);
    expect(loansOf(st)[0].missed).toBe(1);
    // blocked after two short food days
    st.player.money = -10;
    st.player.debtWeeks = 2;
    expect(moneyBlocked(st)).toBe(true);
  });
});

import { advance, type Simulator } from "../src/game/season";
import { weekdayOf } from "../src/game/calendar";
import { weeklyCosts } from "../src/game/finance";
import { treatDaily, condLabel } from "../src/game/clinic";

const fakeSim: Simulator = async jobs => jobs.map(() => ({ winner: 0, remaining: [1, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}], turns: 10 }) as any);

describe("money running out", () => {
  it("two short food days in a row stop the calendar until a loan covers it", async () => {
    const st = newGame();
    st.pending = null as any;
    st.player.money = -1;
    st.player.debtWeeks = 1;
    // advance day by day until the next food day (Sunday report) has been paid
    let guard = 0;
    while (!moneyBlocked(st) && guard++ < 20) {
      const r = await advance(st, fakeSim);
      if (r.type === "match") {
        // play nothing: drop the pending match for this test
        st.pending = null as any;
      }
      if (st.player.money >= 0) st.player.money = -1;
    }
    expect(moneyBlocked(st)).toBe(true);
    const day = st.day;
    const r = await advance(st, fakeSim);
    expect(r.type).toBe("day");
    expect(st.day).toBe(day);
    // a loan covers the shortfall: the calendar moves again and the streak is cleared
    const pc = lendersFor(st.player.region).find(l => l.id === "pc")!;
    expect(borrow(st, pc.id, 20000)).toBeNull();
    expect(st.player.debtWeeks).toBe(0);
    expect(moneyBlocked(st)).toBe(false);
  });

  it("daily treatment keeps this week's food money aside; labels", () => {
    const st = newGame();
    const m = st.player.squad[0];
    m.cond = { hp: 0.5, pp: {} };
    const cost = treatmentCost(st, m);
    st.player.money = weeklyCosts(st).total + cost - 1;
    treatDaily(st);
    expect(m.cond).toBeDefined();
    st.player.money = weeklyCosts(st).total + cost;
    treatDaily(st);
    expect(m.cond).toBeUndefined();
    expect(condLabel({ cond: { hp: 0, pp: {} } })).toBe("기절");
    expect(condLabel({ cond: { hp: 1, pp: { tackle: 2 } } })).toBe("PP 소모");
    expect(condLabel({ cond: { hp: 0.456, pp: {} } })).toBe("HP 46%");
  });
});
