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
import type { Archetype, DoublesRole, Format, Need, Role, Synergy } from "./models";

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

// ---------- team synergy ----------

type Member = { species: string; moves: string[]; ability?: string | null; item?: string | null };

const HAZARD_REMOVAL = new Set(["rapidspin", "defog", "mortalspin", "tidyup", "courtchange"]);
const ANTI_SETUP = new Set(["encore", "taunt", "haze", "clearsmog", "roar", "whirlwind", "dragontail", "circlethrow", "yawn"]);
const WALLBREAK = new Set(["taunt", "trick", "switcheroo", "knockoff", "swordsdance", "nastyplot", "bellydrum", "tailglow", "shellsmash"]);
const SCREENS = new Set(["reflect", "lightscreen", "auroraveil"]);
const LEAD_SUPPORT = new Set([...HAZARDS, ...SCREENS, "yawn", "thunderwave", "glare", "spore", "stickyweb"]);
const PROTECTS = new Set(["protect", "detect", "spikyshield", "kingsshield", "banefulbunker", "silktrap", "burningbulwark"]);
const REDIRECT = new Set(["followme", "ragepowder", "helpinghand", "pollenpuff", "allyswitch"]);
/** Field speed control that works for the whole side in doubles. */
const FIELD_SPEED = new Set(["tailwind", "trickroom", "icywind", "electroweb"]);
const RECOVER = new Set(["recover", "roost", "slackoff", "softboiled", "milkdrink", "moonlight", "morningsun", "synthesis", "shoreup", "strengthsap", "healorder", "wish", "junglehealing", "lifedew", "rest"]);
const WEATHER_ABUSE = new Set(["swiftswim", "chlorophyll", "sandrush", "slushrush", "sandforce", "solarpower", "surgesurfer", "hydration", "raindish", "icebody", "protosynthesis", "quarkdrive", "dryskin"]);
/** Type cores whose members cover each other's weaknesses. */
const TRI_CORES: string[][] = [["Fire", "Water", "Grass"], ["Dragon", "Steel", "Fairy"], ["Fighting", "Dark", "Psychic"]];
/** Attacking types few teams can afford to have no answer to. */
const CONSISTENT = ["Ghost", "Dragon", "Ground", "Fairy", "Fighting"];

const idsOf = (m: Member): string[] => m.moves.map(x => toID(x));
const choiceOrVest = (m: Member) => /^(choice|assaultvest)/.test(toID(m.item || ""));

/** Ways a member controls speed: a move, a Choice Scarf, or a strong priority attack. */
function speedControlOf(m: Member): boolean {
  if (toID(m.item || "") === "choicescarf") return true;
  return idsOf(m).some(x => {
    if (SPEED_CONTROL.has(x)) return true;
    const mv = dex.moves.get(x);
    return mv.category !== "Status" && mv.priority > 0 && mv.basePower >= 40;
  });
}

/** What a team is built around. */
export function archetypeOf(team: Member[]): Archetype {
  const ids = team.map(idsOf);
  const base = team.map(m => dex.species.get(m.species).baseStats);
  if (ids.some(l => l.includes("trickroom")) && base.filter(b => b.spe <= 60 && Math.max(b.atk, b.spa) >= 95).length >= 2) return "trickroom";
  if (team.some((m, i) => SETTER_ABILITIES.has(toID(m.ability || "")) || ids[i].some(x => SETTER_MOVES.has(x)))) return "weather";
  const walls = team.filter((m, i) => /Wall$/.test(classifyRole(m)) && ids[i].some(x => RECOVER.has(x))).length;
  if (walls >= 3) return "stall";
  if (ids.filter(l => l.some(x => SETUP.has(x))).length >= 2 && ids.some(l => l.some(x => LEAD_SUPPORT.has(x)))) return "setup";
  if (ids.filter(l => l.some(x => PIVOTS.has(x))).length >= 2 && walls >= 1) return "cycle";
  return "offense";
}

/**
 * How well a team hangs together for a format (a multiplier around 1) and what it lacks:
 *  - type cores (Fire-Water-Grass, Dragon-Steel-Fairy, Fighting-Dark-Psychic) and a cushion for every
 *    consistent attacking type (Ghost, Dragon, Ground, Fairy, Fighting); types that hit half the team
 *  - both a physical and a special attacker; a way to control speed
 *  - what its archetype needs (Trick Room: slow hitters; weather: its abusers; setup: a lead that opens the way)
 *  - league (six): hazards and their removal, a wallbreaker, a physical and a special wall
 *  - doubles: Protect, Fake Out / Intimidate, Tailwind / Trick Room / Icy Wind, spread attacks
 *  - singles (three): something that stops a setup sweep
 * `threats`: the opponents' main attackers — one of them nobody here checks costs a little.
 */
export function evaluateTeamSynergy(team: Member[], format: Format, threats: Member[] = []): Synergy {
  const parts: Record<string, number> = {};
  const missing: Need[] = [];
  const archetype = archetypeOf(team);
  if (team.length < 2) return { score: 1, archetype, missing, parts };
  const add = (k: string, v: number) => (parts[k] = (parts[k] || 0) + v);
  const ids = team.map(idsOf);
  const types = team.map(m => dex.species.get(m.species).types);
  const roles = team.map(classifyRole);
  const has = (set: Set<string>) => ids.some(l => l.some(x => set.has(x)));
  const full = team.length >= 5; // a whole entry: missing roles count

  // type cores: three different members, one for each type
  let cores = 0;
  for (const core of TRI_CORES) {
    const owners = core.map(t => team.map((_, i) => i).filter(i => types[i].includes(t)));
    const distinct = owners[0].some(a => owners[1].some(b => b !== a && owners[2].some(c => c !== a && c !== b)));
    if (distinct) cores++;
  }
  if (cores) add("triCore", cores >= 2 ? 0.12 : 0.08);
  // cushions for the consistent types, and types that hit half the team
  const mx = typeMatrix(team);
  for (const a of CONSISTENT) if (!mx[a].resist) {
    add("cushion", -0.05);
    missing.push(`cushion:${a}`);
  }
  if (parts.cushion) parts.cushion = Math.max(-0.15, parts.cushion);
  add("critical", -0.04 * criticalTypes(team).length);

  // attackers on both sides
  const cats = team.map((m, i) => {
    const mv = ids[i].map(x => dex.moves.get(x)).filter(x => x.category !== "Status" && x.basePower >= 60);
    const b = dex.species.get(m.species).baseStats;
    return { phys: mv.some(x => x.category === "Physical") && b.atk >= 80, spec: mv.some(x => x.category === "Special") && b.spa >= 80 };
  });
  const phys = cats.some(c => c.phys);
  const spec = cats.some(c => c.spec);
  if (phys && spec) add("attackers", 0.05);
  else if (full) {
    add("attackers", -0.15);
    missing.push(phys ? "special" : "physical");
  }
  // speed control
  const speed = team.filter(speedControlOf).length;
  if (speed) add("speed", speed >= 2 ? 0.06 : 0.04);
  else if (full) {
    add("speed", -0.1);
    missing.push("speedControl");
  }

  // the archetype's own parts
  const base = team.map(m => dex.species.get(m.species).baseStats);
  if (archetype === "trickroom") add("archetype", Math.min(0.1, 0.03 * base.filter(b => b.spe <= 60 && Math.max(b.atk, b.spa) >= 95).length));
  if (archetype === "weather") add("archetype", Math.min(0.1, 0.04 * team.filter(m => WEATHER_ABUSE.has(toID(m.ability || ""))).length + 0.02));
  if (archetype === "setup") add("archetype", 0.06);
  if (archetype === "cycle") add("archetype", 0.05);
  if (archetype === "stall") add("archetype", 0.04);

  if (format === "league") {
    if (has(HAZARDS)) add("hazard", 0.05);
    else if (full) (add("hazard", -0.08), missing.push("hazard"));
    if (has(HAZARD_REMOVAL)) add("removal", 0.04);
    else if (full) (add("removal", -0.06), missing.push("hazardRemoval"));
    if (has(WALLBREAK)) add("breaker", 0.03);
    else if (full) (add("breaker", -0.04), missing.push("wallbreaker"));
    if (roles.includes("physWall") && roles.includes("specWall")) add("walls", 0.04);
    else if (full && archetype !== "offense" && archetype !== "setup") missing.push("wallCore");
    if (has(PIVOTS)) add("pivot", 0.02);
  } else if (format === "doubles") {
    const able = team.filter(m => !choiceOrVest(m));
    const guarded = able.filter(m => idsOf(m).some(x => PROTECTS.has(x))).length;
    add("protect", 0.08 * (able.length ? guarded / able.length : 1));
    if (full && guarded * 2 < able.length) missing.push("protect");
    const disrupt = team.filter(m => toID(m.ability || "") === "intimidate" || idsOf(m).includes("fakeout")).length;
    if (disrupt) add("fakeOut", Math.min(0.1, 0.05 * disrupt));
    else if (full) (add("fakeOut", -0.04), missing.push("fakeOut"));
    if (has(REDIRECT)) add("redirect", 0.03);
    if (has(FIELD_SPEED)) add("doublesSpeed", 0.06);
    else if (full) (add("doublesSpeed", -0.12), missing.push("doublesSpeed"));
    const spreaders = team.filter(m => doublesRoles(m).includes("spreadAttacker")).length;
    if (spreaders) add("spread", 0.04);
    else if (full) missing.push("spread");
    if (ids.some(l => l.includes("wideguard"))) add("wideGuard", 0.02);
    if (archetype === "weather" && spreaders) add("weatherSpread", 0.03);
  } else {
    if (has(ANTI_SETUP) || speed) add("antiSetup", 0.03);
    else if (full) (add("antiSetup", -0.04), missing.push("antiSetup"));
    if (has(SETUP) && has(LEAD_SUPPORT)) add("setupPlan", 0.03);
  }

  // the opponents' main attackers: someone should resist their best same-type attack
  for (const t of threats.slice(0, 5)) {
    const st = dex.species.get(t.species).types;
    const atk = idsOf(t).map(x => dex.moves.get(x)).filter(x => x.category !== "Status" && st.includes(x.type)).map(x => x.type);
    const main = atk.length ? atk : st;
    const answered = team.some((m, i) => main.every(a => effAgainst(a, types[i], m.ability) < 1));
    if (!answered) add("meta", -0.03);
  }

  const score = Math.max(0.6, Math.min(1.4, 1 + Object.values(parts).reduce((a, b) => a + b, 0)));
  return { score, archetype, missing, parts };
}

/** A type specialist's type: four or more of its own six share it (null for mixed teams). */
export function specialtyType(lineup: { species: string }[]): string | null {
  const count: Record<string, number> = {};
  for (const m of lineup) for (const t of dex.species.get(m.species).types) count[t] = (count[t] || 0) + 1;
  const [type, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  return n >= 4 ? type : null;
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

function* combos(n: number, k: number, from = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = from; i <= n - (k - acc.length); i++) {
    acc.push(i);
    yield* combos(n, k, i + 1, acc);
    acc.pop();
  }
}

/**
 * The Pokémon an NPC brings (six for tournaments, eight for the league roster): every combination is weighed —
 * strength on paper × how well the group hangs together for the format (evaluateTeamSynergy).
 * The trainer's own six count a little more than recruits (its identity), placeholders a little less; a
 * type specialist (`concept`) keeps to its type but for one wildcard, unless that wildcard is the only cushion
 * for a type that hits half the team.
 */
export function pickEntry(roster: Candidate[], size = 6, format: Format = "singles", concept?: string | null): string[] {
  if (roster.length <= size) return roster.map(c => c.key);
  const base = roster.map(c => monPower(c.mon) * (c.signature && !c.placeholder ? 1.06 : 1) * (c.placeholder ? 0.94 : 1));
  const off = roster.map(c => !!concept && !dex.species.get(c.mon.species).types.includes(concept));
  let best: number[] = [];
  let bestV = -Infinity;
  for (const idx of combos(roster.length, size)) {
    const team = idx.map(i => roster[i].mon);
    let v = idx.reduce((a, i) => a + base[i], 0) * evaluateTeamSynergy(team, format).score;
    // a specialist's second Pokémon outside its type costs, the first (a wildcard) is free
    const outside = idx.filter(i => off[i]).length;
    if (outside > 1) v *= 1 - 0.06 * (outside - 1);
    if (v > bestV) (bestV = v), (best = idx);
  }
  // keep the roster's order (lineup slots first) for display and team preview
  return best.map(i => roster[i].key);
}
