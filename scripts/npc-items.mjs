// Precomputes, for every NPC Pokémon, the held items real players use with it (best first).
//   node scripts/npc-items.mjs          (reads src/data/trainers.json, writes src/data/npc-items.json)
// The game buys these one by one as each NPC's money allows (src/game/npc.ts).
// Re-run after changing trainer lineups.
import fs from "node:fs";
import { Dex } from "@pkmn/sim";
import { rankItems } from "./item-usage.mjs";

const data = JSON.parse(fs.readFileSync("src/data/trainers.json", "utf8"));
const out = {};
let n = 0;
for (const r of data.regions) {
  for (const t of r.trainers) {
    t.team.forEach((m, slot) => {
      if (!m || !m.species || !Dex.species.get(m.species).exists) return;
      const mon = { species: m.species, moves: (m.moves || []).filter(Boolean), ability: m.ability || "" };
      out[`${t.id}#${slot}`] = { sp: Dex.species.get(m.species).id, items: rankItems(mon).slice(0, 5) };
      n++;
    });
  }
}
fs.writeFileSync("src/data/npc-items.json", JSON.stringify(out));
console.log("npc item rankings:", n);
