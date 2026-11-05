// Pokédex helpers: Showdown data (mechanics) + Korean names / PokeRogue sprite keys.
import { Dex, toID } from "@pkmn/sim";
import speciesGen from "./gen/species.json";
import movesKo from "./gen/moves-ko.json";
import abilitiesKo from "./gen/abilities-ko.json";
import miscKo from "./gen/misc-ko.json";
import moveAnimMap from "./gen/move-anim.json";

export { Dex, toID };
export const dex = Dex.forFormat("gen9nationaldexag");

type SpeciesGen = { ko: string; sp: string; bk: number; ic: [number, string] | null; fm?: string };
const SG = speciesGen as unknown as Record<string, SpeciesGen>;
const MK = movesKo as unknown as Record<string, [string, string]>;
const AK = abilitiesKo as unknown as Record<string, [string, string]>;
const MISC = miscKo as { items: Record<string, string>; natures: Record<string, string>; types: Record<string, string> };
const ANIM = moveAnimMap as Record<string, string>;

export const genTables = { species: SG, moves: MK, abilities: AK, misc: MISC };

export function species(id: string) {
  return dex.species.get(id);
}
export function koSpecies(id: string | null | undefined): string {
  if (!id) return "";
  const s = dex.species.get(id);
  return SG[s.id]?.ko ?? s.name;
}
/** A name split for tight spots: every form keeps only the species name ("켄타로스", "로토무") and its
 *  Korean form name goes to `form` ("팔데아의 모습/블레이즈종", "히트로토무", "영원의 꽃"). */
export function formParts(id: string): { name: string; form: string } {
  const s = dex.species.get(id);
  const fm = SG[s.id]?.fm;
  if (fm) return { name: koSpecies(s.baseSpecies), form: fm };
  const full = koSpecies(id);
  return { name: full.replace(/\s*\([^)]*\)/g, "").trim() || full, form: "" };
}
/** What the squad screens call a Pokémon: its nickname, or its species name without region/form. */
export function monName(m: { nickname?: string; species: string }): string {
  return m.nickname || formParts(m.species).name;
}
export function koMove(id: string | null | undefined): string {
  if (!id) return "";
  // typed Hidden Power shows as plain "잠재파워" in the game (the type stays in the data/xlsx)
  if (/^hiddenpower[a-z]+$/.test(toID(id)) && MK.hiddenpower) return MK.hiddenpower[0];
  const m = dex.moves.get(id);
  return MK[m.id]?.[0] ?? m.name;
}
export function moveDesc(id: string): string {
  const m = dex.moves.get(id);
  return MK[m.id]?.[1] ?? m.shortDesc;
}
export function koAbility(id: string | null | undefined): string {
  if (!id) return "";
  const a = dex.abilities.get(id);
  return AK[a.id]?.[0] ?? a.name;
}
export function abilityDesc(id: string): string {
  const a = dex.abilities.get(id);
  return AK[a.id]?.[1] ?? a.shortDesc;
}
export function koItem(id: string | null | undefined): string {
  if (!id) return "";
  const it = dex.items.get(id);
  return MISC.items[it.id] ?? it.name;
}
export function koNature(id: string | null | undefined): string {
  if (!id) return "";
  return MISC.natures[toID(id)] ?? id;
}
export function koType(t: string | null | undefined): string {
  if (!t) return "";
  return MISC.types[t] ?? t;
}
export function spriteKey(id: string): string {
  const s = dex.species.get(id);
  return SG[s.id]?.sp ?? SG[toID(s.baseSpecies)]?.sp ?? "0";
}
export function hasBackSprite(id: string): boolean {
  const s = dex.species.get(id);
  return !!SG[s.id]?.bk;
}
export function iconRef(id: string): [number, string] | null {
  const s = dex.species.get(id);
  return SG[s.id]?.ic ?? SG[toID(s.baseSpecies)]?.ic ?? null;
}
export function moveAnimKey(id: string): string | null {
  return ANIM[toID(id)] ?? null;
}
export function isKnownSpecies(id: string): boolean {
  return !!SG[toID(id)];
}

export const TYPE_COLORS: Record<string, string> = {
  Normal: "#a8a77a", Fire: "#ee8130", Water: "#6390f0", Electric: "#f7d02c", Grass: "#7ac74c", Ice: "#96d9d6",
  Fighting: "#c22e28", Poison: "#a33ea1", Ground: "#e2bf65", Flying: "#a98ff3", Psychic: "#f95587", Bug: "#a6b91a",
  Rock: "#b6a136", Ghost: "#735797", Dragon: "#6f35fc", Dark: "#705746", Steel: "#b7b7ce", Fairy: "#d685ad", Stellar: "#40b5a5",
};

export interface RegionInfo {
  id: string;
  name: string;
  gen: number;
  dex: [number, number];
  arena: string;
}
export const REGIONS: RegionInfo[] = [
  { id: "kanto", name: "관동", gen: 1, dex: [1, 151], arena: "plains" },
  { id: "johto", name: "성도", gen: 2, dex: [152, 251], arena: "tall_grass" },
  { id: "hoenn", name: "호연", gen: 3, dex: [252, 386], arena: "beach" },
  { id: "sinnoh", name: "신오", gen: 4, dex: [387, 493], arena: "mountain" },
  { id: "unova", name: "하나", gen: 5, dex: [494, 649], arena: "metropolis" },
  { id: "kalos", name: "칼로스", gen: 6, dex: [650, 721], arena: "meadow" },
  { id: "alola", name: "알로라", gen: 7, dex: [722, 809], arena: "island" },
  { id: "galar", name: "가라르", gen: 8, dex: [810, 905], arena: "construction_site" },
  { id: "paldea", name: "팔데아", gen: 9, dex: [906, 1025], arena: "badlands" },
];
export const regionById = (id: string) => REGIONS.find(r => r.id === id)!;

/** Species whose origin region is this one (by national dex number or regional forme). */
export function speciesRegion(id: string): string {
  const s = dex.species.get(id);
  const f = (s.forme || "").toLowerCase();
  if (f.startsWith("alola")) return "alola";
  if (f.startsWith("galar")) return "galar";
  if (f.startsWith("hisui")) return "sinnoh";
  if (f.startsWith("paldea")) return "paldea";
  const r = REGIONS.find(r => s.num >= r.dex[0] && s.num <= r.dex[1]);
  return r ? r.id : "kanto";
}

/** Ultra Beasts that scouts can find in Alola (first stages: Naganadel comes from Poipole). */
export const SCOUT_ULTRA_BEASTS = ["Nihilego", "Buzzwole", "Pheromosa", "Xurkitree", "Celesteela", "Kartana", "Guzzlord", "Poipole", "Stakataka", "Blacephalon"];
/** Non-legendary Paradox Pokémon that scouts can find in Paldea. */
export const SCOUT_PARADOX = [
  "Great Tusk", "Scream Tail", "Brute Bonnet", "Flutter Mane", "Slither Wing", "Sandy Shocks", "Roaring Moon",
  "Iron Treads", "Iron Bundle", "Iron Hands", "Iron Jugulis", "Iron Moth", "Iron Thorns", "Iron Valiant",
];
/** Ultra Beast or Paradox Pokémon: not homegrown anywhere, and they eat half as much again. */
export function isUltraOrParadox(id: string): boolean {
  return dex.species.get(id).tags.some(t => t === "Ultra Beast" || t === "Paradox");
}

export function isLegendaryLike(id: string): boolean {
  const s = dex.species.get(id);
  return s.tags.some(t => ["Restricted Legendary", "Mythical", "Sub-Legendary", "Ultra Beast", "Paradox"].includes(t));
}

/** Korean josa helper: picks 은/는, 이/가, 을/를, 과/와, (으)로 by final consonant. */
export function josa(word: string, pair: "은는" | "이가" | "을를" | "과와" | "으로"): string {
  const ch = word.charCodeAt(word.length - 1);
  const isHangul = ch >= 0xac00 && ch <= 0xd7a3;
  let batchim = false;
  let rieul = false;
  if (isHangul) {
    const jong = (ch - 0xac00) % 28;
    batchim = jong !== 0;
    rieul = jong === 8;
  } else {
    batchim = /[013678lmnr]$/i.test(word);
  }
  if (pair === "으로") return word + (batchim && !rieul ? "으로" : "로");
  const [a, b] = [pair[0], pair[1]];
  return word + (batchim ? a : b);
}
