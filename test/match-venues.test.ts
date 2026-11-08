import { expect, it } from "vitest";
import { seasonEvents } from "../src/game/calendar";
import { homeGate } from "../src/game/finance";
import { npcGate, npcOf } from "../src/game/npc";
import { pendingVenueName, playerSchedule, recordPlayerGame, type Simulator } from "../src/game/season";
import { createGame } from "../src/game/state";
import { newTie } from "../src/game/tie";
import { finalStadium, psbHost, settleVenueGate, tieVenue } from "../src/game/venues";
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
  const gross = homeGate(st).income;
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
