// Stat and damage estimation used by the AI (not the real battle mechanics,
// which come from the Showdown simulator).
import { dex, toID } from "../data/dex";
import type { MonSet, StatTable } from "../game/types";
import { BATTLE_LEVEL } from "../game/types";

export interface Battler {
  species: string;
  types: string[];
  level: number;
  stats: StatTable; // hp = max HP
  hp: number;
  maxhp: number;
  boosts: Partial<Record<"atk" | "def" | "spa" | "spd" | "spe" | "accuracy" | "evasion", number>>;
  ability: string;
  item: string;
  status: string;
  moves: string[];
  weightkg: number;
  nfe: boolean;
}

export function calcStats(set: MonSet): StatTable {
  const s = dex.species.get(set.species);
  const n = dex.natures.get(set.nature || "Serious");
  const out = {} as StatTable;
  for (const k of ["hp", "atk", "def", "spa", "spd", "spe"] as const) {
    const base = s.baseStats[k];
    const iv = set.ivs?.[k] ?? 31;
    const ev = set.evs?.[k] ?? 0;
    if (k === "hp") {
      out.hp = s.baseStats.hp === 1 ? 1 : Math.floor(((2 * base + iv + Math.floor(ev / 4)) * BATTLE_LEVEL) / 100) + BATTLE_LEVEL + 10;
    } else {
      let v = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * BATTLE_LEVEL) / 100) + 5;
      if (n.plus === k) v = Math.floor(v * 1.1);
      if (n.minus === k) v = Math.floor(v * 0.9);
      out[k] = v;
    }
  }
  return out;
}

export function battlerFromSet(set: MonSet): Battler {
  const s = dex.species.get(set.species);
  const stats = calcStats(set);
  return {
    species: s.name,
    types: s.types.slice(),
    level: BATTLE_LEVEL,
    stats,
    hp: stats.hp,
    maxhp: stats.hp,
    boosts: {},
    ability: toID(set.ability || s.abilities[0]),
    item: toID(set.item),
    status: "",
    moves: set.moves.map(toID),
    weightkg: s.weightkg,
    nfe: !!s.nfe,
  };
}

/** Builds a Battler snapshot from a live simulator Pokémon. */
export function battlerFromPokemon(p: any): Battler {
  return {
    species: p.species.name,
    types: p.getTypes(),
    level: p.level,
    stats: { hp: p.maxhp, ...p.storedStats },
    hp: p.hp,
    maxhp: p.maxhp,
    boosts: { ...p.boosts },
    ability: p.getAbility().id,
    item: p.item,
    status: p.status,
    moves: p.moveSlots.map((m: any) => m.id),
    weightkg: p.species.weightkg,
    nfe: !!p.species.nfe,
  };
}

const boostMul = (s = 0) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

function effStat(b: Battler, k: "atk" | "def" | "spa" | "spd" | "spe") {
  let v = b.stats[k] * boostMul(b.boosts[k]);
  if (k === "spe" && b.status === "par") v *= 0.5;
  if (k === "spe" && b.item === "choicescarf") v *= 1.5;
  return v;
}

export function speedOf(b: Battler) {
  return effStat(b, "spe");
}

export function typeMultiplier(moveType: string, defTypes: string[]): number {
  if (!dex.getImmunity(moveType, defTypes)) return 0;
  return Math.pow(2, dex.getEffectiveness(moveType, defTypes));
}

const ABILITY_IMMUNE: Record<string, string> = {
  levitate: "Ground", flashfire: "Fire", wellbakedbody: "Fire", waterabsorb: "Water", stormdrain: "Water",
  dryskin: "Water", voltabsorb: "Electric", lightningrod: "Electric", motordrive: "Electric", sapsipper: "Grass",
  eartheater: "Ground",
};
const TYPE_ITEMS: Record<string, string> = {
  silkscarf: "Normal", charcoal: "Fire", mysticwater: "Water", magnet: "Electric", miracleseed: "Grass",
  nevermeltice: "Ice", blackbelt: "Fighting", poisonbarb: "Poison", softsand: "Ground", sharpbeak: "Flying",
  twistedspoon: "Psychic", silverpowder: "Bug", hardstone: "Rock", spelltag: "Ghost", dragonfang: "Dragon",
  blackglasses: "Dark", metalcoat: "Steel", fairyfeather: "Fairy",
};

/** Expected damage in HP (average roll, no crit), ignoring accuracy. */
export function estDamage(att: Battler, def: Battler, moveId: string, weather = ""): number {
  const m = dex.moves.get(moveId);
  if (!m.exists || m.category === "Status") return 0;
  let type = m.type;
  if (m.type === "Normal" && ["aerilate", "pixilate", "refrigerate", "galvanize"].includes(att.ability)) {
    type = { aerilate: "Flying", pixilate: "Fairy", refrigerate: "Ice", galvanize: "Electric" }[att.ability]!;
  }
  const moldBreaker = ["moldbreaker", "teravolt", "turboblaze"].includes(att.ability);
  if (!moldBreaker && ABILITY_IMMUNE[def.ability] === type) return 0;
  if (type === "Ground" && def.item === "airballoon") return 0;
  let eff = typeMultiplier(type, def.types);
  if (eff === 0 && att.ability === "scrappy" && (type === "Normal" || type === "Fighting")) eff = 1;
  if (eff === 0) return 0;
  if (!moldBreaker && def.ability === "wonderguard" && eff <= 1) return 0;

  // fixed-damage moves
  if (m.damage === "level") return att.level;
  if (typeof m.damage === "number") return m.damage;
  if (["superfang", "naturesmadness", "ruination"].includes(m.id)) return def.hp / 2;
  if (m.ohko) return def.maxhp * 0.3;
  if (["counter", "mirrorcoat", "metalburst", "bide", "endeavor"].includes(m.id)) return 0;

  let bp = m.basePower;
  switch (m.id) {
    case "eruption": case "waterspout": case "dragonenergy": bp = Math.max(1, Math.floor((150 * att.hp) / att.maxhp)); break;
    case "facade": if (att.status) bp *= 2; break;
    case "hex": case "infernalparade": if (def.status) bp *= 2; break;
    case "knockoff": if (def.item) bp *= 1.5; break;
    case "acrobatics": if (!att.item) bp *= 2; break;
    case "lowkick": case "grassknot": {
      const w = def.weightkg;
      bp = w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20;
      break;
    }
    case "heavyslam": case "heatcrash": {
      const r = att.weightkg / Math.max(0.1, def.weightkg);
      bp = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40;
      break;
    }
    case "gyroball": bp = Math.min(150, Math.floor((25 * speedOf(def)) / Math.max(1, speedOf(att))) + 1); break;
    case "electroball": { const r = speedOf(att) / Math.max(1, speedOf(def)); bp = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; break; }
    case "storedpower": case "powertrip": bp = 20 + 20 * Object.values(att.boosts).reduce((a, b) => a + Math.max(0, b || 0), 0); break;
    case "reversal": case "flail": { const r = att.hp / att.maxhp; bp = r <= 0.04 ? 200 : r <= 0.1 ? 150 : r <= 0.2 ? 100 : r <= 0.35 ? 80 : r <= 0.69 ? 40 : 20; break; }
  }
  if (!bp) bp = 60;
  let hits = 1;
  if (m.multihit) hits = Array.isArray(m.multihit) ? (att.ability === "skilllink" ? m.multihit[1] : m.multihit[0] === 2 && m.multihit[1] === 5 ? 3.1 : (m.multihit[0] + m.multihit[1]) / 2) : m.multihit;
  if (att.ability === "technician" && bp <= 60) bp *= 1.5;
  if (att.ability === "toughclaws" && m.flags.contact) bp *= 1.3;
  if (att.ability === "ironfist" && m.flags.punch) bp *= 1.2;
  if (att.ability === "strongjaw" && m.flags.bite) bp *= 1.5;
  if (att.ability === "megalauncher" && m.flags.pulse) bp *= 1.5;
  if (att.ability === "sharpness" && m.flags.slicing) bp *= 1.5;
  if (att.ability === "sheerforce" && m.secondaries) bp *= 1.3;
  if (type !== m.type) bp *= 1.2;

  const physical = m.category === "Physical";
  const useDefStat = m.overrideDefensiveStat || (physical ? "def" : "spd");
  let A = m.id === "foulplay" ? effStat(def, "atk") : effStat(att, m.overrideOffensiveStat || (physical ? "atk" : "spa"));
  if (m.id === "bodypress") A = effStat(att, "def");
  let D = effStat(def, useDefStat as "def" | "spd");
  if (physical) {
    if (["hugepower", "purepower"].includes(att.ability)) A *= 2;
    if (att.ability === "hustle") A *= 1.5;
    if (att.ability === "guts" && att.status) A *= 1.5;
    if (att.item === "choiceband") A *= 1.5;
    if (!moldBreaker && def.ability === "furcoat") D *= 2;
  } else {
    if (att.item === "choicespecs") A *= 1.5;
    if (def.item === "assaultvest") D *= 1.5;
    if (!moldBreaker && def.ability === "icescales") A *= 0.5;
  }
  if (att.item === "lightball" && att.species.startsWith("Pikachu")) A *= 2;
  if (def.item === "eviolite" && def.nfe) D *= 1.5;

  let dmg = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * bp * A) / Math.max(1, D)) / 50) + 2;
  // modifiers
  if (weather === "sunnyday" || weather === "desolateland") {
    if (type === "Fire") dmg *= 1.5;
    if (type === "Water") dmg *= 0.5;
  } else if (weather === "raindance" || weather === "primordialsea") {
    if (type === "Water") dmg *= 1.5;
    if (type === "Fire") dmg *= 0.5;
  }
  if (att.types.includes(type)) dmg *= att.ability === "adaptability" ? 2 : 1.5;
  dmg *= eff;
  if (physical && att.status === "brn" && att.ability !== "guts" && m.id !== "facade") dmg *= 0.5;
  if (att.item === "lifeorb") dmg *= 1.3;
  if (att.item === "expertbelt" && eff > 1) dmg *= 1.2;
  if (TYPE_ITEMS[att.item] === type) dmg *= 1.2;
  if (!moldBreaker) {
    if (["multiscale", "shadowshield"].includes(def.ability) && def.hp === def.maxhp) dmg *= 0.5;
    if (["filter", "solidrock", "prismarmor"].includes(def.ability) && eff > 1) dmg *= 0.75;
    if (def.ability === "thickfat" && (type === "Fire" || type === "Ice")) dmg *= 0.5;
    if (def.ability === "heatproof" && type === "Fire") dmg *= 0.5;
    if (def.ability === "fluffy" && m.flags.contact) dmg *= 0.5;
    if (def.ability === "purifyingsalt" && type === "Ghost") dmg *= 0.5;
  }
  return dmg * 0.925 * hits;
}

export function accuracyOf(moveId: string): number {
  const m = dex.moves.get(moveId);
  return m.accuracy === true ? 1 : m.accuracy / 100;
}

/** Best expected damage fraction (0..∞) att can deal to def with its moves. */
export function bestHit(att: Battler, def: Battler, weather = ""): { move: string; frac: number } {
  let best = { move: att.moves[0], frac: 0 };
  for (const mv of att.moves) {
    const frac = (estDamage(att, def, mv, weather) * accuracyOf(mv)) / Math.max(1, def.hp);
    if (frac > best.frac) best = { move: mv, frac };
  }
  return best;
}

/**
 * Head-to-head score of a vs b, roughly in [-1, 1]. Positive favors a.
 * Considers who moves first and how many hits each needs.
 */
export function matchup(a: Battler, b: Battler): number {
  const ah = bestHit(a, b).frac;
  const bh = bestHit(b, a).frac;
  const aHits = ah > 0 ? Math.ceil(1 / Math.min(1, ah)) : 9;
  const bHits = bh > 0 ? Math.ceil(1 / Math.min(1, bh)) : 9;
  const aFirst = speedOf(a) >= speedOf(b);
  let score = 0;
  if (aHits < bHits || (aHits === bHits && aFirst)) score += 0.5;
  else score -= 0.5;
  score += Math.max(-0.5, Math.min(0.5, (Math.min(ah, 1.5) - Math.min(bh, 1.5)) / 2));
  return score;
}
