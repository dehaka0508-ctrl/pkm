// Trainer profiles: standard trainers vs type specialists (gym leaders, Elite Four, some bosses and champions),
// with theme tags for Pokémon that fit a trainer's concept without having the type (Lance's Gyarados).
import { dex } from "../../data/dex";
import { hashStr } from "../rng";
import { resolveTeam, spriteSpecialty, trainerById } from "../lineups";
import type { TrainerDef } from "../types";
import type { SpendingStyle, TrainerProfile } from "./models";

/** Theme tags: whole evolution families (any stage listed) that fit a concept. */
export const THEME_TAGS: Record<string, { ko: string; species: string[] }> = {
  dragonLike: { ko: "드래곤 계열", species: ["Charizard", "Gyarados", "Aerodactyl", "Tyranitar", "Ampharos", "Archeops", "Tyrantrum", "Aurorus", "Heliolisk", "Seadra", "Dhelmise", "Krookodile"] },
  flyingReptile: { ko: "익룡", species: ["Aerodactyl", "Archeops", "Charizard", "Noivern", "Salamence", "Dragonite"] },
  magma: { ko: "마그마단", species: ["Mightyena", "Crobat", "Camerupt", "Weezing", "Torkoal", "Magcargo", "Claydol", "Flygon"] },
  aqua: { ko: "아쿠아단", species: ["Mightyena", "Crobat", "Sharpedo", "Muk", "Wailord", "Walrein", "Tentacruel", "Crawdaunt"] },
  rocket: { ko: "로켓단", species: ["Arbok", "Weezing", "Raticate", "Crobat", "Persian", "Houndoom", "Muk", "Nidoking", "Nidoqueen", "Rhyperior", "Kangaskhan"] },
  galactic: { ko: "갤럭시단", species: ["Honchkrow", "Weavile", "Crobat", "Gyarados", "Houndoom", "Toxicroak", "Purugly", "Skuntank", "Bronzong"] },
  plasma: { ko: "플라즈마단", species: ["Cofagrigus", "Seismitoad", "Eelektross", "Drapion", "Toxicroak", "Hydreigon", "Kingambit", "Liepard", "Watchog", "Garbodor", "Krookodile", "Seviper"] },
  flare: { ko: "플레어단", species: ["Pyroar", "Honchkrow", "Mienshao", "Gyarados", "Houndoom", "Mightyena", "Liepard", "Scrafty", "Swalot", "Crobat", "Gogoat"] },
  skull: { ko: "스컬단", species: ["Golisopod", "Ariados", "Masquerain", "Pinsir", "Scizor", "Vikavolt", "Crobat", "Hypno", "Toxapex", "Salazzle", "Arbok"] },
  macro: { ko: "매크로코스모스", species: ["Copperajah", "Ferrothorn", "Perrserker", "Escavalier", "Klinklang", "Corviknight", "Duraludon"] },
  eeveelution: { ko: "이브이 진화", species: ["Vaporeon", "Jolteon", "Flareon", "Espeon", "Umbreon", "Leafeon", "Glaceon", "Sylveon"] },
  fossil: { ko: "화석", species: ["Omastar", "Kabutops", "Aerodactyl", "Cradily", "Armaldo", "Rampardos", "Bastiodon", "Carracosta", "Archeops", "Tyrantrum", "Aurorus"] },
};

/** Concepts by sprite: types and theme tags (bosses and champions are specialists only when listed here). */
const OVERRIDES: Record<string, { types: string[]; tags: string[] }> = {
  lance: { types: ["Dragon"], tags: ["dragonLike", "flyingReptile"] },
  clair: { types: ["Dragon"], tags: ["dragonLike"] },
  drake: { types: ["Dragon"], tags: ["dragonLike"] },
  iris: { types: ["Dragon"], tags: ["dragonLike"] },
  drayden: { types: ["Dragon"], tags: ["dragonLike"] },
  drasna: { types: ["Dragon"], tags: ["dragonLike"] },
  raihan: { types: ["Dragon"], tags: ["dragonLike"] },
  hassel: { types: ["Dragon"], tags: ["dragonLike"] },
  maxie: { types: ["Ground", "Fire"], tags: ["magma"] },
  archie: { types: ["Water", "Dark"], tags: ["aqua"] },
  giovanni: { types: ["Ground"], tags: ["rocket"] },
  cyrus: { types: ["Dark"], tags: ["galactic"] },
  ghetsis: { types: ["Dark"], tags: ["plasma"] },
  lysandre: { types: ["Fire", "Dark"], tags: ["flare"] },
  guzma: { types: ["Bug"], tags: ["skull"] },
  rose: { types: ["Steel"], tags: ["macro"] },
  penny: { types: [], tags: ["eeveelution"] },
  steven: { types: ["Steel", "Rock"], tags: ["fossil"] },
  wallace: { types: ["Water"], tags: [] },
  grant: { types: ["Rock"], tags: ["fossil"] },
  roark: { types: ["Rock"], tags: ["fossil"] },
};

/** Trainers whose sprite is shared or says nothing about them (e.g. Alola's captains on generic sprites). */
const OVERRIDES_BY_ID: Record<string, { types: string[]; tags: string[] }> = {
  "alola-마마네": { types: ["Electric"], tags: [] },
};

const SPECIALIST_ROLES = new Set(["관장", "사천왕"]);
const STYLE_BY_ROLE: Record<string, SpendingStyle> = {
  챔피언: "aggressive", 보스: "aggressive", 사천왕: "balanced", 관장: "balanced", 라이벌: "balanced", 주인공: "balanced", 박사: "frugal", 기타: "frugal", 트레이너: "frugal",
};
const STYLES: SpendingStyle[] = ["frugal", "balanced", "aggressive"];

/** The first stage of a Pokémon's family (regional forms keep their own family). */
export function familyOf(species: string): string {
  let s = dex.species.get(species);
  for (let i = 0; i < 4 && s.prevo; i++) s = dex.species.get(s.prevo);
  return s.id;
}

const tagFamilies = new Map<string, Set<string>>();
function familiesOf(tag: string): Set<string> {
  let f = tagFamilies.get(tag);
  if (!f) tagFamilies.set(tag, (f = new Set((THEME_TAGS[tag]?.species || []).map(familyOf))));
  return f;
}

/** Theme tags a species carries. */
export function tagsOf(species: string): string[] {
  const fam = familyOf(species);
  return Object.keys(THEME_TAGS).filter(tag => familiesOf(tag).has(fam));
}

const cache = new Map<string, TrainerProfile>();

/** A trainer's profile, worked out from its role, sprite and lineup (same every time). */
export function profileOf(t: TrainerDef | string): TrainerProfile {
  const def = typeof t === "string" ? trainerById(t) : t;
  if (!def) return { id: String(t), archetype: "standard", primaryTypes: [], themeTags: [], style: "balanced" };
  const hit = cache.get(def.id);
  if (hit) return hit;
  const key = def.sprite.toLowerCase();
  const over = OVERRIDES_BY_ID[def.id] || OVERRIDES[key];
  let types: string[] = [];
  let tags: string[] = [];
  if (over) {
    types = over.types;
    tags = over.tags;
  } else if (SPECIALIST_ROLES.has(def.role)) {
    // the lineup's most common type (the sprite's specialty breaks ties)
    const count: Record<string, number> = {};
    for (const m of resolveTeam(def)) for (const ty of dex.species.get(m.species).types) count[ty] = (count[ty] || 0) + 1;
    const spec = spriteSpecialty(key);
    const top = Object.entries(count).sort((a, b) => b[1] - a[1] || (a[0] === spec ? -1 : b[0] === spec ? 1 : 0))[0];
    types = top && top[1] >= 3 ? [top[0]] : spec ? [spec] : [];
  }
  // spending: by role, with one step either way for some trainers
  const base = STYLES.indexOf(STYLE_BY_ROLE[def.role] ?? "balanced");
  const shift = [0, 0, 0, 1, -1][hashStr(def.id) % 5];
  const style = STYLES[Math.max(0, Math.min(2, base + shift))];
  const p: TrainerProfile = { id: def.id, archetype: types.length || tags.length ? "specialist" : "standard", primaryTypes: types, themeTags: tags, style };
  cache.set(def.id, p);
  return p;
}

/** How a species fits a trainer's concept: its specialty type, a theme tag, or not at all. */
export function conceptFit(p: TrainerProfile, species: string): "type" | "theme" | null {
  if (p.archetype === "standard") return "type";
  const sp = dex.species.get(species);
  if (sp.types.some(t => p.primaryTypes.includes(t))) return "type";
  if (p.themeTags.length && tagsOf(sp.id).some(t => p.themeTags.includes(t))) return "theme";
  return null;
}

/** Korean summary of a profile ("드래곤 전문 · 드래곤 계열"). */
export function profileLabel(p: TrainerProfile, koType: (t: string) => string): string {
  if (p.archetype === "standard") return "일반 실전형";
  const parts = [p.primaryTypes.map(koType).join("·") + (p.primaryTypes.length ? " 전문" : ""), ...p.themeTags.map(t => THEME_TAGS[t]?.ko || t)].filter(Boolean);
  return parts.join(" · ");
}

