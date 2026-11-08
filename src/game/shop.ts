// Shop catalogue and the player's bag. Everything the player equips or uses must be bought
// (or won: bottle caps are trophies).
import { formSpecies, EXTRA_EVO_ITEMS, GIMMICK_ITEMS, KEY_ITEMS, isKeyItem } from "../data/forms";
import { isBoundItem } from "./formitems";
import { dex, josa, koItem, koMove, koNature, koSpecies, koType, toID } from "../data/dex";
import itemInfo from "../data/gen/item-info.json";
import { ITEM_DESC_KO, RESIST_BERRY } from "../data/item-desc-ko";
import type { GameState } from "./state";
import type { OwnedMon, StatId } from "./types";
import { STATS, STAT_KO } from "./types";
import { learnset, levelUpMoves } from "./moves";
import { recordPressPurchase } from "./press";

export type ShopCat = "held" | "berry" | "evo" | "care" | "tm" | "gimmick";
/** Shop order follows the type chart, read left to right. */
export const SHOP_TYPE_ORDER = ["Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
const typeRank = (type: string) => {
  const rank = SHOP_TYPE_ORDER.indexOf(type);
  return rank < 0 ? SHOP_TYPE_ORDER.length : rank;
};

export function compareTmMoves(a: string, b: string): number {
  const x = dex.moves.get(a), y = dex.moves.get(b);
  return typeRank(x.type) - typeRank(y.type) || x.basePower - y.basePower || koMove(a).localeCompare(koMove(b));
}
export const SHOP_CATS: [ShopCat, string][] = [
  ["held", "도구"],
  ["berry", "나무열매"],
  ["evo", "진화 도구"],
  ["care", "성격·특성"],
  ["tm", "기술머신"],
  ["gimmick", "배틀 기믹"],
];

export interface ShopItem {
  key: string; // bag key: Showdown item name, or "mint:Adamant", "capsule", "patch", "tera:Fire", "tm:flamethrower"
  cat: ShopCat;
  price: number;
}

/** Held items taken out of the game: not sold, not held by anyone (old saves are refunded in migrate). */
export const REMOVED_ITEMS: Record<string, number> = {
  "Clear Amulet": 25000, "Covert Cloak": 25000, "Air Balloon": 12000, "Bright Powder": 8000, "Throat Spray": 12000,
  "Eject Button": 12000, "Eject Pack": 12000, "Red Card": 12000, "Room Service": 12000,
};
export const isRemovedItem = (key: string) => !!key && dex.items.get(key).exists && dex.items.get(key).name in REMOVED_ITEMS;

/** Old saves: removed items in the bag or held by the squad go back as money (what they cost). */
export function refundRemovedItems(st: GameState): number {
  let refund = 0;
  const bag = st.player.bag || {};
  for (const k of Object.keys(bag)) {
    if (!isRemovedItem(k)) continue;
    refund += REMOVED_ITEMS[dex.items.get(k).name] * bag[k];
    delete bag[k];
  }
  for (const m of st.player.squad) {
    if (!isRemovedItem(m.item)) continue;
    refund += REMOVED_ITEMS[dex.items.get(m.item).name];
    m.item = "";
  }
  st.player.money += refund;
  return refund;
}

const PREMIUM = new Set([
  "Leftovers", "Life Orb", "Choice Band", "Choice Specs", "Choice Scarf", "Focus Sash", "Assault Vest", "Booster Energy",
  "Heavy-Duty Boots", "Weakness Policy", "Rocky Helmet", "Eviolite", "Loaded Dice",
]);
const HELD = [
  ...PREMIUM, "Black Sludge", "Expert Belt", "Light Clay", "Quick Claw", "Scope Lens", "King's Rock", "Razor Fang",
  "Wide Lens", "Zoom Lens", "Shell Bell", "Light Ball", "Thick Club", "Leek", "Toxic Orb", "Flame Orb", "Muscle Band", "Wise Glasses",
  "Mental Herb", "White Herb", "Power Herb", "Mirror Herb", "Blunder Policy", "Protective Pads", "Punching Glove", "Safety Goggles", "Utility Umbrella",
  "Terrain Extender", "Big Root", "Binding Band", "Grip Claw", "Iron Ball", "Lagging Tail", "Metronome", "Damp Rock", "Heat Rock",
  "Smooth Rock", "Icy Rock", "Charcoal", "Mystic Water", "Magnet", "Miracle Seed", "Never-Melt Ice", "Black Belt", "Poison Barb",
  "Soft Sand", "Sharp Beak", "Twisted Spoon", "Silver Powder", "Hard Stone", "Spell Tag", "Dragon Fang", "Black Glasses",
  "Metal Coat", "Silk Scarf", "Fairy Feather",
];
const GOOD_BERRY = new Set(["Sitrus Berry", "Lum Berry", "Chesto Berry", "Salac Berry", "Liechi Berry", "Petaya Berry", "Custap Berry"]);
/** Only these berries are sold, in status / pinch stats / HP / type-resistance order. */
const SHOP_BERRIES = [
  "Lum Berry",
  "Liechi Berry", "Petaya Berry", "Ganlon Berry", "Apicot Berry", "Salac Berry", "Starf Berry",
  "Sitrus Berry", "Enigma Berry", "Leppa Berry",
  "Chilan Berry",
];
export const NATURE_NAMES = dex.natures.all().map(n => n.name);
export const TERA_TYPES = SHOP_TYPE_ORDER.slice();

let catalogCache: ShopItem[] | null = null;
export function catalog(): ShopItem[] {
  if (catalogCache) return catalogCache;
  const out: ShopItem[] = [];
  const seen = new Set<string>();
  const add = (key: string, cat: ShopCat, price: number) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, cat, price });
  };
  // Razor Claw with the held items, Razor Fang with the evolution items (either works both ways)
  add("Razor Claw", "held", 8000);
  add("Razor Fang", "evo", 10000);
  for (const n of HELD) if (dex.items.get(n).exists) add(dex.items.get(n).name, "held", PREMIUM.has(n) ? 25000 : /Plate|Charcoal|Mystic|Magnet|Seed|Ice|Belt|Barb|Sand|Beak|Spoon|Powder|Stone|Tag|Fang|Glasses|Coat|Scarf|Feather/.test(n) ? 8000 : 12000);
  for (const name of SHOP_BERRIES) add(name, "berry", GOOD_BERRY.has(name) ? 5000 : 2000);
  for (const s of dex.species.all()) {
    const e = (s as any).evoItem as string | undefined;
    if (e && dex.items.get(e).exists) add(dex.items.get(e).name, "evo", /Stone$/.test(e) ? 6000 : 10000);
  }
  for (const k of Object.keys(EXTRA_EVO_ITEMS)) add(k, "evo", 10000);
  add("ppmax", "care", 10000);
  add("ppup", "care", 5000);
  for (const n of NATURE_NAMES) add(`mint:${n}`, "care", 20000);
  add("capsule", "care", 30000);
  add("patch", "care", 80000);
  for (const i of dex.items.all()) {
    if (!i.megaStone) continue;
    // only stones for Pokémon that exist in the dex (skips e.g. Crucibellite)
    const base = dex.species.get(String((i as any).megaEvolves || Object.values(i.megaStone as Record<string, string>)[0]).replace(/-Mega.*$/, ""));
    if (base.exists && base.num > 0) add(i.name, "gimmick", 50000);
  }
  for (const i of dex.items.all()) if (i.zMove) add(i.name, "gimmick", 30000);
  add("gim:maxsoup", "gimmick", 30000);
  add("gim:maxmushroom", "gimmick", 50000);
  for (const t of TERA_TYPES) add(`tera:${t}`, "gimmick", 15000);
  // Leave ordinary items in their original order; keep each type-based group together.
  const rank = ({ key, cat }: ShopItem): [number, number] => {
    if (cat === "held") return TYPE_BOOSTER[key] ? [1, typeRank(TYPE_BOOSTER[key])] : [0, 0];
    if (cat === "evo") return [0, EXTRA_EVO_ITEMS[key] ? 9 : dex.items.get(key).gen];
    if (cat !== "gimmick") return [0, 0];
    if (key.startsWith("tera:")) return [3, typeRank(key.slice(5))];
    if (GIMMICK_ITEMS[key]) return [2.5, key === "gim:maxsoup" ? 0 : 1];
    const item = dex.items.get(key);
    if (item.megaStone) {
      const target = String((item as any).megaEvolves || Object.values(item.megaStone as Record<string, string>)[0]).replace(/-Mega.*$/, "");
      return [0, dex.species.get(target).num];
    }
    if (item.zMove && item.itemUser?.length) {
      return [2, Math.min(...item.itemUser.map(user => dex.species.get(user).num))];
    }
    return [1, typeRank(String(item.zMoveType))];
  };
  // Each category is filtered separately by the shop; stable ties preserve variants' order.
  catalogCache = SHOP_CATS.flatMap(([cat]) => out.filter(i => i.cat === cat).sort((a, b) => {
    const x = rank(a), y = rank(b);
    return x[0] - y[0] || x[1] - y[1];
  }));
  return catalogCache;
}

export function tmPrice(move: string): number {
  const m = dex.moves.get(move);
  if (m.category === "Status") return 8000;
  return 3000 + Math.min(150, m.basePower || 60) * 100;
}

const BERRY_KO: Record<string, string> = {
  "Pomeg Berry": "유석열매", "Kelpsy Berry": "시마열매", "Qualot Berry": "오니열매", "Hondew Berry": "로매열매", "Grepa Berry": "서배열매",
  "Tamato Berry": "토망열매", "Figy Berry": "무화열매", "Wiki Berry": "위키열매", "Mago Berry": "마고열매", "Aguav Berry": "아바열매",
  "Iapapa Berry": "파야열매", "Jaboca Berry": "자보열매", "Rowap Berry": "애터열매", "Kee Berry": "악키열매", "Maranga Berry": "타라프열매",
  "Micle Berry": "미클열매",
};

export function itemName(key: string): string {
  if (BERRY_KO[key]) return BERRY_KO[key];
  if (key.startsWith("mint:")) return `${koNature(key.slice(5))} 민트`;
  if (key.startsWith("tera:")) return `${koType(key.slice(5))} 테라피스`;
  if (key.startsWith("tm:")) return `기술머신 ${koMove(key.slice(3))}`;
  if (key === "capsule") return "특성캡슐";
  if (key === "patch") return "특성패치";
  if (key === "ppup") return "포인트업";
  if (key === "ppmax") return "포인트맥스";
  if (key === "cap:silver") return "은색병뚜껑";
  if (key === "cap:gold") return "금색병뚜껑";
  if (key === "cap:bronze") return "동색병뚜껑";
  if (KEY_ITEMS[key]) return KEY_ITEMS[key].ko;
  if (EXTRA_EVO_ITEMS[key]) return EXTRA_EVO_ITEMS[key].ko;
  if (GIMMICK_ITEMS[key]) return GIMMICK_ITEMS[key].ko;
  return koItem(key);
}

const TYPE_BOOSTER: Record<string, string> = {
  "Silk Scarf": "Normal", "Black Belt": "Fighting", "Sharp Beak": "Flying", "Poison Barb": "Poison", "Soft Sand": "Ground",
  "Hard Stone": "Rock", "Silver Powder": "Bug", "Spell Tag": "Ghost", "Metal Coat": "Steel", Charcoal: "Fire",
  "Mystic Water": "Water", "Miracle Seed": "Grass", Magnet: "Electric", "Twisted Spoon": "Psychic",
  "Never-Melt Ice": "Ice", "Dragon Fang": "Dragon", "Black Glasses": "Dark", "Fairy Feather": "Fairy",
};
const INFO = itemInfo as Record<string, { img: string | null; desc: string | null }>;

/** Korean description: PokeRogue's text where it has one, otherwise written for this game's rules. */
export function itemDesc(key: string): string {
  if (KEY_ITEMS[key]) return KEY_ITEMS[key].desc;
  const evolves = evolvesWith(key);
  if (evolves) return evolves;
  if (ITEM_DESC_FIX[key]) return ITEM_DESC_FIX[key];
  if (EXTRA_EVO_ITEMS[key]) return EXTRA_EVO_ITEMS[key].desc;
  if (GIMMICK_ITEMS[key]) return GIMMICK_ITEMS[key].desc;
  if (dex.items.get(key).id === "chilanberry") return "지니게 하면 효과가 굉장한 기술의 데미지를 한 번 반감한다.";
  if (key.startsWith("mint:")) {
    const name = key.slice(5);
    const nature = dex.natures.get(name);
    const effect = nature.plus && nature.minus
      ? `[${STAT_KO[nature.plus]}+/${STAT_KO[nature.minus]}-]`
      : "[능력치 변화 없음]";
    return `포켓몬의 성격을 ${josa(koNature(name), "으로")} 바꾼다. ${effect}`;
  }
  if (key.startsWith("tm:")) {
    const mv = key.slice(3);
    return `포켓몬에게 ${josa(koMove(mv), "을를")} 가르친다. 한 번 사면 배울 수 있는 포켓몬 모두에게 계속 가르칠 수 있다.`;
  }
  if (key === "ppup") return "기술 하나의 최대 PP를 기본의 5분의 1만큼 늘린다. 한 기술에 3번까지 쓸 수 있다.";
  if (key === "ppmax") return "기술 하나의 최대 PP를 한 번에 끝까지(기본의 1.6배) 늘린다.";
  if (key === "cap:silver") return "포켓몬 한 마리의 개체값 하나를 최대(31)로 만든다. 리그·지방 컵·PST·PCT 우승 부상.";
  if (key === "cap:gold") return "포켓몬 한 마리의 모든 개체값을 최대(31)로 만든다. PWT 우승 부상.";
  if (key === "cap:bronze") return "포켓몬 한 마리의 모든 개체값을 1씩 올린다(최대 31). 대회 개인상 부상.";
  if (ITEM_DESC_KO[key]) return ITEM_DESC_KO[key];
  const it = dex.items.get(key);
  if (RESIST_BERRY[key]) {
    const t = koType(RESIST_BERRY[key]);
    return RESIST_BERRY[key] === "Normal" ? `지니게 하면 ${t}타입 기술의 데미지를 한 번 반감한다.` : `지니게 하면 효과가 굉장한 ${t}타입 기술의 데미지를 한 번 반감한다.`;
  }
  if (it.exists && it.megaStone) {
    const target = Object.values(it.megaStone as Record<string, string>)[0] ?? "";
    const base = (it as any).megaEvolves || target.replace(/-Mega.*$/, "");
    return `${koSpecies(base)}에게 지니게 하면 배틀 중 메가진화할 수 있다.`;
  }
  if (it.exists && it.zMove) {
    if (it.itemUser?.length) {
      const users = [...new Set(it.itemUser.map(u => koSpecies(dex.species.get(u).baseSpecies)))];
      return `${users.join("·")}에게 지니게 하면 ${josa(koMove(String(it.zMoveFrom)), "을를")} 전용 Z기술로 쓸 수 있다.`;
    }
    return `지니게 하면 ${koType(String(it.zMoveType))}타입 기술을 Z기술로 쓸 수 있다.`;
  }
  const raw = INFO[key]?.desc;
  if (raw) {
    let d = raw;
    if (key.startsWith("tera:")) d = d.replace(/\{\{teraType\}\}/g, koType(key.slice(5)));
    if (TYPE_BOOSTER[key]) d = d.replace(/\{\{moveType\}\}/g, koType(TYPE_BOOSTER[key]));
    return d.replace(/\[\[([^\]]+)\]\]/g, "$1");
  }
  return it.exists ? (it as any).shortDesc || it.desc || "" : "";
}

/** Main-series descriptions where PokeRogue's text differs (its own odds or a terse note). */
const ITEM_DESC_FIX: Record<string, string> = {
  "King's Rock": "지니게 하면 공격해서 대미지를 줄 때 상대가 풀죽을 때가 있다.",
  "Razor Claw": "날카로운 손톱. 지니게 하면 기술이 급소에 맞기 쉬워진다.",
  "Razor Fang": "날카로운 이빨. 지니게 하면 공격해서 대미지를 줄 때 상대가 풀죽을 때가 있다.",
  "Quick Claw": "가볍고 날카로운 손톱. 지니게 하면 가끔 상대보다 먼저 행동할 수 있다.",
  "Metal Coat": "특수한 금속막. 지니게 하면 강철타입 기술의 위력이 올라간다.",
  "Sitrus Berry": "지니게 하면 HP가 절반 이하로 줄었을 때 HP를 조금 회복한다.",
  "Lum Berry": "지니게 하면 모든 상태 이상과 혼란을 회복한다.",
  "Leppa Berry": "지니게 하면 기술의 PP가 0이 되었을 때 PP를 10 회복한다.",
  "Liechi Berry": "지니게 하면 핀치일 때 공격이 올라간다.",
  "Ganlon Berry": "지니게 하면 핀치일 때 방어가 올라간다.",
  "Salac Berry": "지니게 하면 핀치일 때 스피드가 올라간다.",
  "Petaya Berry": "지니게 하면 핀치일 때 특수공격이 올라간다.",
  "Apicot Berry": "지니게 하면 핀치일 때 특수방어가 올라간다.",
  "Lansat Berry": "지니게 하면 핀치일 때 급소에 맞히기 쉬워진다.",
  "Starf Berry": "지니게 하면 핀치일 때 능력 중 하나가 크게 올라간다.",
  "Enigma Berry": "지니게 하면 효과가 굉장한 기술을 받았을 때 HP를 조금 회복한다.",
};

/** Evolution items: which Pokémon they evolve ("천둥의돌: 피카츄·이브이… 를 진화시킨다"). */
function evolvesWith(key: string): string | null {
  const it = dex.items.get(key);
  if (!it.exists) return null;
  const from = new Set<string>();
  for (const s of dex.species.all()) {
    if ((s as any).evoItem !== it.name || !s.prevo || s.num > 1025 || ["CAP", "LGPE", "Custom"].includes(s.isNonstandard as string)) continue;
    from.add(koSpecies(s.prevo));
  }
  if (!from.size) return null;
  const held = ["Metal Coat", "King's Rock", "Razor Claw", "Razor Fang", "Deep Sea Tooth", "Deep Sea Scale"].includes(it.name);
  const base = held ? ITEM_DESC_FIX[it.name] || INFO[key]?.desc || (it as any).shortDesc || "" : "";
  return `${base ? base + " " : ""}${[...from].join("·")}을(를) 진화시킨다.`;
}

/** PokeRogue item-atlas frame for the icon ("unknown" when PokeRogue has no picture). */
export function itemImage(key: string): string {
  if (key.startsWith("tm:")) return `tm_${dex.moves.get(key.slice(3)).type.toLowerCase()}`;
  if (key === "ppup") return "pp_up";
  if (key === "ppmax") return "pp_max";
  if (KEY_ITEMS[key]) return KEY_ITEMS[key].img;
  if (EXTRA_EVO_ITEMS[key]) return EXTRA_EVO_ITEMS[key].img;
  if (GIMMICK_ITEMS[key]) return GIMMICK_ITEMS[key].img;
  // plates, memories, drives, masks, Origin orbs: the atlas names them after the item
  if (!INFO[key] && FORM_ITEM.test(key)) return key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return INFO[key]?.img || "unknown";
}

const FORM_ITEM = / (Plate|Memory|Drive|Mask)$|^(Adamant Crystal|Lustrous Globe|Griseous Core)$/;

export const isHoldable = (key: string) =>
  key === "key:gracidea" ||
  !/^(mint:|tera:|tm:|cap:)/.test(key) && !["capsule", "patch", "ppup", "ppmax"].includes(key) && dex.items.get(key).exists;

export const bagCount = (st: GameState, key: string) => st.player.bag?.[key] ?? 0;

export function addItem(st: GameState, key: string, n = 1) {
  const bag = (st.player.bag ||= {});
  bag[key] = (bag[key] || 0) + n;
  if (bag[key] <= 0) delete bag[key];
}

/** Takes one item from the bag; false if there is none. */
export function takeItem(st: GameState, key: string): boolean {
  if (bagCount(st, key) <= 0) return false;
  addItem(st, key, -1);
  return true;
}

export function buy(st: GameState, key: string, price: number): string | null {
  if (key.startsWith("tm:") && bagCount(st, key) > 0) return "이미 가진 기술머신입니다.";
  if (st.player.money < price) return "자금이 부족합니다.";
  st.player.money -= price;
  addItem(st, key);
  recordPressPurchase(st, itemName(key));
  return null;
}

export function sell(st: GameState, key: string, price: number): string | null {
  if (isKeyItem(key) || isBoundItem(st, key)) return "포켓몬과 함께 받은 물건이라 팔 수 없습니다.";
  if (!takeItem(st, key)) return "가방에 없습니다.";
  st.player.money += Math.floor(price / 2);
  return null;
}

/** Swaps a held item with one from the bag ("" = take off). */
export function equip(st: GameState, m: OwnedMon, key: string): string | null {
  if (key === m.item) return null;
  if (isRemovedItem(key)) return "더 이상 쓸 수 없는 도구입니다.";
  if (key && !takeItem(st, key)) return "가방에 그 도구가 없습니다.";
  if (m.item) addItem(st, m.item);
  m.item = key;
  return null;
}

// ---- moves ----

/** Moves the species can learn by TM / tutor (including from pre-evolutions). */
export function tmCompatible(species: string): Set<string> {
  const out = new Set<string>();
  for (const [id, src] of Object.entries(learnset(dex.species.get(species).id, true))) if (src.some(s => /^\d[MT]/.test(s))) out.add(id);
  return out;
}

/** Moves the player may set now: level-up (≤ level) + already known + owned TMs it can learn. */
export function availableMoves(st: GameState, m: OwnedMon): { id: string; via: "level" | "known" | "tm" }[] {
  const out = new Map<string, "level" | "known" | "tm">();
  for (const x of levelUpMoves(m.species, m.level)) out.set(x.id, "level");
  for (const id of m.known || m.moves) if (!out.has(toID(id))) out.set(toID(id), "known");
  const tms = tmCompatible(m.species);
  for (const k of Object.keys(st.player.bag || {})) {
    if (!k.startsWith("tm:")) continue;
    const id = k.slice(3);
    if (tms.has(id) && !out.has(id)) out.set(id, "tm");
  }
  return [...out.entries()].map(([id, via]) => ({ id, via })).filter(x => dex.moves.get(x.id).exists);
}

// ---- care items ----

export function useMint(st: GameState, m: OwnedMon, nature: string): string | null {
  if (!takeItem(st, `mint:${nature}`)) return "민트가 없습니다.";
  m.nature = nature;
  return null;
}

export function useCapsule(st: GameState, m: OwnedMon): string | null {
  const ab = dex.species.get(m.species).abilities;
  const normal = [ab[0], ab[1]].filter(Boolean) as string[];
  const other = normal.find(a => a !== m.ability);
  if (!other || normal.length < 2) return "바꿀 수 있는 다른 일반 특성이 없습니다.";
  if (!takeItem(st, "capsule")) return "특성캡슐이 없습니다.";
  m.ability = other;
  return null;
}

export function usePatch(st: GameState, m: OwnedMon): string | null {
  const h = dex.species.get(m.species).abilities.H;
  if (!h || h === m.ability) return "숨겨진 특성으로 바꿀 수 없습니다.";
  if (!takeItem(st, "patch")) return "특성패치가 없습니다.";
  m.ability = h;
  return null;
}

/** 포인트업 (+1, up to 3) or 포인트맥스 (straight to 3) on one of the Pokémon's moves. */
export function usePP(st: GameState, m: OwnedMon, moveId: string, key: "ppup" | "ppmax"): string | null {
  const mv = dex.moves.get(moveId);
  if (!mv.exists || !m.moves.some(x => toID(x) === mv.id)) return "그 기술을 가지고 있지 않습니다.";
  if (mv.noPPBoosts) return "PP를 늘릴 수 없는 기술입니다.";
  const ups = m.ppUps?.[mv.id] ?? 0;
  if (ups >= 3) return "이미 PP가 최대입니다.";
  if (!takeItem(st, key)) return `${itemName(key)}가 없습니다.`;
  (m.ppUps ||= {})[mv.id] = key === "ppmax" ? 3 : ups + 1;
  return null;
}

export function useTera(st: GameState, m: OwnedMon, type: string): string | null {
  if (!takeItem(st, `tera:${type}`)) return "테라피스가 없습니다.";
  m.teraType = type;
  return null;
}

export function useCap(st: GameState, m: OwnedMon, stat: StatId | "all" | "bronze"): string | null {
  if (stat === "bronze") {
    if (STATS.every(k => m.ivs[k] >= 31)) return "이미 모든 개체값이 최대입니다.";
    if (!takeItem(st, "cap:bronze")) return "동색병뚜껑이 없습니다.";
    for (const k of STATS) m.ivs[k] = Math.min(31, m.ivs[k] + 1);
    return null;
  }
  if (stat === "all") {
    if (!takeItem(st, "cap:gold")) return "금색병뚜껑이 없습니다.";
    for (const k of STATS) m.ivs[k] = 31;
    return null;
  }
  if (m.ivs[stat] >= 31) return "이미 최대입니다.";
  if (!takeItem(st, "cap:silver")) return "은색병뚜껑이 없습니다.";
  m.ivs[stat] = 31;
  return null;
}

/** 다이버섯: the Pokémon can Dynamax in battle (used up). */
export function useMaxMushroom(st: GameState, m: OwnedMon): string | null {
  if (m.dynamax) return "이미 다이맥스할 수 있습니다.";
  if (!takeItem(st, "gim:maxmushroom")) return "다이버섯이 없습니다.";
  m.dynamax = true;
  return null;
}

/** 다이수프: a Gigantamax-capable Pokémon gets its G-Max factor (used up). */
export function useMaxSoup(st: GameState, m: OwnedMon): string | null {
  if (!canGigantamax(m)) return "거다이맥스할 수 없는 포켓몬입니다.";
  if (m.gmax) return "이미 거다이맥스할 수 있습니다.";
  if (!takeItem(st, "gim:maxsoup")) return "다이수프가 없습니다.";
  m.gmax = true;
  return null;
}
export const canGigantamax = (m: OwnedMon) => !!dex.species.get(formSpecies(m)).canGigantamax;
