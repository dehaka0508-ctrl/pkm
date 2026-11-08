// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { allTrainers } from "../src/game/lineups";
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

it("renders the four home sections and keeps each article headline and preview separate", async () => {
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
    const body = article.querySelector(":scope > .home-line");
    expect(body?.textContent).toBeTruthy();
    expect(body?.getAttribute("title")).toBe(body?.textContent);
  }
});
