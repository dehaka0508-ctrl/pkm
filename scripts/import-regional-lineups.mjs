// Apply the user-curated Korean lineups to the game's trainer definitions.
// Levels/types stay in the source files; battle levels and types come from the game/Dex.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { Dex } from "@pkmn/sim";
import { buildNameTables, parseGender } from "../src/data/lineup-sheet.js";

export const LINEUP_FILES = [
  "data/lineups/trainer_lineups_hoenn.json",
  "data/lineups/trainer_lineups_sinnoh.json",
];
const read = path => JSON.parse(fs.readFileSync(path, "utf8"));

export function importRegionalLineups(base, documents, T) {
  const data = structuredClone(base);
  const touched = new Set();
  for (const document of documents) {
    if (document.schema_version !== 1) throw new Error("Unsupported lineup schema");
    for (const source of document.trainers) {
      const region = data.regions.find(r => r.name === source.region);
      const trainer = region?.trainers.find(t => t.name === source.name);
      if (!trainer) throw new Error(`Unknown trainer: ${source.region} ${source.name}`);
      if (touched.has(trainer.id)) throw new Error(`Duplicate trainer: ${trainer.id}`);
      if (source.pokemon.length !== 6) throw new Error(`${source.name}: expected six Pokémon`);
      const convert = (table, value, field) => {
        if (value == null || value === "") return null;
        const result = table.fromAny(value);
        if (!result) throw new Error(`${source.name}: unknown ${field}: ${value}`);
        return result;
      };
      trainer.team = source.pokemon.map(mon => {
        const species = convert(T.sp, mon.species, "species");
        const sp = Dex.species.get(species);
        if (!sp.exists || sp.isMega) throw new Error(`${source.name}: expected a non-Mega species`);
        const item = convert(T.it, mon.held_item, "item");
        if (item && Dex.items.get(item).megaStone) throw new Error(`${source.name}: Mega Stone is excluded`);
        const ability = convert(T.ab, mon.ability, "ability");
        if (ability && !Object.values(sp.abilities).includes(ability)) {
          throw new Error(`${source.name}: ${ability} is not an ability of ${species}`);
        }
        const moves = (mon.moves ?? []).map(move => convert(T.mv, move, "move"));
        if (moves.length > 4) throw new Error(`${source.name}: too many moves`);
        while (moves.length < 4) moves.push(null);
        return {
          species,
          gender: parseGender(mon.gender),
          item,
          ability,
          nature: convert(T.na, mon.nature, "nature"),
          moves,
          teraType: null,
        };
      });
      trainer.gimmick = null;
      trainer.source = "사용자 제공 이미지·수정 라인업 (메가진화 제외)";
      touched.add(trainer.id);
    }
  }
  return { data, count: touched.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const T = buildNameTables(Dex, {
    species: read("src/data/gen/species.json"),
    moves: read("src/data/gen/moves-ko.json"),
    abilities: read("src/data/gen/abilities-ko.json"),
    misc: read("src/data/gen/misc-ko.json"),
  });
  const { data, count } = importRegionalLineups(read("src/data/trainers.json"), LINEUP_FILES.map(read), T);
  fs.writeFileSync("src/data/trainers.json", JSON.stringify(data, null, 1));
  console.log(`Updated ${count} trainers from regional lineup files`);
}
