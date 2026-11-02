// Fills empty held items of NPC trainers with items real players use.
//   node scripts/fill-items.mjs kanto johto        (regions; writes src/data/trainers.json)
// Source: Showdown ladder usage sets (@smogon/sets, MIT-licensed "stats" data only), matched by
// moveset overlap like the nature picker. Items that don't fit the moveset are skipped, and the
// same item is avoided twice in one team where a fitting alternative exists.
import fs from "node:fs";
import { pick } from "./item-usage.mjs";

const DATA = "src/data/trainers.json";
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const regions = process.argv.slice(2);
if (!regions.length) throw new Error("usage: node scripts/fill-items.mjs <region> [...]");

const report = [];
let filled = 0;
for (const r of data.regions.filter(r => regions.includes(r.id))) {
  for (const t of r.trainers) {
    const taken = new Set(t.team.filter(m => m && m.item).map(m => Dex.items.get(m.item).name));
    const row = [];
    for (const m of t.team) {
      if (!m || m.item) continue;
      const p = pick(m, taken);
      m.item = p.item;
      taken.add(p.item);
      filled++;
      row.push(`${m.species}: ${p.item}${p.from === "rule" ? " (규칙)" : ""}`);
    }
    if (row.length) report.push(`${r.id} ${t.name} — ${row.join(", ")}`);
  }
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 1));
console.log(report.join("\n"));
console.log("filled", filled);
