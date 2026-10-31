// Updates trainer lineups from a Korean text spec.
//   node scripts/set-trainer.mjs spec.txt
// Spec (one or more blocks, blank line between blocks):
//   관동 칸나 | 출처(선택)
//   쥬레곤 ♂ | 두꺼운지방 | 없음 | 파도타기, 냉동빔, 시그널빔, 그림자분신 | 테라타입(선택)
// Columns per Pokémon: 포켓몬 [성별] | 특성 | 도구 | 기술(쉼표) | 테라타입. "-"/"없음"/빈칸 = 비움.
// A block replaces the trainer's whole team (missing slots become empty).
import fs from "node:fs";
import { Dex } from "@pkmn/sim";
import { buildNameTables, parseGender } from "../src/data/lineup-sheet.js";

const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const gen = {
  species: read("src/data/gen/species.json"),
  moves: read("src/data/gen/moves-ko.json"),
  abilities: read("src/data/gen/abilities-ko.json"),
  misc: read("src/data/gen/misc-ko.json"),
};
const T = buildNameTables(Dex, gen);
const DATA = "src/data/trainers.json";
const data = read(DATA);
const spec = fs.readFileSync(process.argv[2], "utf8");
const empty = v => !v || ["-", "없음", "x"].includes(v.trim());
const errors = [];

for (const block of spec.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)) {
  const lines = block.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const [head, source] = lines[0].split("|").map(s => s.trim());
  const [regionName, ...nameParts] = head.split(/\s+/);
  const name = nameParts.join(" ");
  const region = data.regions.find(r => r.name === regionName || r.id === regionName);
  const t = region?.trainers.find(x => x.name === name);
  if (!t) {
    errors.push(`트레이너 없음: ${head}`);
    continue;
  }
  const team = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("|").map(s => s.trim());
    const m = cols[0].match(/^(.*?)\s*([♂♀])?$/);
    const conv = (table, raw, label) => {
      if (empty(raw)) return null;
      const v = table.fromAny(raw);
      if (v === undefined || v === null) errors.push(`${t.name}: ${label} '${raw}' 알 수 없음`);
      return v ?? null;
    };
    const species = conv(T.sp, m[1], "포켓몬");
    if (!species) continue;
    const moves = (cols[3] || "").split(/[,/]/).map(s => s.trim()).filter(s => !empty(s)).map(x => conv(T.mv, x, "기술"));
    while (moves.length < 4) moves.push(null);
    team.push({
      species,
      gender: parseGender(m[2]),
      item: conv(T.it, cols[2], "도구"),
      ability: conv(T.ab, cols[1], "특성"),
      nature: null,
      moves: moves.slice(0, 4),
      teraType: conv(T.ty, cols[4], "테라타입"),
    });
  }
  while (team.length < 6) team.push(null);
  t.team = team.slice(0, 6);
  if (source !== undefined) t.source = source;
  console.log(`${region.name} ${t.name}: ${t.team.filter(Boolean).map(x => T.sp.toKo(x.species)).join(", ")}`);
}
if (errors.length) {
  console.error("오류 — 저장하지 않음:\n  " + errors.join("\n  "));
  process.exit(1);
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 1));
console.log("saved", DATA);
