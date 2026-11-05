// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { MatchPrep } from "../src/ui/MatchPrep";
import { setGame } from "../src/ui/store";
import { createGame, entryTeam } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { recordLeagueLineup, leagueLineupRun } from "../src/game/rotation";
import { registerTeam, suggestedRegistration } from "../src/game/registration";

let root: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No assets in DOM tests")));
  root = document.createElement("div"); document.body.append(root);
});
afterEach(async () => { await act(() => render(null, root)); root.remove(); setGame(null); localStorage.clear(); vi.unstubAllGlobals(); });

it("previews the fifth-match penalty, treats reorderings identically, and recommends a safe trio", async () => {
  const trainer = allTrainers().find(t => t.region === "kanto" && t.role === "관장")!;
  const g = createGame({ mode: "trainer", slotId: trainer.id, name: "UI" });
  g.registrationDue = "league"; registerTeam(g, "league", suggestedRegistration(g, "league"));
  const opp = allTrainers().find(t => t.region === "kanto" && t.id !== trainer.id)!;
  g.pending = { comp: "fx", label: "관동 리그", opponent: opp.id, home: true, games: [] };
  const team = entryTeam(g);
  for (let i = 0; i < 4; i++) recordLeagueLineup(g, trainer.id, team.slice(0, 3).map(m => m.uid));
  setGame(g); await act(() => render(h(MatchPrep, {}), root));
  const mine = [...root.querySelectorAll(".win")].find(w => w.textContent?.includes("내 엔트리"))!;
  const cards = [...mine.querySelectorAll(".cards .card")];
  for (const i of [2, 0, 1]) await act(() => (cards[i] as HTMLElement).click());
  expect(mine.querySelector('[role="status"]')?.textContent).toContain("5경기 연속 출전하면 팬 만족도 −1");
  expect(leagueLineupRun(g, trainer.id)!.streak).toBe(4);
  await act(() => (cards[2] as HTMLElement).click());
  await act(() => (cards[3] as HTMLElement).click());
  expect(mine.querySelector('[role="status"]')?.textContent).not.toContain("팬 만족도 −1");
  const recommend = [...mine.querySelectorAll("button")].find(b => b.textContent === "추천 선택")!;
  await act(() => recommend.click());
  expect(mine.querySelectorAll(".pick-num")).toHaveLength(3);
  expect(mine.querySelector('[role="status"]')?.textContent).not.toContain("팬 만족도 −1");
  expect(leagueLineupRun(g, trainer.id)!.streak).toBe(4);
});
