// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { podiumRanks, queueIndividualCeremonies, queueTeamCeremony } from "../src/game/ceremony";
import { seasonEvents } from "../src/game/calendar";
import { allTrainers } from "../src/game/lineups";
import { advance } from "../src/game/season";
import { createGame, loadGame } from "../src/game/state";
import { newTie } from "../src/game/tie";
import { Hub } from "../src/ui/Hub";
import { NewGame } from "../src/ui/NewGame";
import { setGame } from "../src/ui/store";

const root = document.createElement("div");
const [me, first, second, third] = allTrainers().filter(t => t.region === "kanto");
const makeGame = () => createGame({ mode: "trainer", slotId: me.id, name: me.name });

async function mount(node: Parameters<typeof render>[0]) {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Assets are not loaded in DOM tests")));
  document.body.append(root);
  await act(() => render(node, root));
}

afterEach(async () => {
  await act(() => render(null, root));
  root.remove();
  setGame(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("shows only entered competitions and saves the pending results until each screen is dismissed", async () => {
  const g = makeGame();
  const final = { ...newTie(first.id, second.id, "single"), winner: first.id };
  const bronze = { ...newTie(me.id, third.id, "single"), winner: me.id };
  queueTeamCeremony(g, "PWT", podiumRanks(final, bronze), false);
  queueTeamCeremony(g, "PST", [first.id, second.id, third.id], true);
  queueTeamCeremony(g, "관동 컵", podiumRanks(final, bronze), true);
  const mon = g.player.squad[0];
  const award = { season: g.season, region: "kanto", uid: mon.uid, species: mon.species, kind: "k" as const, value: 10 };
  queueIndividualCeremonies(g, "PSB", [{ ...award, owner: first.id }, { ...award, owner: me.id }]);
  setGame(g);
  expect(loadGame()?.ceremonies?.map(c => c.competition)).toEqual(["PST", "관동 컵", "PSB"]);
  await mount(<Hub />);
  const dialog = () => root.querySelector("[role=dialog]")!;
  const close = () => act(() => dialog().querySelector("button")!.click());
  expect(dialog().textContent).toContain("PST 최종 결과");
  expect(dialog().querySelector(".ceremony-stage")).toBeNull();
  await close();
  expect(dialog().querySelectorAll(".ceremony-position")).toHaveLength(3);
  expect(dialog().querySelector(".rank-3")).not.toBeNull();
  expect(dialog().textContent).toContain(me.name);
  await close();
  expect(dialog().textContent).toContain("최다 KO상");
  expect(dialog().querySelector(".ceremony-stage.solo")).not.toBeNull();
  await close();
  expect(root.querySelector("[role=dialog]")).toBeNull();
  expect(loadGame()?.ceremonies).toEqual([]);
});

it("offers gender on both new-character start flows and uses it for the saved character sprite", async () => {
  await mount(<NewGame />);
  const click = (label: string) => act(() => [...root.querySelectorAll("button")].find(b => b.textContent?.trim() === label)!.click());
  // the start screen: pick the player start, then 시작
  await click("신인");
  await click("시작 ▶");
  await click("여자");
  expect(root.querySelector('[aria-pressed="true"]')?.textContent).toBe("여자");
  await click("◀ 뒤로");
  await click("커스텀");
  await click("시작 ▶");
  await click("여자");
  expect(root.querySelector('[aria-pressed="true"]')?.textContent).toBe("여자");
  for (const mode of ["scout", "custom"] as const) {
    expect(createGame({ mode, slotId: me.id, name: "나", gender: "F" }).player).toMatchObject({ gender: "F", sprite: "player_f" });
  }
  expect(makeGame().player.sprite).toBe(me.sprite);
});

it("does not reopen a PSB ceremony if an older save already settled the final", async () => {
  const g = makeGame();
  g.day = seasonEvents(g.season).find(event => event.kind === "psb" && event.round === 3)!.day;
  g.psb = {
    season: g.season, champs: { east: [me.id], west: [first.id] }, champion: me.id,
    ties: { final: { ...newTie(me.id, first.id, "single"), winner: me.id } },
  };
  await advance(g, async () => { throw new Error("The final was already settled"); });
  expect(g.ceremonies).toBeUndefined();
  expect(g.player.titles).toEqual([]);
});
