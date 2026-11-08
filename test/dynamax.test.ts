// Dynamax: only a 다이버섯 holder can (once per battle, 3 turns); 다이수프-fed Gigantamax-capable ones Gigantamax.
import { describe, expect, it } from "vitest";
import { BattleSession, gimmickOptions } from "../src/battle/engine";
import { BattleDirector } from "../src/render/director";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { addItem, catalog, useMaxSoup, SHOP_CATS } from "../src/game/shop";
import type { TeamMember } from "../src/game/types";

const iv = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ev = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const mon = (species: string, moves: string[], item = "", extra: any = {}): TeamMember => ({ uid: species, species, level: 50, ability: "", item, nature: "Hardy", moves, evs: ev, ivs: iv, gender: "", teraType: null, ...extra } as any);
function anything(): any {
  const fn: any = function () { return proxy; };
  const proxy: any = new Proxy(fn, { get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : k === "skipping" ? false : proxy), apply: () => Promise.resolve(proxy) });
  return proxy;
}

describe("dynamax", () => {
  for (const doubles of [false, true]) {
    it(`${doubles ? "doubles" : "singles"}: the mushroom holder Gigantamaxes; nobody else Dynamaxes`, async () => {
      let gmaxSeen = 0;
      for (let seed = 0; seed < 6; seed++) {
        const t1 = [
          mon("Charizard", ["flamethrower", "airslash", "heatwave", "roost"], "gim:maxmushroom", { gmax: true }),
          mon("Snorlax", ["bodyslam", "earthquake", "rest", "curse"]),
          mon("Gengar", ["shadowball", "sludgebomb", "protect", "thunderbolt"]),
          mon("Urshifu", ["wickedblow", "closecombat", "suckerpunch", "protect"]),
        ];
        const t2 = [mon("Blissey", ["seismictoss", "softboiled", "toxic", "protect"]), mon("Garchomp", ["earthquake", "dragonclaw", "rockslide", "protect"]), mon("Rotom-Wash", ["hydropump", "thunderbolt", "voltswitch", "protect"]), mon("Tyranitar", ["rockslide", "crunch", "earthquake", "protect"])];
        const s = new BattleSession({ name: "a", team: t1, gimmick: null as any, skill: 1, picks: doubles ? [0, 1, 2, 3] : [0, 1, 2] }, { name: "b", team: t2, gimmick: null as any, skill: 1 }, `dmx${doubles}${seed}`, { doubles });
        s.start();
        const r = s.runToEnd();
        expect(r.turns).toBeGreaterThan(0);
        const log: string[] = s.battle.log;
        const dyn = log.filter(l => /\|-start\|p\d[ab]?: [^|]+\|Dynamax/.test(l));
        expect(dyn.every(l => /^\|-start\|p1[ab]?: m0\|/.test(l))).toBe(true);
        expect(dyn.length).toBeLessThanOrEqual(1);
        if (dyn.some(l => l.includes("Gmax"))) gmaxSeen++;
        const d = new BattleDirector(anything(), s, [{ trainerName: "A", trainerSprite: null, team: t1 }, { trainerName: "B", trainerSprite: null, team: t2 }], async () => "__ai__", () => false);
        const errors: string[] = [];
        const warn = console.warn;
        console.warn = (...a: any[]) => errors.push(a.map(String).join(" "));
        try { await d.playLines(log.slice()); } finally { console.warn = warn; }
        expect(errors).toEqual([]);
      }
      expect(gmaxSeen).toBeGreaterThan(0);
    }, 120000);
  }
  it("gimmick options and items", () => {
    expect(gimmickOptions([mon("Charizard", ["ember"], "gim:maxmushroom")], [0])).toEqual(["dynamax"]);
    expect(gimmickOptions([mon("Charizard", ["ember"], "")], [0])).toEqual([]);
    const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });
    const m = { ...st.player.squad[0], species: "Snorlax" } as any;
    addItem(st, "gim:maxsoup");
    expect(useMaxSoup(st, m)).toBeNull();
    expect(m.gmax).toBe(true);
    const m2 = { ...st.player.squad[0], species: "Blissey" } as any;
    addItem(st, "gim:maxsoup");
    expect(useMaxSoup(st, m2)).toMatch(/할 수 없는/);
    const gim = catalog().filter(i => i.cat === "gimmick").map(i => i.key);
    const zLast = Math.max(...gim.map((k, i) => (/ium Z$|ium Z \(|Z$/.test(k) ? i : -1)));
    expect(gim.indexOf("gim:maxsoup")).toBeGreaterThan(zLast);
    expect(gim.indexOf("gim:maxmushroom")).toBe(gim.indexOf("gim:maxsoup") + 1);
    expect(gim[gim.indexOf("gim:maxmushroom") + 1]).toMatch(/^tera:/);
    expect(catalog().find(i => i.key === "gim:maxsoup")!.price).toBe(30000);
    expect(catalog().find(i => i.key === "gim:maxmushroom")!.price).toBe(50000);
    expect(SHOP_CATS.find(c => c[0] === "gimmick")![1]).toBe("배틀 기믹");
  });
});
