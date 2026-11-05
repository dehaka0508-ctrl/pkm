import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { advanceWithRegistration as advance } from "./registered-advance";
import { endDay, type Simulator } from "../src/game/season";
import { dateOf, weekdayOf } from "../src/game/calendar";
import { bestPrice, buyGround, capacityOf, expandStadium, expansionCost, gateAt, homeGate, playerSeats, refPrice, stadiumName, ticketDemand, upgradeFacility, weeklyCosts, weeklyIncome } from "../src/game/finance";
import { onGameResult, seasonFame, setTicketPrice } from "../src/game/fans";

const sim: Simulator = async jobs => jobs.map(() => ({ winner: 0, remaining: [1, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}], turns: 10 }) as any);
const game = (role?: string) => {
  const t = role ? allTrainers().find(x => x.role === role)! : allTrainers().find(x => x.region === "kanto" && x.name === "그린")!;
  return createGame({ mode: "trainer", slotId: t.id, name: "나" });
};

describe("stadium seats", () => {
  it("costs seat by seat across the doubled tiers", () => {
    expect(expansionCost(1000, 5000)).toBe(600000);
    expect(expansionCost(5000, 10000)).toBe(1000000);
    expect(expansionCost(10000, 20000)).toBe(4000000);
    expect(expansionCost(20000, 30000)).toBe(6000000);
    expect(expansionCost(1000, 1100)).toBe(15000);
  });

  it("a renting club buys its own ground for 100,000, then builds in steps of 100", () => {
    const st = game("트레이너");
    expect(playerSeats(st.player.facilities)).toBe(0);
    expect(capacityOf(0)).toBe(1000);
    expect(weeklyCosts(st).rent).toBe(1500);
    st.player.money = 1_000_000;
    expect(expandStadium(st, 500)).toContain("전용 경기장");
    expect(buyGround(st)).toBeNull();
    expect(st.player.money).toBe(900000);
    expect(playerSeats(st.player.facilities)).toBe(1000);
    expect(weeklyCosts(st).rent).toBe(0);
    expect(weeklyCosts(st).upkeep).toBe(150);
    expect(expandStadium(st, 300)).toBeNull();
    expect(playerSeats(st.player.facilities)).toBe(1300);
    expect(st.player.money).toBe(900000 - 300 * 150);
    expect(stadiumName(1300)).toBe("소형 경기장");
    expect(homeGate(st).attendance).toBeLessThanOrEqual(1300);
  });

  it("starting grounds by role", () => {
    expect(playerSeats(game("챔피언").player.facilities)).toBe(1500);
    const e4 = game("사천왕");
    expect(playerSeats(e4.player.facilities)).toBe(0);
    expect(capacityOf(0, e4.player.facilities.rented)).toBe(1500);
    expect(weeklyCosts(e4).rent).toBe(2250);
    e4.player.money = 1_000_000;
    expect(buyGround(e4)).toBeNull();
    expect(e4.player.money).toBe(850000);
    expect(playerSeats(e4.player.facilities)).toBe(1500);
    expect(playerSeats(game("관장").player.facilities)).toBe(1000);
    expect(playerSeats(game("보스").player.facilities)).toBe(0);
    expect(playerSeats(game("주인공").player.facilities)).toBe(0);
  });

  it("old saves: untouched grounds move to the new starting grounds, built ones stay", () => {
    const st = game("챔피언");
    const old = JSON.parse(JSON.stringify(st));
    delete old.player.facilities.seats;
    delete old.player.stadiumV2;
    delete old.player.stadiumV3;
    old.player.facilities.stadium = 5;
    expect(migrate(old).player.facilities.seats).toBe(1500);
    // a v2 save still on its starting ground (champion 2,000) moves to 1,500
    const v2 = JSON.parse(JSON.stringify(st));
    delete v2.player.stadiumV3;
    v2.player.facilities.seats = 2000;
    expect(migrate(v2).player.facilities.seats).toBe(1500);
    const built = JSON.parse(JSON.stringify(st));
    delete built.player.stadiumV2;
    delete built.player.stadiumV3;
    built.player.facilities.stadium = 5;
    built.player.facilities.seats = 17000;
    expect(migrate(built).player.facilities.seats).toBe(17000);
  });
});

describe("ticket price and demand", () => {
  it("demand falls with price; takings peak at the reference price while seats are left, higher when full", () => {
    const fans = 3000, rep = 60, sat = 50;
    const P = refPrice(rep, sat);
    expect(ticketDemand(fans, rep, sat, 10)).toBeGreaterThan(ticketDemand(fans, rep, sat, 30));
    expect(Math.abs(bestPrice(fans, rep, sat, 50000) - P)).toBeLessThanOrEqual(1);
    expect(bestPrice(fans, rep, sat, 1000)).toBeGreaterThan(P + 3);
    // fame moves the peak more than mood
    expect(refPrice(80, 50) - refPrice(20, 50)).toBeGreaterThan(refPrice(50, 100) - refPrice(50, 0));
    expect(gateAt(fans, rep, sat, 1000, 100).income).toBeLessThan(gateAt(fans, rep, sat, 1000, bestPrice(fans, rep, sat, 1000)).income);
  });

  it("a 10%+ jump in price jolts the mood once; small steps do not", () => {
    const st = game();
    st.player.ticketPrice = 20;
    st.player.priceRef = 20;
    st.player.satisfaction = 60;
    expect(setTicketPrice(st, 21)).toBe(0);
    expect(st.player.satisfaction).toBe(60);
    expect(setTicketPrice(st, 25)).toBeLessThan(0); // 20 → 25 counted from the week's reference
    const after = st.player.satisfaction!;
    expect(after).toBeLessThan(60);
    expect(setTicketPrice(st, 15)).toBeGreaterThan(0);
    expect(st.player.satisfaction!).toBeGreaterThan(after);
  });
});

describe("merch shop", () => {
  it("each level adds 40% of the base merchandise", () => {
    const st = game();
    const base = weeklyIncome(st).merch;
    st.player.money = 1_000_000;
    const sat = st.player.satisfaction;
    expect(upgradeFacility(st, "merch")).toBeNull();
    expect(st.player.satisfaction).toBe(sat! + 2); // an upgrade pleases the fans
    st.player.satisfaction = sat;
    expect(weeklyIncome(st).merch).toBe(Math.round(base * 1.4));
  });
});

describe("mood and fame", () => {
  it("league runs move the mood; every 5th win in a row lifts fame", () => {
    const st = game();
    st.player.satisfaction = 50;
    const rep = st.player.reputation;
    for (let i = 0; i < 5; i++) onGameResult(st, 0, true);
    expect(st.player.satisfaction).toBe(50 + 1 + 1 + 2 + 2 + 2);
    expect(st.player.reputation).toBe(Math.min(100, rep + 2));
    onGameResult(st, 1, true);
    expect(st.player.leagueStreak).toBe(-1);
  });

  it("season end: fame by finish against expectation", () => {
    const st = game();
    st.player.reputation = 50;
    seasonFame(st, 10, 2);
    expect(st.player.reputation).toBe(56);
    seasonFame(st, 2, 18);
    expect(st.player.reputation).toBe(48);
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
  it("a renting NPC buys its ground when rich; a sold-out ground grows when it pays back", () => {
    const st = game();
    const id = allTrainers().find(x => x.role === "트레이너" && x.id !== st.player.slotId)!.id;
    const n = npcOf(st, id);
    expect(npcSeats(n)).toBe(0);
    n.money = 50_000;
    expect(npcExpand(n)).toBe(0); // cannot pay
    n.money = 5_000_000;
    expect(npcExpand(n)).toBe(1000);
    expect(npcSeats(n)).toBe(1000);
    n.fans = 8000;
    const added = npcExpand(n);
    expect(added).toBeGreaterThan(0);
    expect(npcSeats(n)).toBe(1000 + added);
  });
});
