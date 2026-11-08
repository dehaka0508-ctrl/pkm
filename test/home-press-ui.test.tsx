// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
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
