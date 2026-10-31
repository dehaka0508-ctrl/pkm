import { describe, it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { koSpecies, koMove } from "../src/data/dex";

describe("engine", () => {
  it("resolves all trainer teams", () => {
    const ts = allTrainers();
    expect(ts.length).toBe(180);
    let ph = 0, auto = 0;
    for (const t of ts) {
      const team = resolveTeam(t);
      expect(team.length).toBe(6);
      for (const m of team) { if (m.placeholder) ph++; if (m.autoMoves) auto++; expect(m.moves.length).toBeGreaterThan(0); }
    }
    console.log("placeholders", ph, "autoMoves", auto);
    const red = resolveTeam(ts.find(t => t.name === "레드")!);
    console.log(red.map(m => `${koSpecies(m.species)}: ${m.moves.map(koMove).join("/")}`).join("\n"));
    const falk = resolveTeam(ts.find(t => t.name === "비상")!);
    console.log(falk.map(m => `${m.placeholder ? "[임시]" : ""}${koSpecies(m.species)}: ${m.moves.map(koMove).join("/")}`).join("\n"));
  });
  it("simulates a league round quickly", () => {
    const ts = allTrainers().filter(t => t.region === "kanto");
    const t0 = performance.now();
    const res: string[] = [];
    let n = 0;
    for (let i = 0; i < ts.length; i += 2) {
      const a = ts[i], b = ts[i + 1];
      const r = simulateMatch(
        { name: a.name, team: resolveTeam(a), gimmick: a.gimmick, skill: roleSkill(a.role) },
        { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: roleSkill(b.role) }, `r${i}`);
      n++;
      res.push(`${a.name} ${r.remaining[0]}-${r.remaining[1]} ${b.name} (${r.turns}턴)`);
    }
    console.log(res.join("\n"));
    console.log("ms/match", ((performance.now() - t0) / n).toFixed(1));
  });
  it("gimmicks work (mega/tera/z)", () => {
    const ts = allTrainers();
    const pick = (n: string) => ts.find(t => t.name === n)!;
    for (const [x, y] of [["카르네", "테사"], ["할라", "라이치"], ["플라드리", "칠리"]]) {
      const a = pick(x), b = pick(y);
      const r = simulateMatch({ name: a.name, team: resolveTeam(a), gimmick: a.gimmick, skill: 0.9 }, { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: 0.9 }, x + y);
      console.log(x, y, r);
    }
  });
});

describe("role IVs", () => {
  it("assigns IVs by role", () => {
    const pick = (n: string) => resolveTeam(allTrainers().find(t => t.name === n)!);
    const iv = (n: string) => [...new Set(pick(n).flatMap(m => Object.values(m.ivs)))];
    expect(iv("난천")).toEqual([31]);
    expect(iv("레드")).toEqual([30]);
    expect(iv("실버")).toEqual([29]);
    expect(iv("칸나")).toEqual([29]);
    expect(iv("게치스")).toEqual([29]);
    expect(iv("웅")).toEqual([27]);
    expect(iv("쿠쿠이박사")).toEqual([27]);
    expect(iv("AZ")).toEqual([25]);
    expect(iv("반바지 꼬마")).toEqual([24]);
  });
});
