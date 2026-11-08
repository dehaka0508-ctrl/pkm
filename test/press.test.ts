import { describe, expect, it } from "vitest";
import type { MatchResult } from "../src/battle/engine";
import { dayOf } from "../src/game/calendar";
import { allTrainers } from "../src/game/lineups";
import { addPressStory, capturePressRosters, cupFinalePress, finishPlayerPressMatch, majorArticles, maybePressRumor, recordNpcPressGame, rememberPlayerPressGame } from "../src/game/press";
import type { ScheduleRow } from "../src/game/season";
import { buy } from "../src/game/shop";
import { createGame, teamOf, type PendingMatch } from "../src/game/state";
import { addGame, newTie } from "../src/game/tie";

const setup = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "그린 테스트" });
const result: MatchResult = { winner: 0, remaining: [1, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [{ 0: 3 }, {}], turns: 12, gimmicks: [["tera"], []] };

describe("major articles", () => {
  it("keeps the latest real match first and the next preview distinct from a settled autosave", () => {
    const g = setup();
    g.day = dayOf(g.season, 9, 18);
    const [opp, next] = g.leagues.kanto.teams.filter(id => id !== g.player.slotId);
    const p: PendingMatch = { comp: "fx", home: true, games: [{ w: 0, my: 1, opp: 0 }], label: "관동 리그 3라운드", opponent: opp };
    g.pending = p;
    rememberPlayerPressGame(g, p, [teamOf(g, g.player.slotId), teamOf(g, opp)], result);
    finishPlayerPressMatch(g, { rankAfter: 2, streakAfter: 3 });
    const schedule: ScheduleRow[] = [
      { day: g.day, comp: "league", label: "리그 3R", opp, home: true },
      { day: g.day + 7, comp: "league", label: "리그 4R", opp: next, home: false },
    ];
    const news = majorArticles(g, schedule);
    expect(news.length).toBeGreaterThanOrEqual(3);
    expect(news.length).toBeLessThanOrEqual(5);
    expect(news[0]).toMatchObject({ outlet: "관동일보", body: expect.stringContaining("1–0") });
    expect(news[1].id).toBe(`preview:${g.day + 7}:리그 4R`);
    expect(news[1].body).toContain("전력 지수");
    expect(news[1].body).toContain("주목할 포켓몬");
    expect(majorArticles(g, schedule)).toEqual(news);
  });

  it("replaces a final match headline with the result and retains last season and trophy facts", () => {
    const g = setup();
    g.season = 2;
    g.day = dayOf(g.season, 6, 6);
    g.player.titles = ["시즌 1 PWT 우승", "시즌 2 관동 리그 우승", "시즌 2 PWT 우승"];
    const me = g.player.slotId;
    const opponent = g.leagues.kanto.teams.find(id => id !== me)!;
    const p: PendingMatch = { comp: "tie", tie: { kind: "pwtFinal", leg: 0 }, label: "PWT 결승 (3판 2선승)", opponent, home: false, games: [] };
    const tie = newTie(me, opponent, "bo3");
    addGame(tie, { w: 0, ra: 1, rb: 0 });
    addGame(tie, { w: 0, ra: 1, rb: 0 });
    rememberPlayerPressGame(g, p, [teamOf(g, me), teamOf(g, opponent)], result, tie);
    finishPlayerPressMatch(g, { finale: cupFinalePress(g, "PWT", true, "pwt") });
    const news = majorArticles(g, []);
    expect(news[0].title).toContain("PWT 결승 우승");
    expect(news[0].body).toContain("2연속 우승");
    expect(news[0].body).toContain("2관왕");
    expect(news[0].body).toContain("결승 시리즈는 2–0");
    expect(news[2].id).toContain("preview:");
  });

  it("uses completed schedule results for old saves and covers a real NPC reversal or award", () => {
    const g = setup();
    g.day = dayOf(g.season, 9, 18);
    const [a, b] = g.leagues.kanto.teams.filter(id => id !== g.player.slotId);
    recordNpcPressGame(g, [a, b], "관동 리그 3라운드", { ...result, comeback: true }, [14, 1]);
    addPressStory(g, "award", "annual", "연간 개인상", "연간 개인상이 발표됐다.", undefined, "매크로코스모스 스포츠");
    const news = majorArticles(g, [
      { day: g.day - 7, comp: "league", label: "리그 2R", opp: a, home: true, result: "패 0:3" },
      { day: g.day, comp: "league", label: "리그 3R", opp: a, home: false },
    ]);
    expect(news[0].title).toContain("0–3");
    expect(news[1].body).toContain("직전 맞대결 패 0–3");
    expect(news.some(x => x.title.includes("0–2에서 3–2 역전"))).toBe(true);
    expect(news.some(x => x.outlet === "매크로코스모스 스포츠")).toBe(true);
  });

  it("reports a third-place game with its finishing place, including old saves", () => {
    const g = setup();
    g.day = dayOf(g.season, 6, 2);
    const me = g.player.slotId;
    const opponent = g.leagues.kanto.teams.find(id => id !== me)!;
    const row: ScheduleRow = { day: g.day, comp: "pwt", label: "PWT 3·4위전", opp: opponent, home: null };
    expect(majorArticles(g, [row])[0].body).toContain("승자는 대회 3위");
    const p: PendingMatch = { comp: "tie", tie: { kind: "third", tier: "pwt", leg: 0 }, label: row.label, opponent, home: false, games: [] };
    const tie = newTie(me, opponent, "single");
    addGame(tie, { w: 0, ra: 1, rb: 0 });
    rememberPlayerPressGame(g, p, [teamOf(g, me), teamOf(g, opponent)], result, tie);
    expect(majorArticles(g, [row])[0].title).toContain("3위 확정");
    g.press = undefined;
    expect(majorArticles(g, [{ ...row, result: "패 0:1" }])[0].title).toContain("4위 확정");
  });

  it("ignores entry reordering and reports only successful purchases", () => {
    const g = setup();
    capturePressRosters(g);
    g.player.entry.reverse();
    capturePressRosters(g);
    expect(g.press?.stories).toBeUndefined();
    expect(buy(g, "Leftovers", g.player.money + 1)).not.toBeNull();
    expect(g.press?.stories).toBeUndefined();
    expect(buy(g, "Leftovers", 1)).toBeNull();
    expect(majorArticles(g, []).some(x => x.title.includes("먹다남은음식"))).toBe(true);
  });

  it("schedules no more than two clearly unconfirmed rumors per season", () => {
    const g = setup();
    for (let day = 0; day < 365; day++) {
      g.day = day;
      maybePressRumor(g);
    }
    const rumors = g.press?.stories?.filter(x => x.topic === "rumor") ?? [];
    expect(rumors.length).toBeGreaterThanOrEqual(1);
    expect(rumors.length).toBeLessThanOrEqual(2);
    expect(rumors.every(x => x.title.includes("양측 확인 없어"))).toBe(true);
  });
});
