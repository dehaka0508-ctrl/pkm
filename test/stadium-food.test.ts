import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { advance, endDay, type Simulator } from "../src/game/season";
import { dateOf, weekdayOf } from "../src/game/calendar";
import { capacityOf, expandStadium, expansionCost, homeGate, playerSeats, stadiumName, weeklyCosts, weeklyIncome } from "../src/game/finance";

const sim: Simulator = async jobs => jobs.map(() => ({ winner: 0, remaining: [1, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}], turns: 10 }) as any);
const game = (role?: string) => {
  const t = role ? allTrainers().find(x => x.role === role)! : allTrainers().find(x => x.region === "kanto" && x.name === "그린")!;
  return createGame({ mode: "trainer", slotId: t.id, name: "나" });
};

describe("stadium seats", () => {
  it("costs seat by seat across the tiers", () => {
    expect(expansionCost(0, 1000)).toBe(50000);
    expect(expansionCost(1000, 5000)).toBe(300000);
    expect(expansionCost(5000, 10000)).toBe(500000);
    expect(expansionCost(10000, 20000)).toBe(2000000);
    expect(expansionCost(20000, 30000)).toBe(3000000);
    expect(expansionCost(0, 30000)).toBe(5850000);
    expect(expansionCost(900, 1100)).toBe(100 * 50 + 100 * 75);
  });

  it("a renting club must build at least 1,000 seats first; then any 100", () => {
    const st = game("트레이너");
    expect(playerSeats(st.player.facilities)).toBe(0);
    expect(capacityOf(0)).toBe(1000);
    expect(weeklyCosts(st).rent).toBe(1500);
    st.player.money = 1_000_000;
    expect(expandStadium(st, 500)).toContain("1,000석 이상");
    expect(expandStadium(st, 1000)).toBeNull();
    expect(st.player.money).toBe(950000);
    expect(weeklyCosts(st).rent).toBe(0);
    expect(weeklyCosts(st).upkeep).toBe(150);
    expect(expandStadium(st, 300)).toBeNull();
    expect(playerSeats(st.player.facilities)).toBe(1300);
    expect(st.player.money).toBe(950000 - 300 * 75);
    expect(stadiumName(1300)).toBe("소형 경기장");
    expect(homeGate(st).attendance).toBeLessThanOrEqual(1300);
  });

  it("old saves keep their ground", () => {
    const st = game();
    delete (st.player.facilities as any).seats;
    st.player.facilities.stadium = 5;
    const m = migrate(JSON.parse(JSON.stringify(st)));
    expect(m.player.facilities.seats).toBe(15000);
  });
});

describe("food on Monday", () => {
  it("Monday pays food only; Sunday pays upkeep/rent and takes income, no food", () => {
    const st = game("트레이너");
    st.pending = null as any;
    const c = weeklyCosts(st);
    // a Monday that is not the 1st (no sponsor / loan day)
    let d = st.day;
    while (weekdayOf(d) !== 0 || dateOf(d).date === 1 || dateOf(d + 1).date === 1) d++;
    st.day = d;
    st.player.money = 100000;
    endDay(st, []);
    expect(st.player.money).toBe(100000 - c.food);
    // the Sunday after
    while (weekdayOf(st.day) !== 6) st.day++;
    if (dateOf(st.day + 1).date === 1) st.day += 7;
    st.player.money = 100000;
    const inc = weeklyIncome(st);
    endDay(st, []);
    expect(st.player.money).toBe(100000 + inc.total - c.upkeep - c.rent);
  });

  it("two short Mondays in a row stop the calendar", () => {
    const st = game("트레이너");
    let d = st.day;
    while (weekdayOf(d) !== 0 || dateOf(d).date === 1 || dateOf(d + 1).date === 1) d++;
    st.day = d;
    st.player.money = 0;
    st.player.debtWeeks = 1;
    endDay(st, []);
    expect(st.player.debtWeeks).toBe(2);
  });
});

import { npcExpand, npcOf, npcSeats } from "../src/game/npc";
describe("NPC stadiums", () => {
  it("a sold-out NPC with money builds seats for its crowd", () => {
    const st = game();
    const id = allTrainers().find(x => x.role === "트레이너" && x.id !== st.player.slotId)!.id;
    const n = npcOf(st, id);
    expect(npcSeats(n)).toBe(0);
    n.fans = 5000;
    n.money = 10_000;
    expect(npcExpand(n)).toBe(0); // cannot pay
    n.money = 2_000_000;
    const added = npcExpand(n);
    expect(added).toBeGreaterThanOrEqual(1000);
    expect(npcSeats(n)).toBe(added);
  });
});
