// 긴급 정리 (items → facility levels → the ground) and the debt relief that only shows itself when it happens.
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { borrow, lendersFor, loansOf, moneyBlocked, outOfOptions, roomWith } from "../src/game/loan";
import { canLiquidate, emergencySale, groundValue, rescueCheck } from "../src/game/rescue";
import { catalog } from "../src/game/shop";
import { upgradeCost } from "../src/game/finance";

const champ = allTrainers().find(t => t.role === "챔피언")!;
const borrowAll = (st: ReturnType<typeof createGame>) => {
  for (const l of lendersFor(st.player.region)) {
    const room = roomWith(st, l);
    if (room >= 1000) borrow(st, l.id, room);
  }
};

describe("긴급 정리", () => {
  it("sells items, then facility levels, then the ground, only as much as is short", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    const p = st.player;
    p.bag = { "Life Orb": 1 };
    p.facilities.training = 3;
    const seats = p.facilities.seats!;
    expect(seats).toBeGreaterThan(0);
    p.money = -1000;
    emergencySale(st);
    // the Life Orb alone (₽12,500) covers it: nothing else goes
    expect(p.bag["Life Orb"]).toBeUndefined();
    expect(p.money).toBe(-1000 + catalog().find(i => i.key === "Life Orb")!.price / 2);
    expect(p.facilities.training).toBe(3);
    expect(p.facilities.seats).toBe(seats);
    // a big hole: held items, then every facility level, then the ground
    p.money = -1_000_000;
    const held = p.squad.filter(m => m.item).length;
    emergencySale(st);
    expect(p.squad.filter(m => m.item && !/^key:/.test(m.item)).length).toBeLessThanOrEqual(held);
    expect(p.facilities.training).toBe(1);
    expect(p.facilities.seats).toBe(0);
    expect(p.facilities.rented).toBe(1000);
    expect(canLiquidate(st)).toBe(false);
    const expected = -1_000_000 + Math.round(upgradeCost("training", 2) * 0.5) + Math.round(upgradeCost("training", 1) * 0.5) + Math.round(groundValue(seats) * 0.8);
    expect(p.money).toBeGreaterThanOrEqual(expected);
  });

  it("blocks the calendar while something can be sold, even with every lender used up", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    borrowAll(st);
    st.player.money = -5000;
    st.player.debtWeeks = 2;
    expect(moneyBlocked(st)).toBe(true);
    emergencySale(st);
    expect(st.player.money).toBeGreaterThanOrEqual(0);
    expect(moneyBlocked(st)).toBe(false);
  });
});

describe("debt relief", () => {
  const broke = () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    borrowAll(st);
    st.player.money = -1_000_000;
    emergencySale(st);
    st.player.debtWeeks = 2;
    return st;
  };
  it("clears every debt for fame −10 once nothing is left and the club loses money every week", () => {
    const st = broke();
    expect(outOfOptions(st)).toBe(true);
    // a week in the red: no fans, no sponsor
    st.player.fans = 0;
    st.player.sponsor = { contract: null, offers: [], offersUntil: -1 };
    const fame = st.player.reputation;
    rescueCheck(st);
    expect(loansOf(st)).toEqual([]);
    expect(st.player.money).toBe(0);
    expect(st.player.reputation).toBe(Math.max(0, fame - 10));
    expect(st.inbox[0].title).toBe("개인회생");
  });
  it("does nothing while income still beats the weekly costs", () => {
    const st = broke();
    st.player.fans = 1_000_000;
    rescueCheck(st);
    expect(loansOf(st).length).toBeGreaterThan(0);
    expect(st.player.money).toBeLessThan(0);
  });
  it("is mentioned nowhere before it happens", async () => {
    const fs = await import("node:fs");
    const ui = fs.readdirSync("src/ui", { recursive: true }).filter((f: any) => /\.tsx?$/.test(String(f)));
    for (const f of ui) expect(fs.readFileSync(`src/ui/${f}`, "utf8")).not.toContain("개인회생");
  });
});
