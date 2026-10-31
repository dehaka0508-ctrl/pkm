// Converts trainer lineup data <-> spreadsheet rows (Korean names), shared by the game
// (in-game import/export) and scripts/trainers-xlsx.mjs.

export const HEADER = ["지방", "역할", "트레이너", "ID", "스프라이트", "출처", "슬롯", "포켓몬", "성별", "도구", "특성", "성격", "기술1", "기술2", "기술3", "기술4", "테라타입"];

/** "♂"/"수컷"/"M" -> "M", "♀"/"암컷"/"F" -> "F", else null */
export function parseGender(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["♂", "수컷", "남", "m", "male"].includes(s)) return "M";
  if (["♀", "암컷", "여", "f", "female"].includes(s)) return "F";
  return null;
}

const toID = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Older / alternative Korean spellings -> English name. Add here when a source uses a different spelling. */
export const ALIASES = {
  에어컷터: "Air Cutter",
};
const clean = s => String(s ?? "").replace(/\s+/g, "").trim();

/**
 * Builds name lookup tables.
 * @param Dex Showdown Dex (from @pkmn/sim)
 * @param gen {species, moves, abilities, misc} generated Korean tables
 */
export function buildNameTables(Dex, gen) {
  const make = (entries, getKo) => {
    const ko = {}; // id -> korean
    const from = {}; // normalized korean or id -> english name
    for (const e of entries) {
      const k = getKo(e);
      if (!k) continue;
      ko[e.id] = k;
      const nk = clean(k);
      if (!(nk in from)) from[nk] = e.name;
    }
    for (const e of entries) if (!(e.id in from)) from[e.id] = e.name;
    return {
      toKo: name => (name ? ko[toID(name)] || name : ""),
      fromAny: str => {
        if (str === null || str === undefined || String(str).trim() === "") return null;
        const alias = ALIASES[clean(str)];
        return from[clean(str)] || from[toID(str)] || (alias && from[toID(alias)]) || undefined;
      },
    };
  };
  const species = Dex.species
    .all()
    .filter(s => gen.species[s.id])
    .sort((a, b) => (a.forme ? 1 : 0) - (b.forme ? 1 : 0) || a.num - b.num);
  return {
    sp: make(species, s => gen.species[s.id]?.ko),
    mv: make(Dex.moves.all().filter(m => gen.moves[m.id]), m => gen.moves[m.id]?.[0]),
    ab: make(Dex.abilities.all().filter(a => gen.abilities[a.id]), a => gen.abilities[a.id]?.[0]),
    it: make(Dex.items.all(), i => gen.misc.items[i.id]),
    na: make(Dex.natures.all(), n => gen.misc.natures[n.id]),
    ty: make(Dex.types.all(), t => gen.misc.types[t.name]),
  };
}

export function trainersToRows(data, T) {
  const rows = [HEADER];
  for (const r of data.regions) {
    for (const t of r.trainers) {
      t.team.forEach((m, i) => {
        rows.push([
          r.name, t.role, t.name, t.id, t.sprite, t.source || "", i + 1,
          m ? T.sp.toKo(m.species) : "",
          m && m.gender ? (m.gender === "M" ? "♂" : "♀") : "",
          m ? T.it.toKo(m.item) : "",
          m ? T.ab.toKo(m.ability) : "",
          m ? T.na.toKo(m.nature) : "",
          ...(m ? m.moves.map(x => T.mv.toKo(x)) : ["", "", "", ""]),
          m ? T.ty.toKo(m.teraType) : "",
        ]);
      });
    }
  }
  return rows;
}

/**
 * Applies spreadsheet rows onto base data. Rows are matched by ID (column D),
 * falling back to region+trainer name. Returns {data, warnings}.
 */
export function rowsToTrainers(rows, T, base) {
  const data = JSON.parse(JSON.stringify(base));
  const warnings = [];
  const head = rows[0].map(String);
  const col = name => head.indexOf(name);
  const c = Object.fromEntries(HEADER.map(h => [h, col(h)]));
  if (c["트레이너"] < 0 || c["포켓몬"] < 0) throw new Error("'트레이너'와 '포켓몬' 열이 필요합니다.");
  const byId = {};
  const byName = {};
  for (const r of data.regions) for (const t of r.trainers) {
    byId[t.id] = { r, t };
    byName[r.name + "|" + t.name] = { r, t };
  }
  const touched = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const get = h => (c[h] >= 0 ? String(row[c[h]] ?? "").trim() : "");
    const id = get("ID");
    const hit = byId[id] || byName[get("지방") + "|" + get("트레이너")];
    if (!hit) {
      if (row.some(v => String(v ?? "").trim())) warnings.push(`${i + 1}행: 트레이너를 찾지 못함 (${get("지방")} ${get("트레이너")})`);
      continue;
    }
    const { t } = hit;
    if (!touched.has(t.id)) {
      touched.add(t.id);
      if (get("출처")) t.source = get("출처");
      if (get("스프라이트")) t.sprite = get("스프라이트");
      if (get("역할")) t.role = get("역할");
    }
    const slot = Number(get("슬롯")) - 1;
    if (!(slot >= 0 && slot < 6)) {
      warnings.push(`${i + 1}행: 슬롯은 1~6이어야 함`);
      continue;
    }
    const spRaw = get("포켓몬");
    if (!spRaw) {
      t.team[slot] = null;
      continue;
    }
    const conv = (table, raw, label) => {
      if (!raw) return null;
      const v = table.fromAny(raw);
      if (v === undefined) {
        warnings.push(`${i + 1}행 ${t.name}: ${label} '${raw}'을(를) 알 수 없음`);
        return null;
      }
      return v;
    };
    const species = conv(T.sp, spRaw, "포켓몬");
    if (!species) {
      t.team[slot] = null;
      continue;
    }
    t.team[slot] = {
      species,
      gender: parseGender(get("성별")),
      item: conv(T.it, get("도구"), "도구"),
      ability: conv(T.ab, get("특성"), "특성"),
      nature: conv(T.na, get("성격"), "성격"),
      moves: ["기술1", "기술2", "기술3", "기술4"].map(h => conv(T.mv, get(h), "기술")),
      teraType: conv(T.ty, get("테라타입"), "테라타입"),
    };
  }
  return { data, warnings, count: touched.size };
}

export const HELP_ROWS = [
  ["트레이너 라인업 편집 방법"],
  [""],
  ["1. '라인업' 시트에서 트레이너마다 6줄(슬롯 1~6)이 있습니다."],
  ["2. 포켓몬·도구·특성·성격·기술·테라타입은 한글 이름(게임 표기) 또는 영문 이름으로 적으세요. 성별은 ♂/♀ (비우면 무작위)."],
  ["   폼은 '알로라 식스테일', '메가리자몽X', '라이츄 (알로라)' 대신 '알로라 라이츄'처럼 목록 시트의 표기를 따르세요."],
  ["3. 모르는 칸은 비워두세요. 게임은 빈 슬롯을 '임시' 포켓몬으로, 빈 기술을 자동 기술로 채웁니다."],
  ["4. ID·지방·트레이너 열은 줄을 찾는 데 쓰이니 바꾸지 마세요."],
  ["5. 저장한 파일은 게임 [설정 → 라인업 엑셀 불러오기]로 바로 적용하거나,"],
  ["   개발 폴더에서 data/trainers.xlsx 로 저장한 뒤 'npm run trainers:import'로 기본 데이터에 반영하세요."],
  ["6. 레벨은 리그 규칙에 따라 모두 50으로 맞춰집니다."],
];
