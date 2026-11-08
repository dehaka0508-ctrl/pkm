// @vitest-environment happy-dom
import { h, render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import type { MatchResult } from "../src/battle/engine";
import { dayOf } from "../src/game/calendar";
import { awardGoldenMasterBall, goldenMasterBallCount } from "../src/game/golden-master-ball";
import { applyResult } from "../src/game/league";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { createGame } from "../src/game/state";
import { recordGame } from "../src/game/stats";
import { TeamList } from "../src/ui/TeamView";

const [mine, rival] = allTrainers().filter(t => t.region === "kanto");
const game = () => createGame({ mode: "trainer", slotId: mine.id, name: "시상식 검증" });
const result: MatchResult = {
  winner: 1,
  remaining: [0, 1],
  turns: 9,
  picks: [[0], [0]],
  kos: [{ 0: 2 }, { 0: 2 }],
  dmg: [{ 0: { dealt: 300, taken: 220 } }, { 0: { dealt: 300, taken: 220 } }],
};

afterEach(() => vi.unstubAllGlobals());

it("selects one nationwide winner from recorded competitors on June 30 and accounts for team trophies", () => {
  const g = game();
  const league = g.leagues.kanto;
  const opponents = resolveTeam(rival);
  recordGame(g, "league:kanto", [mine.id, rival.id], [g.player.squad, opponents], result);
  applyResult(league.table, { home: mine.id, away: rival.id, result: { h: 0, a: 1, w: 1 } });
  league.nextRound = league.rounds.length;
  g.day = dayOf(g.season, 6, 29);
  expect(awardGoldenMasterBall(g)).toBeUndefined();
  g.day++;
  const winner = awardGoldenMasterBall(g);
  expect(winner).toMatchObject({ day: g.day, owner: rival.id, uid: opponents[0].uid, appearances: 1, kos: 2, damage: 300, trophies: ["관동 리그"] });
  expect(awardGoldenMasterBall(g)).toBeUndefined();
  expect(g.goldenMasterBalls).toEqual([winner]);
});

it("keeps a player's award after evolution and limits a rival's badge to the winning individual", () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Assets are not loaded by DOM tests")));
  const g = game();
  const playerMon = g.player.squad[0];
  const [npcMon, npcBench] = resolveTeam(rival);
  g.day = dayOf(g.season, 6, 30);
  const snapshot = { day: g.day, species: npcMon.species, trainerName: rival.name, pokemonName: npcMon.species, appearances: 1, kos: 2, damage: 300, trophies: [] };
  g.goldenMasterBalls = [
    { ...snapshot, season: 1, owner: rival.id, uid: npcMon.uid },
    { ...snapshot, season: 2, owner: mine.id, uid: playerMon.uid, species: playerMon.species },
  ];
  playerMon.species = "Dragonite";
  expect(goldenMasterBallCount(g, mine.id, playerMon.uid, playerMon.species)).toBe(1);
  expect(goldenMasterBallCount(g, rival.id, npcMon.uid, "Mewtwo")).toBe(0);
  expect(goldenMasterBallCount(g, mine.id, npcMon.uid, npcMon.species)).toBe(0);

  const container = document.createElement("div");
  render(h(TeamList, { g, owner: rival.id, team: [npcMon, { ...npcBench, species: npcMon.species }] }), container);
  expect(container.querySelectorAll('[aria-label="골든 마스터볼 1회 수상"]')).toHaveLength(1);
  render(null, container);
});
