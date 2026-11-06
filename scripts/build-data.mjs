// Builds src/data/gen/*.json from Pokémon Showdown data (@pkmn/sim) + PokeRogue locales/assets.
// Usage: POKEROGUE_DIR=../pokerogue-src node scripts/build-data.mjs
import fs from "node:fs";
import path from "node:path";
import { Dex } from "@pkmn/sim";

const PR = path.resolve(process.env.POKEROGUE_DIR || "../pokerogue-src");
const OUT = path.resolve("src/data/gen");
fs.mkdirSync(OUT, { recursive: true });

const readJson = p => JSON.parse(fs.readFileSync(p, "utf8"));
const ko = f => readJson(path.join(PR, "locales/ko", f));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- PokeRogue species enum (for regional form ids) ----------
const enumSrc = fs.readFileSync(path.join(PR, "src/enums/species-id.ts"), "utf8");
const prSpeciesId = {};
{
  let counter = 0;
  for (const line of enumSrc.split("\n")) {
    const m = line.match(/^\s+([A-Z0-9_]+)\s*(?:=\s*(\d+))?\s*,/);
    if (!m) continue;
    counter = m[2] ? Number(m[2]) : counter + 1;
    prSpeciesId[m[1]] = counter;
  }
}

// ---------- sprite availability ----------
const imgDir = path.join(PR, "assets/images/pokemon");
const listPng = d => new Set(fs.readdirSync(d).filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
const front = listPng(imgDir);
const back = listPng(path.join(imgDir, "back"));

// icon atlases: frame name -> atlas index
const iconIndex = {};
for (let i = 0; i <= 9; i++) {
  const p = path.join(PR, `assets/images/pokemon_icons_${i}.json`);
  if (!fs.existsSync(p)) continue;
  const j = readJson(p);
  const frames = j.textures ? j.textures[0].frames : j.frames;
  for (const f of frames) iconIndex[f.filename.replace(/\.png$/, "")] = i;
}

// ---------- Korean name tables ----------
const koPokemon = ko("pokemon.json");
const koPokemonN = {};
for (const [k, v] of Object.entries(koPokemon)) koPokemonN[norm(k)] = v;
const koForm = ko("pokemon-form.json");
const koFormN = {};
for (const [k, v] of Object.entries(koForm)) if (typeof v === "string") koFormN[norm(k)] = v;

const koMoves = ko("move.json");
const koMovesN = {};
for (const [k, v] of Object.entries(koMoves)) {
  koMovesN[norm(k)] = v;
  // PokeRogue splits the type Z-Moves into physical / special entries ("hydroVortexPhysical")
  const z = norm(k).replace(/(physical|special)$/, "");
  if (z !== norm(k)) koMovesN[z] ||= v;
}
koMovesN["10000000voltthunderbolt"] ||= koMovesN.tenmillionvoltthunderbolt;
const koAbil = ko("ability.json");
const koAbilN = {};
for (const [k, v] of Object.entries(koAbil)) koAbilN[norm(k)] = v;
const koNature = ko("nature.json");
const koInfo = ko("pokemon-info.json");

// items: collect from several PokeRogue tables
const koItemsN = {};
{
  const mt = ko("modifier-type.json");
  for (const [k, v] of Object.entries(mt.ModifierType)) if (v && typeof v === "object" && v.name && !v.name.includes("{{")) koItemsN[norm(k)] = v.name;
  for (const sec of ["SpeciesBoosterItem", "AttackTypeBoosterItem", "EvolutionItem", "FormChangeItem", "BaseStatBoosterItem"]) {
    for (const [k, v] of Object.entries(mt[sec] || {})) {
      const name = typeof v === "string" ? v : v?.name;
      if (name && name !== "None") koItemsN[norm(k)] = name;
    }
  }
  try {
    const berry = ko("berry.json");
    for (const [k, v] of Object.entries(berry)) if (v?.name) koItemsN[norm(k) + "berry"] = v.name;
  } catch {}
}
// type gems (Gen 5 items, legal in National Dex): official Korean names
for (const [t, ko] of Object.entries({ normal: "노말", fire: "불꽃", water: "물", electric: "전기", grass: "풀", ice: "얼음", fighting: "격투", poison: "독", ground: "땅", flying: "비행", psychic: "에스퍼", bug: "벌레", rock: "바위", ghost: "고스트", dragon: "드래곤", dark: "악", steel: "강철", fairy: "페어리" }))
  koItemsN[`${t}gem`] = `${ko}주얼`;
// common competitive items missing from PokeRogue
Object.assign(koItemsN, {
  golisopite: "갑주무사나이트",
  lifeorb: "생명의구슬", choiceband: "구애머리띠", choicespecs: "구애안경", choicescarf: "구애스카프",
  focussash: "기합의띠", assaultvest: "돌격조끼", rockyhelmet: "울퉁불퉁멧", sitrusberry: "자뭉열매",
  lumberry: "리샘열매", cheriberry: "버치열매", pechaberry: "복슝열매", rawstberry: "복분열매", aspearberry: "배리열매",
  persimberry: "시몬열매", leppaberry: "과사열매", pinapberry: "파인열매", kelpsyberry: "시마열매", blacksludge: "검은진흙", expertbelt: "달인의띠", lightclay: "빛의점토",
  weaknesspolicy: "약점보험", airballoon: "풍선", heavydutyboots: "통굽부츠", boosterenergy: "부스트에너지",
  clearamulet: "클리어참", covertcloak: "은밀망토", loadeddice: "속임수주사위", mirrorherb: "따라하기허브",
  ejectbutton: "탈출버튼", redcard: "레드카드", muscleband: "힘의머리띠", wiseglasses: "박식안경",
  brightpowder: "반짝가루", oranberry: "오랭열매", chestoberry: "유루열매", salacberry: "캄라열매",
  liechiberry: "치리열매", petayaberry: "야타비열매", ganlonberry: "용아열매", apicotberry: "규살열매",
  starfberry: "스타열매", custapberry: "애슈열매", figyberry: "무화열매", aguavberry: "아바열매",
  occaberry: "오카열매", passhoberry: "꼬시개열매", wacanberry: "초나열매", rindoberry: "린드열매",
  yacheberry: "플카열매", chopleberry: "로플열매", kebiaberry: "으름열매", shucaberry: "슈캐열매",
  cobaberry: "바코열매", payapaberry: "파야프열매", tangaberry: "리체열매", chartiberry: "카리열매",
  kasibberry: "수불열매", habanberry: "하반열매", colburberry: "마코열매", babiriberry: "바리비열매",
  roseliberry: "로셀열매", chilanberry: "카리열매", leftovers: "먹다남은음식", scopelens: "초점렌즈",
  widelens: "광각렌즈", zoomlens: "포커스렌즈", metronome: "메트로놈", shellbell: "조개껍질방울",
  damprock: "축축한바위", heatrock: "뜨거운바위", smoothrock: "보송보송바위", icyrock: "차가운바위",
  terrainextender: "그라운드코트", eviolite: "진화의휘석", mentalherb: "멘탈허브", whiteherb: "하양허브",
  powerherb: "파워풀허브", toxicorb: "맹독구슬", flameorb: "화염구슬", quickclaw: "선제공격손톱",
  kingsrock: "왕의징표석", razorclaw: "예리한손톱", lightball: "전기구슬", thickclub: "굵은뼈",
  souldew: "마음의물방울", adamantorb: "금강옥", lustrousorb: "백옥", griseousorb: "백금옥",
  protectivepads: "방호패드", throatspray: "목스프레이", roomservice: "룸서비스", utilityumbrella: "만능우산",
  blunderpolicy: "공격불발보험", ejectpack: "탈출팩", abilityshield: "특성가드", punchingglove: "펀치글러브",
  safetygoggles: "방진고글", bigroot: "큰뿌리", gripclaw: "끈기갈고리손톱", bindingband: "조임밴드",
  ironball: "검은철구", laggingtail: "느림보꼬리", stickybarb: "끈적끈적바늘", ringtarget: "겨냥표적",
  focusband: "기합의머리띠", silkscarf: "실크스카프", normalgem: "노말주얼",
  normaliumz: "노말Z", firiumz: "불꽃Z", wateriumz: "물Z", electriumz: "전기Z", grassiumz: "풀Z",
  iciumz: "얼음Z", fightiniumz: "격투Z", poisoniumz: "독Z", groundiumz: "땅Z", flyiniumz: "비행Z",
  psychiumz: "에스퍼Z", buginiumz: "벌레Z", rockiumz: "바위Z", ghostiumz: "고스트Z", dragoniumz: "드래곤Z",
  darkiniumz: "악Z", steeliumz: "강철Z", fairiumz: "페어리Z", pikaniumz: "피카츄Z", aloraichiumz: "알로라라이츄Z",
  eeviumz: "이브이Z", snorliumz: "잠만보Z", mewniumz: "뮤Z", decidiumz: "모크나이퍼Z", inciniumz: "어흥염Z",
  primariumz: "누리레느Z", tapuniumz: "카푸Z", marshadiumz: "마샤도Z", kommoniumz: "짜랑고우거Z",
  lycaniumz: "루가루암Z", mimikiumz: "따라큐Z", lunaliumz: "루나아라Z", solganiumz: "솔가레오Z",
  ultranecroziumz: "울트라네크로Z", pikashuniumz: "사토시피카츄Z",
});

// ---------- types ----------
const typeKo = {};
for (const t of Dex.types.all()) {
  const v = koInfo.type?.[t.id];
  typeKo[t.name] = v || t.name;
}

// ---------- species ----------
const REGION = { alola: "ALOLA", galar: "GALAR", hisui: "HISUI", paldea: "PALDEA", bloodmoon: "BLOODMOON" };
const FORM_KO = {
  Zen: "달마모드", Aqua: "워터종", Blaze: "블레이즈종", Combat: "컴뱃종", "Rapid-Strike": "연격의 태세",
  Midnight: "한밤중의 모습", Dusk: "황혼의 모습", "Low-Key": "로우한 모습", Therian: "영물폼", Origin: "오리진폼",
  Wellspring: "우물의가면", Hearthflame: "화덕의가면", Cornerstone: "주춧돌의가면", Sky: "스카이폼",
  F: "암컷", Totem: "우두머리", School: "군집의 모습", Crowned: "검왕/방패왕", Bloodmoon: "붉은달",
  "Paldea-Combat": "컴뱃종", "Paldea-Blaze": "블레이즈종", "Paldea-Aqua": "워터종", Hero: "마이티폼",
  Busted: "들킨 모습", Black: "블랙", White: "화이트", Resolute: "각오의 모습", Pirouette: "스텝폼",
  Unbound: "굴레를 벗어난 모습", "Dusk-Mane": "황혼의 갈기", "Dawn-Wings": "새벽의 날개", Ultra: "울트라",
  Stellar: "스텔라폼", Terastal: "테라스탈폼", Eternamax: "무한다이맥스",
  Small: "소과종", Large: "대과종", Super: "특대과종",
};
const REGION_KO = { alola: "알로라", galar: "가라르", hisui: "히스이", paldea: "팔데아", bloodmoon: "붉은달" };

function enumName(baseName) {
  return baseName.toUpperCase().replace(/[’'.:]/g, "").replace(/É/g, "E").replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");
}

function formSlug(forme) {
  return forme.toLowerCase()
    .replace(/^gmax$/, "gigantamax")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function spriteKeyFor(s) {
  const base = Dex.species.get(s.baseSpecies);
  let id = s.num;
  let forme = s.forme || "";
  const parts = forme.split("-");
  const reg = REGION[parts[0]?.toLowerCase()];
  if (reg) {
    const rid = prSpeciesId[`${reg}_${enumName(base.name)}`];
    if (rid) {
      id = rid;
      forme = parts.slice(1).join("-");
    }
  }
  const cands = [];
  if (forme) {
    const slug = formSlug(forme);
    cands.push(`${id}-${slug}`, `${id}-${slug.replace(/-/g, "")}`, `${id}-${slug}-mask`);
    if (slug === "f") cands.push(`${id}-female`);
    const pref = [...front].filter(f => f.startsWith(`${id}-${slug}`)).sort();
    cands.push(...pref);
  }
  if (!forme && s.baseForme) {
    const bslug = formSlug(s.baseForme);
    cands.push(`${id}-${bslug}`, `${id}-${bslug}-mask`);
  }
  cands.push(`${id}`);
  for (const c of cands) if (front.has(c)) return c;
  // base forme might only exist with a default form suffix (e.g. 487-altered)
  const any = [...front].filter(f => f.startsWith(`${id}-`)).sort();
  if (any.length) return any[0];
  return null;
}

function koSpeciesName(s) {
  const base = Dex.species.get(s.baseSpecies);
  const baseKo = koPokemonN[norm(base.name)] || base.name;
  if (!s.forme) return baseKo;
  const forme = s.forme;
  const parts = forme.split("-");
  const regKey = parts[0].toLowerCase();
  if (REGION[regKey]) {
    const direct = koPokemonN[norm(regKey + base.name)];
    let name = direct && direct !== baseKo ? direct : `${REGION_KO[regKey]} ${baseKo}`;
    if (!name.startsWith(REGION_KO[regKey])) name = `${REGION_KO[regKey]} ${baseKo}`;
    const rest = parts.slice(1).join("-");
    if (rest) {
      const fk = koFormN[norm(base.name + rest)] || FORM_KO[rest];
      name += ` (${fk || rest})`;
    }
    return name;
  }
  if (s.isMega) {
    const suffix = forme.replace(/^Mega-?/, "");
    return `메가${baseKo}${suffix ? suffix.replace("-", "") : ""}`;
  }
  if (s.isPrimal) return `원시${baseKo}`;
  if (forme === "Gmax") return `거다이맥스 ${baseKo}`;
  const fk = koFormN[norm(base.name + forme)] || koFormN[norm(base.name + forme.replace(/-/g, ""))] || FORM_KO[forme];
  if (fk && fk.includes(baseKo)) return fk;
  return `${baseKo} (${fk || forme})`;
}

// forms PokeRogue names differently from Showdown (or not at all): official Korean names
const SPECIES_FORM = {
  pikachurockstar: "하드록", pikachubelle: "마담", pikachupopstar: "아이돌", pikachuphd: "닥터", pikachulibre: "마스크드",
  pikachuoriginal: "오리지널캡", pikachuhoenn: "호연캡", pikachusinnoh: "신오캡", pikachuunova: "하나캡", pikachukalos: "칼로스캡",
  pikachualola: "알로라캡", pikachupartner: "너로 정했다캡", pikachuworld: "월드캡",
  pichuspikyeared: "삐쭉귀", greninjabond: "유대변화",
};

/** The Korean name of a form on its own ("히트로토무", "팔데아의 모습/블레이즈종", "영원의 꽃"), or "" for base forms
 *  and battle-only gimmicks. PokeRogue keys family-wide forms on the first stage (scatterbug…, milcery…, kubfu…). */
function formLabel(s) {
  if (!s.forme || s.isMega || s.isPrimal || s.battleOnly || /Gmax|Totem|Eternamax/.test(s.forme)) return "";
  const base = Dex.species.get(s.baseSpecies);
  const lookup = forme => {
    if (typeKo[forme] && typeKo[forme] !== forme) return `${typeKo[forme]} 타입`; // Arceus / Silvally
    const seen = new Set();
    for (let cur = base; cur?.exists && !seen.has(cur.id); cur = cur.prevo ? Dex.species.get(cur.prevo) : null) {
      seen.add(cur.id);
      const k = koFormN[norm(cur.name + forme)] || koFormN[norm(cur.name + forme + "mask")] || koFormN[norm(cur.name + forme + "plumage")];
      if (k) return k;
    }
    return FORM_KO[forme] || "";
  };
  if (SPECIES_FORM[s.id]) return SPECIES_FORM[s.id];
  if (s.id === "floetteeternal") return koFormN.floetteeternalflower || "영원의 꽃";
  const parts = s.forme.split("-");
  const regKey = parts[0].toLowerCase();
  if (regKey === "bloodmoon") return koFormN.ursalunabloodmoon || "붉은 달";
  if (REGION[regKey]) {
    const rest = parts.slice(1).join("-");
    return [`${REGION_KO[regKey]}의 모습`, rest ? lookup(rest) : ""].filter(Boolean).join("/");
  }
  return lookup(s.forme);
}

const species = {};
let missingSprite = [];
for (const s of Dex.species.all()) {
  if (s.num <= 0 || s.num > 1025) continue;
  if (["CAP", "Custom"].includes(s.isNonstandard)) continue;
  const sprite = spriteKeyFor(s);
  if (!sprite) { missingSprite.push(s.name); continue; }
  const hasBack = back.has(sprite);
  const icon = iconIndex[sprite] !== undefined ? sprite : iconIndex[String(s.num)] !== undefined ? String(s.num) : null;
  // forms PokeRogue keeps as separate species ids: AZ's Eternal Floette is ETERNAL_FLOETTE = 2670
  const ALIAS = { floetteeternal: { ko: "영원의 꽃 플라엣테", sp: "2670" } };
  const al = ALIAS[s.id];
  const fm = formLabel(s);
  let koName = al?.ko ?? koSpeciesName(s);
  // English left in brackets ("아르세우스 (Fire)") or a cap mistaken for a region ("알로라 피카츄"): use the Korean form name
  if (fm && (/\([^)]*[A-Za-z][^)]*\)$/.test(koName) || SPECIES_FORM[s.id])) koName = `${koPokemonN[norm(s.baseSpecies)] || s.baseSpecies} (${fm})`;
  species[s.id] = {
    ko: koName,
    sp: al?.sp ?? sprite,
    bk: back.has(al?.sp ?? sprite) ? 1 : 0,
    ic: al ? [iconIndex[al.sp], al.sp] : icon ? [iconIndex[icon], icon] : null,
  };
  if (fm) species[s.id].fm = fm;
}

// ---------- moves / abilities ----------
const moves = {};
for (const m of Dex.moves.all()) {
  if (m.num <= 0 || m.isNonstandard === "CAP") continue;
  const k = koMovesN[m.id];
  moves[m.id] = k ? [k.name, k.effect || ""] : [m.name, m.shortDesc || ""];
}
const abilities = {};
for (const a of Dex.abilities.all()) {
  if (a.num <= 0 || a.isNonstandard === "CAP") continue;
  const k = koAbilN[a.id];
  abilities[a.id] = k ? [k.name, k.description || ""] : [a.name, a.shortDesc || ""];
}
const items = {};
for (const it of Dex.items.all()) {
  if (it.isNonstandard === "CAP") continue;
  items[it.id] = koItemsN[it.id] || it.name;
}
const natures = {};
for (const n of Dex.natures.all()) natures[n.id] = koNature[n.id] || n.name;

// ---------- battle anim map: move id -> anim file key ----------
const animDir = path.join(PR, "assets/battle-anims");
const animFiles = fs.readdirSync(animDir).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
const animByNorm = {};
for (const f of animFiles) if (!f.startsWith("common-") && !f.startsWith("encounter-")) animByNorm[norm(f)] = f;
const moveAnim = {};
for (const id of Object.keys(moves)) if (animByNorm[id]) moveAnim[id] = animByNorm[id];

// ---------- write ----------
const write = (name, obj) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
  console.log(name, (fs.statSync(path.join(OUT, name)).size / 1024).toFixed(0) + "KB");
};
write("species.json", species);
write("moves-ko.json", moves);
write("abilities-ko.json", abilities);
write("misc-ko.json", { items, natures, types: typeKo });
write("move-anim.json", moveAnim);
console.log("species", Object.keys(species).length, "missing sprite", missingSprite.length, missingSprite.slice(0, 40).join(", "));
console.log("moves w/o anim", Object.keys(moves).filter(m => !moveAnim[m]).length);

// ---------- placeholder pools (PokeRogue signature species + type specialties) ----------
{
  const sigSrc = fs.readFileSync(path.join(PR, "src/data/balance/signature-species.ts"), "utf8");
  const cfgSrc = fs.readFileSync(path.join(PR, "src/data/trainers/trainer-config.ts"), "utf8");
  const body = sigSrc.slice(sigSrc.indexOf("{", sigSrc.indexOf("new Proxy")) + 1);
  const REG = { ALOLA: "alola", GALAR: "galar", HISUI: "hisui", PALDEA: "paldea" };
  const prToShowdown = name => {
    const [first, ...rest] = name.split("_");
    if (REG[first] && rest.length) return norm(rest.join("")) + REG[first];
    return norm(name);
  };
  const finalEvo = id => {
    let s = Dex.species.get(id);
    if (!s.exists) return null;
    const seen = new Set();
    while (s.evos && s.evos.length && !seen.has(s.id)) {
      seen.add(s.id);
      const next = Dex.species.get(s.evos[0]);
      if (!next.exists) break;
      s = next;
    }
    return s.id;
  };
  const pools = {};
  for (const m of body.matchAll(/^\s*([A-Z_]+):\s*\[(.*?)\],?\s*(?:\/\/.*)?$/gm)) {
    const ids = [...m[2].matchAll(/SpeciesId\.([A-Z0-9_]+)/g)].map(x => finalEvo(prToShowdown(x[1]))).filter(Boolean);
    pools[m[1].toLowerCase()] = { pool: [...new Set(ids)] };
  }
  for (const m of cfgSrc.matchAll(/TrainerType\.([A-Z_]+)\]:\s*new TrainerConfig[\s\S]{0,200}?initFor(?:GymLeader|EliteFour|EvilTeamLeader|Champion)\([^)]*?PokemonType\.([A-Z]+)/g)) {
    const key = m[1].toLowerCase();
    pools[key] = pools[key] || { pool: [] };
    pools[key].type = m[2][0] + m[2].slice(1).toLowerCase();
  }
  for (const m of cfgSrc.matchAll(/initFor(?:GymLeader|EliteFour)\(\s*signatureSpecies\["([A-Z_]+)"\][^)]*?PokemonType\.([A-Z]+)/g)) {
    const key = m[1].toLowerCase();
    pools[key] = pools[key] || { pool: [] };
    pools[key].type = m[2][0] + m[2].slice(1).toLowerCase();
  }
  write("placeholder-pools.json", pools);
  console.log("pools", Object.keys(pools).length, JSON.stringify(pools.brock), JSON.stringify(pools.lorelei), JSON.stringify(pools.falkner));
}

// ---------- usage-based natures (Showdown ladder usage sets, MIT-licensed "stats" source only) ----------
{
  const setsDir = path.resolve("node_modules/@smogon/sets");
  const out = {};
  if (fs.existsSync(setsDir)) {
    const SKIP = /(cap|balancedhackmons|letsgo)/;
    for (const f of fs.readdirSync(setsDir).filter(f => /^gen\d.*\.json$/.test(f))) {
      const gen = Number(f[3]);
      if (gen < 3) continue; // no natures before Gen 3
      const j = readJson(path.join(setsDir, f));
      for (const [fmt, v] of Object.entries(j)) {
        if (!v || !v.stats || SKIP.test(fmt)) continue;
        const doubles = /(doubles|vgc)/.test(fmt);
        for (const [sp, sets] of Object.entries(v.stats)) {
          const id = Dex.species.get(sp).id;
          if (!id) continue;
          for (const set of Object.values(sets)) {
            const nature = Array.isArray(set.nature) ? set.nature[0] : set.nature;
            if (!nature) continue;
            const moves = (set.moves || []).flat().map(m => Dex.moves.get(m).id).filter(Boolean);
            const weight = gen - 2 + (doubles ? 0 : 1.5);
            (out[id] ||= []).push([nature, moves, weight]);
          }
        }
      }
    }
  }
  write("usage-natures.json", out);
  console.log("usage natures for", Object.keys(out).length, "species");
}
