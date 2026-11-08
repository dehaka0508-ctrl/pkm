// Doubles: both actives faint with one Pokémon left on the bench — sending it in and passing the other slot goes on.
import { describe, expect, it } from "vitest";
import { BattleStreams, Teams } from "@pkmn/sim";

describe("doubles forced switch with one Pokémon left", () => {
  it("accepts 'switch 3, pass'", async () => {
    const mk = (n: number, hp: string) =>
      Array.from({ length: n }, (_, i) => ({ name: `m${i}`, species: i === 2 ? "Blissey" : "Magikarp", item: "", ability: "Swift Swim", moves: ["splash"], nature: "Hardy", evs: {} as any, ivs: {} as any, level: 50, gender: "M" as const, ...(i < 2 ? {} : {}) })) as any;
    const s = new BattleStreams.BattleStream();
    const out: string[] = [];
    (async () => {
      for await (const c of s) out.push(c);
    })();
    const p1 = Teams.pack(mk(3, ""));
    const p2 = Teams.pack([{ name: "a", species: "Kyogre", item: "", ability: "Drizzle", moves: ["waterspout"], nature: "Modest", evs: { spa: 252 } as any, ivs: {} as any, level: 100, gender: "N" as any }, { name: "b", species: "Kyogre", item: "", ability: "Drizzle", moves: ["waterspout"], nature: "Modest", evs: { spa: 252 } as any, ivs: {} as any, level: 100, gender: "N" as any }] as any);
    s.write(`>start {"formatid":"gen9doublescustomgame","seed":[1,2,3,4]}\n>player p1 {"name":"A","team":"${p1}"}\n>player p2 {"name":"B","team":"${p2}"}`);
    await new Promise(r => setTimeout(r, 50));
    s.write(">p1 team 123\n>p2 team 12");
    await new Promise(r => setTimeout(r, 50));
    s.write(">p1 move 1, move 1\n>p2 move 1, move 1");
    await new Promise(r => setTimeout(r, 50));
    const req = out.filter(c => c.includes("|request|") && c.includes('"forceSwitch"')).pop();
    expect(req).toBeTruthy();
    s.write(">p1 switch 3, pass");
    await new Promise(r => setTimeout(r, 50));
    const all = out.join("\n");
    expect(all).not.toMatch(/\|error\|/);
    expect(all).toMatch(/switch\|p1a: m2|switch\|p1b: m2/);
  });
});
