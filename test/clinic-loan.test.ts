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
