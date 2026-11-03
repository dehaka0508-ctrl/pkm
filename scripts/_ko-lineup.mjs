// Writes lineups given in Korean names (species, ability, item, moves) into trainers.json, checking every name.
import fs from "node:fs";
import { Dex } from "@pkmn/sim";
const [specFile, source] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
const sp = JSON.parse(fs.readFileSync("src/data/gen/species.json", "utf8"));
const mv = JSON.parse(fs.readFileSync("src/data/gen/moves-ko.json", "utf8"));
const ab = JSON.parse(fs.readFileSync("src/data/gen/abilities-ko.json", "utf8"));
const misc = JSON.parse(fs.readFileSync("src/data/gen/misc-ko.json", "utf8"));
const rev = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [f(v), k]).filter(([n]) => n));
const S = rev(sp, v => v.ko), M = rev(mv, v => (Array.isArray(v) ? v[0] : v)), A = rev(ab, v => (Array.isArray(v) ? v[0] : v)), I = rev(misc.items, v => v);
// gems ("비행주얼") are missing from the Korean item table: type name + Gem
const T = rev(misc.types, v => v);
for (const [ko, en] of Object.entries(T)) I[`${ko}주얼`] = `${en} Gem`;
const bad = [];
const need = (tab, k, what) => (tab[k] ? tab[k] : (bad.push(`${what} '${k}'`), null));
const d = JSON.parse(fs.readFileSync("src/data/trainers.json", "utf8"));
for (const [id, mons] of Object.entries(spec)) {
  const t = d.regions.flatMap(r => r.trainers).find(x => x.id === id);
  if (!t) { bad.push(`trainer ${id}`); continue; }
  t.team = mons.map(([s, g, a, it, moves]) => {
    const spec = Dex.species.get(need(S, s, "포켓몬") || "");
    const abil = Dex.abilities.get(need(A, a, "특성") || "");
    if (spec.exists && abil.exists && !Object.values(spec.abilities).includes(abil.name)) bad.push(`${s}: 특성 ${a}(${abil.name}) 불가`);
    return {
      species: spec.name, gender: g || null, item: it ? Dex.items.get(need(I, it, "도구") || "").name : null,
      ability: abil.name, nature: null, moves: moves.map(m => Dex.moves.get(need(M, m, "기술") || "").name), teraType: null,
    };
  });
  t.source = source;
  console.log(id, t.team.map(m => `${m.species}/${m.ability}/${m.item || "-"}: ${m.moves.join(",")}`).join("\n   "));
}
if (bad.length) { console.error("UNKNOWN:", bad.join("; ")); process.exit(1); }
fs.writeFileSync("src/data/trainers.json", JSON.stringify(d, null, 1));
