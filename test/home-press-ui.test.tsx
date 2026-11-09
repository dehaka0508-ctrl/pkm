// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { LEAGUE_ROUNDS } from "../src/game/calendar";
import { emptyRow } from "../src/game/league";
import { SuperCupTab } from "../src/ui/tabs/Comps";
import { allTrainers } from "../src/game/lineups";
import { articleSentences } from "../src/game/press";
import { createGame } from "../src/game/state";
import { Hub } from "../src/ui/Hub";
import { setGame } from "../src/ui/store";

const root = document.createElement("div");

afterEach(async () => {
  await act(() => render(null, root));
  root.remove();
  setGame(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("keeps the four home sections and opens each article in a readable dialog", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No assets in DOM tests")));
  const trainer = allTrainers().find(t => t.region === "kanto")!;
  const g = createGame({ mode: "trainer", slotId: trainer.id, seed: 42 });
  g.lastWeekSummary = ["지난 진행 요약은 홈에 표시하지 않습니다."];
  setGame(g);
  document.body.append(root);
  await act(() => render(<Hub />, root));

  expect([...root.querySelectorAll(".hub .win h3")].map(node => node.textContent)).toEqual([
    "다음 경기", "대회 현황", "주요 기사", "내 엔트리",
  ]);
  expect(root.textContent).not.toContain(g.lastWeekSummary[0]);
  const articles = [...root.querySelectorAll(".home-articles article")];
  expect(articles.length).toBeGreaterThanOrEqual(3);
  expect(articles.length).toBeLessThanOrEqual(5);
  for (const article of articles) {
    expect(article.querySelector(".home-article-heading .home-line")?.textContent).toBeTruthy();
    const body = article.querySelector("button > .home-line");
    expect(body?.textContent).toBeTruthy();
    expect(body?.getAttribute("title")).toBe(body?.textContent);
    const button = article.querySelector("button")!;
    await act(() => button.click());
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("h2")?.textContent).toBe(button.getAttribute("aria-label"));
    const text = dialog.querySelector(".article-dialog-body")!.textContent!;
    expect(text).not.toMatch(/전력 지수|명성/);
    expect(text.split(/(?<=[.!?])\s+/).length).toBeGreaterThanOrEqual(2);
    expect(text.split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(3);
    await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  }
});

it("keeps whole sentences and gives shorter saved articles a dated attribution", () => {
  const article = { id: "award", outlet: "관동일보", title: "수상", body: "올해의 수상자가 결정됐다.", day: 0 };
  expect(articleSentences(article)).toEqual(["올해의 수상자가 결정됐다.", "8월 1일자 관동일보 보도다."]);
  expect(articleSentences({ ...article, body: "첫 문장이다. 두 번째다. 세 번째다. 네 번째다." })).toEqual(["첫 문장이다.", "두 번째다.", "세 번째다."]);
});

it("shows the next regional Super Cup bracket as soon as qualifiers are known", async () => {
  const g = createGame({ mode: "trainer", slotId: "kanto-그린", seed: 42 });
  const league = g.leagues.kanto;
  league.table["kanto-그린"] = { ...emptyRow("kanto-그린"), pts: 100 };
  await act(() => render(<SuperCupTab g={g} />, root));
  expect(root.textContent).toContain("시즌 2 지역 슈퍼컵");
  expect(root.textContent).not.toContain("그린");
  league.nextRound = LEAGUE_ROUNDS;
  await act(() => render(<SuperCupTab g={g} />, root));
  expect(root.textContent).toContain("그린");
  expect(root.textContent).toContain("미정");
  g.cups = { kanto: { champion: "kanto-시바" } } as NonNullable<typeof g.cups>;
  await act(() => render(<SuperCupTab g={g} />, root));
  expect(root.querySelector(".tie-card")?.textContent).toContain("시바");
  expect(root.querySelector(".tie-card")?.textContent).not.toContain("미정");
  expect(g.supers).toBeNull();
});
