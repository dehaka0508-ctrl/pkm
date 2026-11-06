// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { dex } from "../src/data/dex";
import { RESIST_BERRY } from "../src/data/item-desc-ko";
import { catalog, compareTmMoves, itemDesc, NATURE_NAMES, SHOP_TYPE_ORDER } from "../src/game/shop";
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

it("sells only the 33 requested berries in category order", () => {
  const resistance = ["Chilan Berry", "Occa Berry", "Passho Berry", "Rindo Berry", "Wacan Berry", "Yache Berry", "Chople Berry", "Kebia Berry", "Shuca Berry", "Coba Berry", "Payapa Berry", "Tanga Berry", "Charti Berry", "Kasib Berry", "Haban Berry", "Colbur Berry", "Babiri Berry", "Roseli Berry"];
  const expected = [
    "Cheri Berry", "Chesto Berry", "Pecha Berry", "Rawst Berry", "Aspear Berry", "Persim Berry", "Lum Berry",
    "Liechi Berry", "Petaya Berry", "Ganlon Berry", "Apicot Berry", "Salac Berry", "Starf Berry",
    "Sitrus Berry", "Enigma Berry", ...resistance,
  ];
  expect(expected).toHaveLength(33);
  const berries = catalog().filter(i => i.cat === "berry");
  expect(berries.map(i => i.key)).toEqual(expected);
  expect(berries.every(i => dex.items.get(i.key).isBerry)).toBe(true);
  expect(berries.find(i => i.key === "Sitrus Berry")?.price).toBe(5000);
});

const root = document.createElement("div");
it("sorts evolution items by debut generation and keeps the full evolution stock", () => {
  const items = catalog().filter(i => i.cat === "evo");
  expect(items.length).toBeGreaterThan(10);
  ascending(items.map(i => dex.items.get(i.key).gen));
  for (const species of dex.species.all()) {
    const name = (species as any).evoItem;
    // Dual-purpose held items (e.g. Metal Coat) remain in the held tab.
    if (name && dex.items.get(name).exists) expect(catalog().some(i => i.key === dex.items.get(name).name)).toBe(true);
  }
});

it("describes every mint's raised and lowered stats, including neutral natures", () => {
  expect(itemDesc("mint:Lonely")).toContain("[공격+/방어-]");
  expect(itemDesc("mint:Modest")).toContain("[특공+/공격-]");
  expect(itemDesc("mint:Jolly")).toContain("[스피드+/특공-]");
  const names: Record<string, string> = { atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드" };
  for (const name of NATURE_NAMES) {
    const nature = dex.natures.get(name);
    const expected = nature.plus && nature.minus ? "[" + names[nature.plus] + "+/" + names[nature.minus] + "-]" : "[능력치 변화 없음]";
    expect(itemDesc("mint:" + name)).toContain(expected);
  }
});

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
