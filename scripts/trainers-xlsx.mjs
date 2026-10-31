// Export/import the trainer lineups as an Excel file with Korean names.
//   node scripts/trainers-xlsx.mjs export   -> data/trainers.xlsx
//   node scripts/trainers-xlsx.mjs import   <- data/trainers.xlsx (updates src/data/trainers.json)
import fs from "node:fs";
import { Dex } from "@pkmn/sim";
import { writeXlsx, readXlsx } from "../src/data/xlsx.js";
import { buildNameTables, trainersToRows, rowsToTrainers, HELP_ROWS } from "../src/data/lineup-sheet.js";

const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const gen = {
  species: read("src/data/gen/species.json"),
  moves: read("src/data/gen/moves-ko.json"),
  abilities: read("src/data/gen/abilities-ko.json"),
  misc: read("src/data/gen/misc-ko.json"),
};
const T = buildNameTables(Dex, gen);
const DATA = "src/data/trainers.json";
const XLSX = "data/trainers.xlsx";
const mode = process.argv[2] || "export";

if (mode === "export") {
  const data = read(DATA);
  const species = Dex.species.all().filter(s => gen.species[s.id]).sort((a, b) => a.num - b.num || (a.forme ? 1 : 0) - (b.forme ? 1 : 0));
  const moves = Dex.moves.all().filter(m => gen.moves[m.id] && !m.isZ && !m.isMax).sort((a, b) => a.num - b.num);
  const items = Dex.items.all().filter(i => !i.isNonstandard || ["Past", "Unobtainable"].includes(i.isNonstandard)).sort((a, b) => a.name.localeCompare(b.name));
  const abil = Dex.abilities.all().filter(a => gen.abilities[a.id]).sort((a, b) => a.num - b.num);
  const sheets = [
    { name: "라인업", rows: trainersToRows(data, T), widths: [8, 8, 14, 18, 16, 36, 5, 18, 16, 14, 8, 14, 14, 14, 14, 9], freeze: true },
    { name: "도움말", rows: HELP_ROWS, header: false, widths: [110] },
    { name: "포켓몬목록", rows: [["한글", "영문", "타입"], ...species.map(s => [gen.species[s.id].ko, s.name, s.types.map(t => gen.misc.types[t]).join("/")])], widths: [24, 24, 14], freeze: true },
    { name: "기술목록", rows: [["한글", "영문", "타입", "분류", "위력", "명중"], ...moves.map(m => [gen.moves[m.id][0], m.name, gen.misc.types[m.type], { Physical: "물리", Special: "특수", Status: "변화" }[m.category], m.basePower || "", m.accuracy === true ? "-" : m.accuracy])], widths: [18, 22, 8, 6, 6, 6], freeze: true },
    { name: "도구목록", rows: [["한글", "영문"], ...items.map(i => [gen.misc.items[i.id] || i.name, i.name])], widths: [22, 22], freeze: true },
    { name: "특성목록", rows: [["한글", "영문"], ...abil.map(a => [gen.abilities[a.id][0], a.name])], widths: [18, 22], freeze: true },
  ];
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(XLSX, writeXlsx(sheets));
  console.log("wrote", XLSX);
} else {
  const book = readXlsx(fs.readFileSync(XLSX));
  const sheet = book.find(s => s.name === "라인업") || book[0];
  const { data, warnings, count } = rowsToTrainers(sheet.rows, T, read(DATA));
  fs.writeFileSync(DATA, JSON.stringify(data, null, 1));
  console.log(`updated ${count} trainers`);
  for (const w of warnings) console.log("  !", w);
}
