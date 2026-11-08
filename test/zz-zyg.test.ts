import { it } from "vitest";
import { BattleSession } from "../src/battle/engine";
it("zyg", async () => {
  const mk = (species: string, item: string, extra: any = {}) => ({ uid: species, species, level: 50, ability: "", item, nature: "Adamant", moves: ["thousandarrows", "dragondance", "protect", "extremespeed"], evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: "", teraType: null, ...extra });
  const s = new BattleSession({ name: "a", team: [mk("Zygarde-Complete", "Zygardite"), mk("Shaymin-Sky", ""), mk("Calyrex-Ice", "")], gimmick: "mega", human: false } as any, { name: "b", team: [mk("Blissey", ""), mk("Chansey", ""), mk("Snorlax", "")], human: false } as any, "z", {} as any);
  const p = s.battle.sides[0].pokemon;
  console.log("ZYG", p.map((x: any) => `${x.species.name}/${x.ability}/${x.canMegaEvo}`).join(" "));
  const r = await (s as any).run?.();
  console.log("LOG", s.battle.log.filter((l: string) => /mega|detailschange|error|win/i.test(l)).slice(0, 6).join(" || "));
});
