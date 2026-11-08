// NPC AI evaluator: how good a Pokémon is for a trainer.
//  - stars from IVs (and IVs from stars, with some blur, for scouted Pokémon)
//  - role in singles and doubles, from base stats and moves
//  - team type matrix: which attacking types hit half the team or more, and who covers them
//  - concept fit for specialists (type / theme tag / wildcard that covers a weakness)
//  - picking the six for the entry out of a roster of up to ten
import { dex, toID } from "../../data/dex";
import { calcStats } from "../../battle/calc";
import { Rng } from "../rng";
import type { StatTable, TeamMember } from "../types";
import type { DoublesRole, Role } from "./models";

// ---------- stars ----------

/** Star grade (1–5 in halves) from IVs: what a scout report shows. */
export function starsOf(ivs: StatTable): number {
  const avg = Object.values(ivs).reduce((a, b) => a + b, 0) / 6;
  return Math.max(1, Math.min(5, Math.round((avg / 31) * 5 * 2) / 2));
}

/** IVs for a star grade, each stat blurred a little (the "fuzzy" IVs behind a scout's stars). */
export function ivsForStars(stars: number, rng: Rng): StatTable {
  const mid = (stars / 5) * 31;
  const one = () => Math.max(0, Math.min(31, Math.round(mid + (rng.next() - 0.5) * 8)));
  return { hp: one(), atk: one(), def: one(), spa: one(), spd: one(), spe: one() };
}

// ---------- type matchups ----------

/** Abilities that cancel (0) or halve (0.5) a type's damage. */
const ABILITY_DEF: Record<string, Record<string, number>> = {
  levitate: { Ground: 0 }, eartheater: { Ground: 0 }, flashfire: { Fire: 0 }, wellbakedbody: { Fire: 0 },
  waterabsorb: { Water: 0 }, stormdrain: { Water: 0 }, dryskin: { Water: 0 }, voltabsorb: { Electric: 0 },
  lightningrod: { Electric: 0 }, motordrive: { Electric: 0 }, sapsipper: { Grass: 0 }, thickfat: { Fire: 0.5, Ice: 0.5 },
  heatproof: { Fire: 0.5 }, waterbubble: { Fire: 0.5 }, purifyingsalt: { Ghost: 0.5 },
};
export const ATTACK_TYPES = () => dex.types.names().filter(a => a !== "Stellar");

/** Effectiveness of an attacking type against a typing, abilities included. */
export function effAgainst(a: string, types: string[], ability?: string | null): number {
  const ab = ABILITY_DEF[toID(ability || "")] || {};
  const e = dex.getImmunity(a, types) ? 2 ** dex.getEffectiveness(a, types) : 0;
  return ab[a] != null ? e * ab[a] : e;
}

/** The attacking types a typing is weak to. */
export function weakTo(types: string[], ability?: string | null): Set<string> {
  return new Set(ATTACK_TYPES().filter(a => effAgainst(a, types, ability) >= 2));
}

/** How exposed a typing is (lower is safer): a weakness 10 (×4: 20), a resistance −1 (×¼, immunity −2). */
export function exposure(types: string[], ability?: string | null): number {
  let v = 0;
  for (const a of ATTACK_TYPES()) {
    const e = effAgainst(a, types, ability);
    v += e >= 4 ? 20 : e >= 2 ? 10 : e <= 0.25 ? -2 : e <= 0.5 ? -1 : 0;
  }
  return v;
}

type Typed = { species: string; ability?: string | null };

/** Per attacking type: how many members it hits super-effectively and how many resist it. */
export function typeMatrix(team: Typed[]): Record<string, { weak: number; resist: number }> {
  const out: Record<string, { weak: number; resist: number }> = {};
  for (const a of ATTACK_TYPES()) out[a] = { weak: 0, resist: 0 };
  for (const m of team) {
    const types = dex.species.get(m.species).types;
    for (const a of ATTACK_TYPES()) {
      const e = effAgainst(a, types, m.ability);
      if (e >= 2) out[a].weak++;
      else if (e < 1) out[a].resist++;
    }
  }
  return out;
}

/** Attacking types that hit half the team or more and that fewer than two members resist. */
export function criticalTypes(team: Typed[]): string[] {
  if (!team.length) return [];
  const mx = typeMatrix(team);
  return ATTACK_TYPES().filter(a => mx[a].weak >= Math.ceil(team.length / 2) && mx[a].resist < 2);
}

/** How well a Pokémon covers a team's critical types: resists count 1, immunities 1.5, its own weakness −1. */
export function coverScore(m: Typed, critical: string[]): number {
  const types = dex.species.get(m.species).types;
  let v = 0;
  for (const a of critical) {
    const e = effAgainst(a, types, m.ability);
    v += e === 0 ? 1.5 : e < 1 ? 1 : e >= 2 ? -1 : 0;
  }
  return v;
}

// ---------- roles ----------

const HAZARDS = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
export const PIVOTS = new Set(["uturn", "voltswitch", "flipturn", "partingshot", "teleport", "chillyreception", "shedtail"]);
const SETUP = new Set(["swordsdance", "dragondance", "bulkup", "shiftgear", "coil", "victorydance", "tidyup", "howl", "honeclaws", "nastyplot", "calmmind", "quiverdance", "tailglow", "torchsong", "shellsmash", "growth", "workup", "agility", "rockpolish", "autotomize"]);
const SPEED_CONTROL = new Set(["tailwind", "trickroom", "icywind", "electroweb", "thunderwave", "bulldoze", "glare", "nuzzle", "scaryface", "stringshot", "rocktomb"]);
const SUPPORT_MOVES = new Set(["fakeout", "followme", "ragepowder", "wideguard", "quickguard", "helpinghand", "allyswitch", "spore", "snarl", "partingshot"]);
const SETTER_ABILITIES = new Set(["drought", "drizzle", "sandstream", "snowwarning", "electricsurge", "psychicsurge", "grassysurge", "mistysurge", "orichalcumpulse", "hadronengine", "desolateland", "primordialsea", "seedsower"]);
const SETTER_MOVES = new Set(["raindance", "sunnyday", "sandstorm", "snowscape", "hail", "electricterrain", "psychicterrain", "grassyterrain", "mistyterrain"]);

/** Singles role from base stats alone (for a Pokémon whose moves are still to be chosen). */
export function roleByStats(species: string): Role {
  const b = dex.species.get(species).baseStats;
  const offense = Math.max(b.atk, b.spa);
  const bulk = b.hp + b.def + b.spd;
  if (offense * 3 >= bulk * 1.15 || b.spe >= 100) return b.atk >= b.spa ? "physSweeper" : "specSweeper";
  return b.def >= b.spd ? "physWall" : "specWall";
}

/** Singles role from base stats and the moves it runs. */
export function classifyRole(m: { species: string; moves: string[] }): Role {
  const ids = m.moves.map(x => toID(x));
  if (ids.some(x => HAZARDS.has(x))) return "lead";
  if (ids.some(x => PIVOTS.has(x))) return "pivot";
  const mv = ids.map(x => dex.moves.get(x));
  const phys = mv.filter(x => x.category === "Physical").length;
  const spec = mv.filter(x => x.category === "Special").length;
  const status = mv.filter(x => x.category === "Status").length;
  const byStats = roleByStats(m.species);
  if (status >= 2 && !ids.some(x => SETUP.has(x))) {
    const b = dex.species.get(m.species).baseStats;
    return b.def >= b.spd ? "physWall" : "specWall";
  }
  if (phys + spec >= 2 || ids.some(x => SETUP.has(x))) return phys >= spec ? "physSweeper" : "specSweeper";
  return byStats;
}

/** Doubles jobs a Pokémon can do. */
export function doublesRoles(m: { species: string; moves: string[]; ability?: string | null }): DoublesRole[] {
  const ids = m.moves.map(x => toID(x));
  const ab = toID(m.ability || "");
  const out: DoublesRole[] = [];
  if (ids.some(x => SPEED_CONTROL.has(x))) out.push("speedControl");
  if (ab === "intimidate" || ids.some(x => SUPPORT_MOVES.has(x))) out.push("support");
  if (ids.some(x => {
    const mv = dex.moves.get(x);
    return mv.category !== "Status" && mv.basePower >= 60 && (mv.target === "allAdjacentFoes" || mv.target === "allAdjacent");
  })) out.push("spreadAttacker");
  if (SETTER_ABILITIES.has(ab) || ids.some(x => SETTER_MOVES.has(x))) out.push("weather");
  return out;
}

// ---------- strength ----------

/** Battle strength on paper: the six Lv.50 stats with IVs, EVs and nature (a few hundred points). */
export function monPower(m: TeamMember): number {
  const s = calcStats(m);
  return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

// ---------- entry ----------

export interface Candidate {
  key: string;
  mon: TeamMember;
  /** one of the trainer's own six from the lineup data (its identity) */
  signature: boolean;
  /** filled in because the lineup data is empty */
  placeholder: boolean;
}

/**
 * The six an NPC brings to matches. Greedy: each step takes the Pokémon that adds the most —
 * strength first, then a role the six still lacks, cover for a type that hits half of them, and a doubles job.
 * Specialists keep at most two Pokémon outside their concept (wildcards); the trainer's own six get a small edge.
 */
export function pickEntry(roster: Candidate[], size = 6): string[] {
  if (roster.length <= size) return roster.map(c => c.key);
  const base = new Map(roster.map(c => [c.key, monPower(c.mon) * (c.signature && !c.placeholder ? 1.06 : 1) * (c.placeholder ? 0.94 : 1)]));
  const roles = new Map(roster.map(c => [c.key, classifyRole(c.mon)]));
  const dRoles = new Map(roster.map(c => [c.key, doublesRoles(c.mon)]));
  const chosen: Candidate[] = [];
  while (chosen.length < size) {
    const crit = criticalTypes(chosen.map(c => c.mon));
    const haveRoles = new Set(chosen.map(c => roles.get(c.key)));
    const haveD = new Set(chosen.flatMap(c => dRoles.get(c.key)!));
    let best: Candidate | null = null;
    let bestV = -Infinity;
    for (const c of roster) {
      if (chosen.includes(c)) continue;
      let v = base.get(c.key)!;
      if (!haveRoles.has(roles.get(c.key))) v *= 1.04;
      v *= 1 + 0.03 * Math.max(0, coverScore(c.mon, crit));
      if (dRoles.get(c.key)!.some(r => !haveD.has(r))) v *= 1.02;
      if (v > bestV) (bestV = v), (best = c);
    }
    if (!best) break;
    chosen.push(best);
  }
  // keep the roster's order (lineup slots first) for display and team preview
  return roster.filter(c => chosen.includes(c)).map(c => c.key);
}
