import { expect, it } from "vitest";
import { LEAGUE_ROUNDS, seasonEvents } from "../src/game/calendar";
import { competitionStatus } from "../src/game/competition-status";
import { cupPath, ensureCupThird, makeCup } from "../src/game/cup";
import { emptyRow } from "../src/game/league";
import { allTrainers } from "../src/game/lineups";
import { ensureThird, type PwtState, type Tier } from "../src/game/pwt";
import { Rng } from "../src/game/rng";
import { createGame, type GameState } from "../src/game/state";
import { addGame, newTie } from "../src/game/tie";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto")!.id, seed: 42 });
const statuses = (g: GameState) => Object.fromEntries(competitionStatus(g).map(row => [row.label, row.status]));

function group(season: number, tier: Tier, teams: string[]): PwtState {
  return {
    season, tier, entrants: teams, groups: [teams], seeds: {}, pots: [], ko: [],
    groupDraw: { title: "", pools: [], boxes: [], steps: [] },
    fixtures: [teams.flatMap((home, i) => teams.slice(i + 1).map(away => ({ home, away, result: { h: 3, a: 0, w: 0 } })))],
  };
}

it("shows only entered tournaments before the draw and tracks the regional cup between rounds", () => {
  const g = game();
  const me = g.player.slotId;
  const league = g.leagues.kanto;
  const preseason = statuses(g);
  expect(preseason["관동 리그"]).toMatch(/^현재 \d+위$/);
  expect(preseason["관동 컵"]).toBe("대진 추첨 전");
  expect(Object.keys(preseason).filter(label => ["PWT", "PST", "PCT"].includes(label))).toHaveLength(1);
  expect(preseason.PSB).toBeUndefined();
  expect(preseason["전국 슈퍼컵"]).toBeUndefined();

  const cup = makeCup("kanto", g.season, league.teams, g.prev.tables.kanto, true, new Rng("home-cup"));
  g.cups = { kanto: cup };
  const first = cupPath(cup, me)[0];
  const tie = cup.ties[first];
  expect(statuses(g)["관동 컵"]).toMatch(/^[12]라운드 진출$/);
  addGame(tie, { w: tie.a === me ? 0 : 1, ra: 3, rb: 0 });
  expect(statuses(g)["관동 컵"]).toMatch(/^[23]라운드 진출$/);
});

it("reports a group third's upper-tier elimination and lower-tier playoff before the draw", () => {
  const g = game();
  const me = g.player.slotId;
  g.pwt = group(g.season, "pwt", ["one", "two", me, "four"]);
  g.pct = group(g.season, "pct", ["pst-one", "pst-two", "pst-three", "pst-four"]);
  const undecided = g.pwt.fixtures[0][0];
  const score = undecided.result;
  delete undecided.result;
  expect(statuses(g).PWT).toBe("조별리그 A조 3위");
  expect(statuses(g).PST).toBeUndefined();

  undecided.result = score;
  expect(statuses(g).PWT).toBe("조별리그 탈락");
  expect(statuses(g).PST).toBe("녹아웃 플레이오프 진출");
  g.pct.kpo = [newTie(me, "pst-two", "two-leg")];
  addGame(g.pct.kpo[0], { w: 0, ra: 2, rb: 0 });
  expect(statuses(g).PST).toBe("녹아웃 플레이오프 진출");
  addGame(g.pct.kpo[0], { w: 0, ra: 1, rb: 0 });
  expect(statuses(g).PST).toBe("16강 진출");
  g.pct.ko = [[newTie(me, "pst-one", "two-leg")]];
  addGame(g.pct.ko[0][0], { w: 1, ra: 0, rb: 1 });
  addGame(g.pct.ko[0][0], { w: 1, ra: 0, rb: 3 });
  expect(statuses(g).PST).toBe("16강 탈락");
});

it("distinguishes losing a wing final from the regional cup bronze result", () => {
  const g = game();
  const me = g.player.slotId;
  const cup = makeCup("kanto", g.season, g.leagues.kanto.teams, g.prev.tables.kanto, true, new Rng("home-bronze"));
  g.cups = { kanto: cup };
  const path = cupPath(cup, me);
  for (const key of path.slice(0, -2)) (cup.ties[key] ??= newTie(me, "prior-opponent", "single")).winner = me;
  const wing = path.at(-2)!;
  cup.ties[wing] = { ...newTie(me, "finalist", "single"), winner: "finalist" };
  const otherWing = wing === "0WF" ? "1WF" : "0WF";
  cup.ties[otherWing] = { ...newTie("other-finalist", "bronze-opponent", "single"), winner: "other-finalist" };

  const thirdDay = seasonEvents(g.season).find(event => event.kind === "cupThird")!.day;
  g.day = thirdDay;
  expect(statuses(g)["관동 컵"]).toBe("윙 결승 탈락 · 3위 결정전 진출");
  g.day = thirdDay + 2;
  expect(statuses(g)["관동 컵"]).toBe("윙 결승 탈락");

  const bronze = ensureCupThird(cup)!;
  addGame(bronze, { w: bronze.a === me ? 0 : 1, ra: 2, rb: 1 });
  expect(statuses(g)["관동 컵"]).toBe("3위");
});

it.each([["pwt", "PWT"], ["pct", "PST"], ["ect", "PCT"]] as const)("tracks the %s bronze round on its actual calendar day", (tier, name) => {
  const g = game();
  const me = g.player.slotId;
  const tournament = (g[tier] = group(g.season, tier, [me, "one", "two", "three"]));
  tournament.ko = [[], [], [
    { ...newTie(me, "finalist", "two-leg"), winner: "finalist" },
    { ...newTie("bronze-opponent", "other-finalist", "two-leg"), winner: "other-finalist" },
  ]];
  const thirdDay = seasonEvents(g.season).find(event => event.kind === "koThird" && event.tier === tier)!.day;
  g.day = thirdDay + 2;
  expect(statuses(g)[name]).toBe("4강 탈락");
  g.day = thirdDay;
  expect(statuses(g)[name]).toBe("4강 탈락 · 3위 결정전 진출");
  const bronze = ensureThird(tournament)!;
  expect(statuses(g)[name]).toBe("4강 탈락 · 3위 결정전 진출");
  addGame(bronze, { w: 1, ra: 0, rb: 3 });
  g.day = thirdDay + 2;
  expect(statuses(g)[name]).toBe("4위");
});

it("tracks qualified super cups separately from the league champions' PSB", () => {
  const g = game();
  const me = g.player.slotId;
  const second = g.leagues.kanto.teams.find(id => id !== me)!;
  g.season = 2;
  g.prev = { season: 1, virtual: false, tables: { kanto: [me, second].map((id, i) => ({ id, rank: i + 1, pts: 2 - i, diff: 0, gf: 0 })) }, champion: "pwt-winner", pctChampion: me, ectChampion: "pct-winner" };
  expect(statuses(g)["관동 슈퍼컵"]).toBe("대진 추첨 전");
  expect(statuses(g)["전국 슈퍼컵"]).toBe("대진 추첨 전");
  expect(statuses(g).PSB).toBeUndefined();

  const regional = newTie(me, second, "single");
  const semi = newTie(me, "pct-winner", "single");
  g.supers = { season: g.season, regional: { kanto: regional }, semi, world: null };
  expect(statuses(g)["전국 슈퍼컵"]).toBe("준결승 진출");
  addGame(semi, { w: 1, ra: 0, rb: 2 });
  addGame(regional, { w: 0, ra: 1, rb: 0 });
  expect(statuses(g)["전국 슈퍼컵"]).toBe("준결승 탈락");
  expect(statuses(g)["관동 슈퍼컵"]).toBe("우승");

  g.leagues.kanto.table[me] = { ...emptyRow(me), pts: 100 };
  g.leagues.kanto.nextRound = LEAGUE_ROUNDS;
  expect(statuses(g).PSB).toBe("대진 추첨 전");
  const r1 = newTie(me, second, "single");
  g.psb = { season: g.season, champs: { east: [me, second], west: [] }, ties: { "east:1": r1 } };
  expect(statuses(g).PSB).toBe("1라운드 진출");
  addGame(r1, { w: 0, ra: 2, rb: 0 });
  expect(statuses(g).PSB).toBe("4강 진출");
});
