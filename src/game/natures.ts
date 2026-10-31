// Picks a nature that fits a moveset, preferring what real players use.
// Source: Pokémon Showdown ladder usage sets (the MIT-licensed "stats" data in @smogon/sets),
// Gen 3–8. When nothing fits, falls back to simple role rules.
import usage from "../data/gen/usage-natures.json";
import { dex, toID } from "../data/dex";

type UsageSet = [string, string[], number]; // nature, moves, weight (newer gen / singles = higher)
const U = usage as unknown as Record<string, UsageSet[]>;

/** Moves whose damage does not depend on the user's Attack / Sp. Atk. */
const STAT_FREE = new Set([
  "counter", "mirrorcoat", "metalburst", "seismictoss", "nightshade", "superfang", "naturesmadness", "ruination",
  "endeavor", "finalgambit", "bide", "foulplay", "bodypress", "dragonrage", "sonicboom", "psywave", "guardianofalola",
]);

export interface MoveProfile {
  phys: number;
  spec: number;
  status: number;
  trickRoom: boolean;
}

export function moveProfile(moves: string[]): MoveProfile {
  const p: MoveProfile = { phys: 0, spec: 0, status: 0, trickRoom: false };
  for (const id of moves.map(toID)) {
    const m = dex.moves.get(id);
    if (!m.exists) continue;
    if (id === "trickroom") p.trickRoom = true;
    if (m.category === "Status") p.status++;
    else if (STAT_FREE.has(id) || m.ohko) p.status++;
    else if (m.category === "Physical") p.phys++;
    else p.spec++;
  }
  return p;
}

function fits(nature: string, prof: MoveProfile, baseSpe: number): boolean {
  const n = dex.natures.get(nature);
  if (!n.plus) return true; // neutral natures always fit
  if (prof.phys > 0 && n.minus === "atk") return false;
  if (prof.spec > 0 && n.minus === "spa") return false;
  if (prof.phys > 0 && prof.spec === 0 && n.plus === "spa") return false;
  if (prof.spec > 0 && prof.phys === 0 && n.plus === "atk") return false;
  if (n.minus === "spe" && !prof.trickRoom && baseSpe > 50) return false;
  return true;
}

/** Rule-based fallback from the moveset and base stats. */
export function ruleNature(speciesId: string, prof: MoveProfile): string {
  const b = dex.species.get(speciesId).baseStats;
  if (prof.trickRoom) return prof.spec > prof.phys ? "Quiet" : "Brave";
  const fast = b.spe >= 80;
  const attacks = prof.phys + prof.spec;
  if (attacks <= 1 && prof.status >= 2) {
    if (b.def >= b.spd) return prof.phys ? "Impish" : "Bold";
    return prof.phys ? "Careful" : "Calm";
  }
  if (prof.spec === 0) return fast ? "Jolly" : "Adamant";
  if (prof.phys === 0) return fast ? "Timid" : "Modest";
  if (prof.phys >= prof.spec) return fast ? "Naive" : "Lonely";
  return fast ? "Hasty" : "Mild";
}

export interface NaturePick {
  nature: string;
  source: "usage" | "rule";
}

export function pickNature(speciesId: string, moves: string[]): NaturePick {
  const s = dex.species.get(speciesId);
  const prof = moveProfile(moves);
  if (prof.trickRoom) return { nature: ruleNature(s.id, prof), source: "rule" };
  const ids: string[] = moves.map(m => toID(m) as string);
  const keys = [s.id, toID(s.changesFrom || ""), toID(s.baseSpecies)].filter(Boolean);
  const sets: UsageSet[] = [];
  for (const k of keys) if (U[k]) {
    sets.push(...U[k]);
    break;
  }
  let best: UsageSet | null = null;
  let bestScore = -1;
  let bestOverlap = 0;
  const votes: Record<string, number> = {};
  const attacker = prof.phys + prof.spec >= 3;
  for (const set of sets) {
    if (!dex.natures.get(set[0]).plus) continue; // skip neutral natures from usage data
    if (!fits(set[0], prof, s.baseStats.spe)) continue;
    const overlap = set[1].filter(m => ids.includes(m)).length;
    // an attacking moveset shouldn't inherit a defensive nature from a different (wall) set
    const plus = dex.natures.get(set[0]).plus;
    if (attacker && (plus === "def" || plus === "spd") && overlap < 3) continue;
    const score = overlap * 10 + set[2];
    votes[set[0]] = (votes[set[0]] || 0) + set[2];
    if (score > bestScore) {
      bestScore = score;
      best = set;
      bestOverlap = overlap;
    }
  }
  if (best && bestOverlap >= 2) return { nature: best[0], source: "usage" };
  // weak match: take the most-used fitting nature for this species
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  if (top) return { nature: top[0], source: "usage" };
  return { nature: ruleNature(s.id, prof), source: "rule" };
}
