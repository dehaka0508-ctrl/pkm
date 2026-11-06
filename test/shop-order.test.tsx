// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { dex } from "../src/data/dex";
import { RESIST_BERRY } from "../src/data/item-desc-ko";
import { catalog, compareTmMoves, SHOP_TYPE_ORDER } from "../src/game/shop";
import { ShopTab } from "../src/ui/tabs/Shop";
import type { GameState } from "../src/game/state";

const order = ["Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
const ascending = (values: number[]) => expect(values).toEqual([...values].sort((a, b) => a - b));

it("orders all type boosters, resistance berries and gimmick groups without dropping stock", () => {
  expect(SHOP_TYPE_ORDER).toEqual(order);
  const items = catalog();
  expect(new Set(items.map(i => i.key)).size).toBe(items.length);
  const boosters = ["Silk Scarf", "Charcoal", "Mystic Water", "Miracle Seed", "Magnet", "Never-Melt Ice", "Black Belt", "Poison Barb", "Soft Sand", "Sharp Beak", "Twisted Spoon", "Silver Powder", "Hard Stone", "Spell Tag", "Dragon Fang", "Black Glasses", "Metal Coat", "Fairy Feather"];
  expect(items.filter(i => i.cat === "held" && boosters.includes(i.key)).map(i => i.key)).toEqual(boosters);
  expect(items.filter(i => i.cat === "berry" && RESIST_BERRY[i.key]).map(i => RESIST_BERRY[i.key])).toEqual(order);
  const gimmicks = items.filter(i => i.cat === "gimmick");
  const mega = gimmicks.filter(i => dex.items.get(i.key).megaStone);
  ascending(mega.map(i => dex.species.get(String((dex.items.get(i.key) as any).megaEvolves)).num));
  const z = gimmicks.filter(i => dex.items.get(i.key).zMove && !dex.items.get(i.key).itemUser?.length);
  expect(z.map(i => dex.items.get(i.key).zMoveType)).toEqual(order);
  const exclusive = gimmicks.filter(i => dex.items.get(i.key).zMove && dex.items.get(i.key).itemUser?.length);
  expect(exclusive.length).toBeGreaterThan(0);
  ascending(exclusive.map(i => Math.min(...dex.items.get(i.key).itemUser!.map(u => dex.species.get(u).num))));
  expect(gimmicks.map(i => i.key)).toEqual([...mega, ...z, ...exclusive].map(i => i.key).concat(order.map(t => "tera:" + t)));
});

it("sorts TMs by type then ascending power, with status moves first", () => {
  expect(["thunderbolt", "fireblast", "ember", "growl", "tackle", "solarbeam"].sort(compareTmMoves))
    .toEqual(["growl", "tackle", "ember", "fireblast", "solarbeam", "thunderbolt"]);
});

const root = document.createElement("div");
afterEach(async () => { await act(() => render(null, root)); vi.unstubAllGlobals(); });

it("shows the shared type picker only in TMs, supports toggling and combines with search", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No test assets")));
  const g = { player: { money: 100000, bag: {}, squad: [{ species: "Mew" }] } } as unknown as GameState;
  await act(() => render(h(ShopTab, { g }), root));
  const tab = (label: string) => [...root.querySelectorAll("button")].find(b => b.textContent === label)!;
  expect(root.querySelector(".tfilter")).toBeNull();
  await act(() => tab("기술머신").click());
  const filter = () => root.querySelector(".tfilter")!;
  expect(filter()).toBeTruthy();
  const fire = () => filter().querySelector('button[title="불꽃"]') as HTMLButtonElement;
  const before = root.querySelectorAll(".card").length;
  await act(() => fire().click());
  expect(root.querySelectorAll(".card").length).toBeGreaterThan(0);
  expect(root.querySelectorAll(".card").length).toBeLessThan(before);
  expect([...root.querySelectorAll(".card")].every(row => row.textContent?.includes("불꽃"))).toBe(true);
  const search = root.querySelector('input[placeholder="검색"]') as HTMLInputElement;
  await act(() => { search.value = "없는기술"; search.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(root.querySelectorAll(".card")).toHaveLength(0);
  await act(() => { search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); fire().click(); });
  expect(root.querySelectorAll(".card")).toHaveLength(before);
  await act(() => tab("도구").click());
  expect(root.querySelector(".tfilter")).toBeNull();
  expect(root.querySelectorAll(".card").length).toBeGreaterThan(0);
});
