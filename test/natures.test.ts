import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { pickNature, moveProfile } from "../src/game/natures";
import { dex, koSpecies, koNature } from "../src/data/dex";

it("assigns fitting automatic natures and preserves explicitly specified natures", () => {
  const counts: Record<string, number> = {};
  let usage = 0, rule = 0, total = 0;
  const bad: string[] = [];
  for (const t of allTrainers()) {
    t.team.forEach((def, i) => {
      const m = resolveTeam(t)[i];
      total++;
      if (!def?.nature) pickNature(m.species, m.moves).source === "usage" ? usage++ : rule++;
      counts[m.nature] = (counts[m.nature] || 0) + 1;
      const n = dex.natures.get(m.nature);
      const p = moveProfile(m.moves);
      if (def?.nature) {
        expect(m.nature).toBe(def.nature);
      } else {
        if (p.phys > p.spec && n.minus === "atk") bad.push(`${t.name} ${m.species} ${m.nature}`);
        if (p.spec > p.phys && n.minus === "spa") bad.push(`${t.name} ${m.species} ${m.nature}`);
        expect(m.nature).not.toBe("Serious");
      }
    });
  }
  console.log("total", total, "usage", usage, "rule", rule);
  console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${koNature(k)} ${v}`).join(", "));
  for (const name of ["레드", "그린", "칸나", "초련", "마티스", "로사&로이"]) {
    const t = allTrainers().find(x => x.name === name)!;
    console.log(name, resolveTeam(t).map(m => `${koSpecies(m.species)}:${koNature(m.nature)}`).join(" "));
  }
  expect(bad).toEqual([]);
});
