import { expect, it } from "vitest";
import { makeCup } from "../src/game/cup";
import { leagueGateAfterLineup, leagueGateImportance } from "../src/game/gate-importance";
import { emptyRow } from "../src/game/league";
import { Rng } from "../src/game/rng";
import { seasonEvents } from "../src/game/calendar";
import { gateAt, homeGate } from "../src/game/finance";
import { npcGate, npcOf } from "../src/game/npc";
import { nextTicketForecast, pendingVenueName, playerSchedule, recordPlayerGame, type Simulator } from "../src/game/season";
import { createGame } from "../src/game/state";
import { newTie } from "../src/game/tie";
import { cupHost, finalStadium, psbHost, settleVenueGate, tieVenue } from "../src/game/venues";
import { advanceWithRegistration as advance } from "./registered-advance";

const winner = { winner: 0, remaining: [3, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}], turns: 4 } as const;
const sim: Simulator = async jobs => jobs.map(() => structuredClone(winner) as any);

it("hosts the regional Super Cup at the league winner and books each side's cut once", async () => {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 21 });
  const me = st.player.slotId;
  const opp = "kanto-시바";
  st.season = 2;
  st.prev = { season: 1, virtual: false, tables: { kanto: [{ id: me, rank: 1, pts: 50, diff: 0 }, { id: opp, rank: 2, pts: 45, diff: 0 }] }, cupWinners: { kanto: opp } };
  st.day = seasonEvents(st.season).find(e => e.kind === "superCup")!.day;
  st.player.facilities.name = "테스트 스타디움";
  const first = await advance(st, sim);
  expect(first.type).toBe("match");
  expect(st.pending?.home).toBe(true);
  expect(pendingVenueName(st)).toBe("테스트 스타디움");
  expect(playerSchedule(st).find(row => row.day === st.day)?.venue).toBe("테스트 스타디움");
  recordPlayerGame(st, structuredClone(winner) as any);
  const gross = homeGate(st, st.player.ticketPrice, 10).income;
  const away = Math.round(gross * 0.3);
  await advance(st, sim);
  expect(st.lastWeekSummary?.filter(line => line.includes("입장 수입 배분"))).toEqual([
    expect.stringContaining(`₽${(gross - away).toLocaleString()}`),
  ]);
});

it("uses the designated Super Cup hosts and fixed neutral national final stadiums", () => {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 31 });
  const tie = newTie(st.player.slotId, "galar-단델", "bo3");
  expect(tieVenue(st, "worldSemi", tie)).toEqual({ host: tie.a, visitorShare: 0.3 });
  expect(tieVenue(st, "world", tie)).toEqual({ host: tie.a, visitorShare: 0.3 });
  expect(["pwtFinal", "pctFinal", "ectFinal"].map(finalStadium)).toEqual([
    "석영고원 스타디움", "슛스타디움", "그랜드시티 스타디움",
  ]);
  const venue = tieVenue(st, "pwtFinal", tie)!;
  const thirdClub = npcOf(st, "hoenn-성호");
  const before = [st.player.money, npcOf(st, tie.b).money, thirdClub.money];
  const gate = settleVenueGate(st, venue, tie.a, tie.b);
  expect(Math.abs(gate.shareA - gate.shareB)).toBeLessThanOrEqual(1);
  expect(gate.shareA + gate.shareB).toBe(gate.income);
  expect([st.player.money, npcOf(st, tie.b).money, thirdClub.money]).toEqual([
    before[0] + gate.shareA, before[1] + gate.shareB, before[2],
  ]);
});

it("draws a repeatable PSB host for each match and splits its own gate between two NPCs", () => {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 99 });
  const tie = newTie("galar-단델", "hoenn-성호", "single");
  const keys = Array.from({ length: 12 }, (_, i) => `psb:${i}`);
  expect(new Set(keys.map(key => psbHost(st, key, tie)))).toEqual(new Set([0, 1]));
  const key = keys.find(key => psbHost(st, key, tie) === 1)!;
  const venue = tieVenue(st, "psb", tie, key)!;
  expect(tieVenue(structuredClone(st), "psb", tie, key)).toEqual(venue);
  expect(venue).toEqual({ host: tie.b, visitorShare: 0.5 });
  const a = npcOf(st, tie.a), b = npcOf(st, tie.b);
  const gross = npcGate(b).income;
  const before = [a.money, b.money];
  const gate = settleVenueGate(st, venue, tie.a, tie.b);
  expect(gate.income).toBe(gross);
  expect(a.money - before[0]).toBe(Math.round(gross / 2));
  expect(b.money - before[1]).toBe(Math.floor(gross / 2));
});

it("prefers an owned ground for the regional cup, then compares gross gate and locks the choice", async () => {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 21 });
  const me = st.player.slotId;
  const opp = "kanto-시바";
  const n = npcOf(st, opp);
  n.fans = 100_000;
  n.reputation = 100;
  const t = newTie(opp, me, "single");
  expect(npcGate(n).income).toBeGreaterThan(homeGate(st).income);
  expect(cupHost(st, t)).toBe(1);
  st.player.facilities.seats = 0;
  expect(cupHost(st, t)).toBe(0);
  st.player.facilities.seats = 1500;
  n.seats = 1500;
  expect(cupHost(st, t)).toBe(0);
  n.seats = 0;
  st.cups = { kanto: makeCup("kanto", st.season, st.leagues.kanto.teams, [], true, new Rng("gate")) };
  const ties = st.cups.kanto.ties;
  const displaced = [ties["0A"].a, ties["0A"].b].filter(id => id !== me && id !== opp);
  for (const [key, match] of Object.entries(ties)) {
    if (key === "0A") continue;
    if (match.a === me || match.a === opp) match.a = displaced.shift()!;
    if (match.b === me || match.b === opp) match.b = displaced.shift()!;
  }
  ties["0A"] = t;
  st.day = seasonEvents(st.season).find(ev => ev.kind === "cup" && ev.round === 0)!.day;
  expect((await advance(st, sim)).type).toBe("match");
  expect(st.pending?.home).toBe(true);
  expect(t.host).toBe(1);
  const forecast = nextTicketForecast(st, st.player.ticketPrice);
  expect(forecast.importance).toBe(3);
  expect(forecast.income).toBe(Math.floor(homeGate(st, st.player.ticketPrice, 3).income / 2));
  n.seats = 1500;
  expect(cupHost(st, t)).toBe(1);
  recordPlayerGame(st, structuredClone(winner) as any);
  expect(t.games[0].home).toBe(1);
  const settled = Math.floor(homeGate(st, st.player.ticketPrice, 3).income / 2);
  await advance(st, sim);
  expect(st.lastWeekSummary?.filter(line => line.includes("입장 수입 배분"))).toEqual([
    expect.stringContaining(`₽${settled.toLocaleString()}`),
  ]);
});

it("caps importance and discounts only settled late stakes or a penalized home lineup", () => {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 17 });
  const league = st.leagues.kanto;
  const [leader, contender] = league.teams;
  const [a, b] = league.teams.slice(-2);
  league.table = Object.fromEntries(league.teams.map((id, i) => [id, { ...emptyRow(id), pts: 100 - i * 4 }]));
  expect(leagueGateImportance(st, "kanto", a, b)).toBe(0);
  league.nextRound = league.rounds.length - 2;
  expect(leagueGateImportance(st, "kanto", a, b)).toBe(-5);
  expect(leagueGateImportance(st, "kanto", leader, contender)).toBe(10);
  expect(leagueGateImportance(st, "kanto", league.teams[5], league.teams[6])).toBe(0);
  st.leagueLineups = { [leader]: { season: st.season, uids: ["1", "2", "3"], streak: 4 } };
  expect(leagueGateAfterLineup(st, leader, 10)).toBe(10);
  st.leagueLineups[leader].streak = 5;
  expect(leagueGateAfterLineup(st, leader, 10)).toBe(-5);
  const base = gateAt(1000, 50, 50, 1000, 25);
  expect(gateAt(1000, 50, 50, 1000, 25, 15).income).toBe(Math.round(base.income * 1.1));
  expect(gateAt(1000, 50, 50, 1000, 25, -15).income).toBe(Math.round(base.income * 0.95));
});
