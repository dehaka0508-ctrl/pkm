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
      const [a, b, c] = scoutStartOptions(r.id, "s");
      expect(a.length).toBe(3);
      expect(c.length).toBe(3);
      for (const x of [...a, ...b, ...c]) {
        const s = dex.species.get(x.species);
        expect(s.exists).toBe(true);
        expect(s.prevo).toBeFalsy();
      }
      console.log(r.name, b.map(x => koSpecies(x.species)).join(", "));
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
