import { describe, it, expect } from "vitest";
import { REGIONS, dex, koSpecies } from "../src/data/dex";
import { scoutStartOptions } from "../src/game/scouting";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { availableMoves, buy, catalog, equip, itemName, tmPrice, useCap, useMint, usePatch } from "../src/game/shop";
import { evolutionOptions } from "../src/game/moves";

describe("scout start", () => {
  it("has starters, early mons and randoms for every region", () => {
    for (const r of REGIONS) {
      const stages = scoutStartOptions(r.id, "s");
      const [a, b] = stages;
      expect(stages.length).toBe(6);
      for (const o of stages) expect(o.length).toBe(3);
      // no species offered twice across the six questions
      const all = stages.flat().map(x => dex.species.get(x.species).id);
      expect(new Set(all).size).toBe(all.length);
      for (const x of stages.flat()) {
        expect(x.level).toBe(5);
        const s = dex.species.get(x.species);
        expect(s.exists).toBe(true);
        expect(s.prevo).toBeFalsy();
      }
      console.log(r.name, a.map(x => koSpecies(x.species)).join(", "), "|", b.map(x => koSpecies(x.species)).join(", "));
    }
  });
});

describe("shop", () => {
  it("buys, equips, uses care items", () => {
    const t = allTrainers().find(x => x.name === "반바지 꼬마 오성")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    st.player.money = 1_000_000;
    console.log("catalog", catalog().length, catalog().filter(i => i.cat === "gimmick").length, itemName("mint:Adamant"), itemName("tera:Fire"), tmPrice("flamethrower"));
    const m = st.player.squad[0];
    expect(buy(st, "Life Orb", 25000)).toBeNull();
    const old = m.item;
    expect(equip(st, m, "Life Orb")).toBeNull();
    expect(m.item).toBe("Life Orb");
    if (old) expect(st.player.bag[old]).toBe(1);
    expect(buy(st, "mint:Jolly", 20000)).toBeNull();
    expect(useMint(st, m, "Jolly")).toBeNull();
    expect(m.nature).toBe("Jolly");
    st.player.bag["cap:gold"] = 1;
    expect(useCap(st, m, "all")).toBeNull();
    expect(Object.values(m.ivs).every(v => v === 31)).toBe(true);
    buy(st, "patch", 80000);
    console.log("patch", usePatch(st, m), m.ability);
    const before = availableMoves(st, m).length;
    buy(st, "tm:protect", tmPrice("protect"));
    expect(availableMoves(st, m).length).toBeGreaterThanOrEqual(before);
    console.log("evo pikachu", JSON.stringify(evolutionOptions("Pikachu", 10)), JSON.stringify(evolutionOptions("Onix", 30)));
  });
});

import { REMOVED_ITEMS, catalog as cat2 } from "../src/game/shop";
import { createGame as cg2, migrate as mg2 } from "../src/game/state";
import { allTrainers as at2 } from "../src/game/lineups";
import { npcTeam } from "../src/game/npc";
it("removed items: not sold, not held by NPCs, refunded in old saves", () => {
  const names = Object.keys(REMOVED_ITEMS);
  expect(cat2().filter(i => names.includes(i.key))).toEqual([]);
  const g = cg2({ mode: "trainer", slotId: at2().find(t => t.name === "그린")!.id, name: "나" });
  for (const t of at2()) if (t.id !== g.player.slotId) expect(npcTeam(g, t.id).filter(m => names.includes(m.item))).toEqual([]);
  const old = JSON.parse(JSON.stringify(g));
  old.player.bag = { "Air Balloon": 2 };
  old.player.squad[0].item = "Clear Amulet";
  const money = old.player.money;
  const m = mg2(old);
  expect(m.player.money).toBe(money + 2 * 12000 + 25000);
  expect(m.player.bag["Air Balloon"]).toBeUndefined();
  expect(m.player.squad[0].item).toBe("");
});
