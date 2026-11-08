// NPC AI loadout builder: four moves by role, an EV spread to train toward, and held items that suit the set
// (choice items and Assault Vest only on all-attack sets, Life Orb with a setup / Protect move, Leftovers on walls…).
import { dex } from "../../data/dex";
import { allLearnableMoves, BANNED, RECOVERY, SETUP, STATUS_GOOD } from "../moves";
import { Rng } from "../rng";
import { zeroStats, type StatTable } from "../types";
import { effAgainst, PIVOTS, roleByStats } from "./evaluator";
import type { Role } from "./models";

type Move = ReturnType<typeof dex.moves.get>;

const HAZARD_ORDER = ["stealthrock", "spikes", "stickyweb", "toxicspikes"];
/** Attacks whose damage doesn't come from the user's attacking stat: utility for walls, never a main attack. */
const STAT_FREE = new Set(["foulplay", "bodypress", "seismictoss", "nightshade", "superfang", "ruination", "naturesmadness", "counter", "mirrorcoat", "metalburst", "endeavor"]);
const UTILITY_ATTACKS = ["seismictoss", "nightshade", "foulplay", "bodypress", "icywind", "snarl", "scald", "knockoff", "rapidspin", "mortalspin"];

function bias(species: string) {
  const b = dex.species.get(species).baseStats;
  const hi = Math.max(b.atk, b.spa);
  return { Physical: b.atk / hi, Special: b.spa / hi };
}

/** How good an attack is for this species: power × accuracy × STAB × fit to its better attacking stat. */
function attackScore(species: string, m: Move): number {
  const s = dex.species.get(species);
  let bp = m.basePower;
  if (m.multihit) bp *= Array.isArray(m.multihit) ? 3.1 : m.multihit;
  if (bp <= 1 || m.category === "Status" || STAT_FREE.has(m.id)) return 0;
  const acc = m.accuracy === true ? 100 : m.accuracy;
  const fit = bias(species)[m.category as "Physical" | "Special"];
  let v = Math.min(bp, 150) * (acc / 100) * (s.types.includes(m.type) ? 1.5 : 1) * fit * fit;
  if (m.recoil || m.mindBlownRecoil) v *= 0.92;
  if (Object.values(m.self?.boosts || {}).some(b => (b as number) < 0)) v *= 0.95;
  if (m.flags.charge || m.flags.recharge) v *= 0.5;
  return v;
}

/**
 * Four moves for a role:
 *  - attackers: strongest STAB · second STAB or coverage for what resists it · priority or more coverage · setup
 *  - walls: reliable STAB or a utility attack · status (burn / paralysis / poison / sleep) · recovery or Taunt · pivot
 *  - leads: hazard · Taunt · STAB · status or pivot
 *  - pivots: pivot move · STAB · coverage · status or priority
 */
export function buildMoveset(speciesId: string, role: Role, seed: string, from?: string[]): string[] {
  const s = dex.species.get(speciesId);
  const rng = new Rng(seed);
  const pool = (from ?? allLearnableMoves(s.id)).filter(id => !BANNED.has(id));
  const moves = pool.map(id => dex.moves.get(id));
  const attacks = moves.filter(m => m.category !== "Status" && attackScore(s.id, m) > 0).sort((a, b) => attackScore(s.id, b) - attackScore(s.id, a));
  const chosen: string[] = [];
  const has = (id: string) => pool.includes(id);
  const take = (id: string | undefined) => {
    if (id && !chosen.includes(id) && chosen.length < 4) chosen.push(id);
    return !!id;
  };
  const types = () => new Set(chosen.map(id => dex.moves.get(id)).filter(m => m.category !== "Status").map(m => m.type));
  const stab = () => attacks.find(m => s.types.includes(m.type) && !types().has(m.type) && !chosen.includes(m.id));
  // coverage: what hits the types that resist the moves already chosen
  const coverage = () => {
    const mine = [...types()];
    const walls = dex.types.names().filter(t => t !== "Stellar" && mine.length && mine.every(a => effAgainst(a, [t]) < 1));
    let best: Move | undefined;
    let bestV = 0;
    for (const m of attacks) {
      if (chosen.includes(m.id) || types().has(m.type)) continue;
      const hits = walls.filter(t => effAgainst(m.type, [t]) >= 2).length;
      const v = attackScore(s.id, m) * (1 + 0.25 * hits);
      if (v > bestV) (bestV = v), (best = m);
    }
    return best;
  };
  const fit = bias(s.id);
  const mainCat = fit.Physical >= fit.Special ? "Physical" : "Special";
  const setup = () => {
    const want = mainCat === "Physical" ? "atk" : "spa";
    const c = Object.keys(SETUP).filter(id => has(id) && (SETUP[id] === want || SETUP[id] === "both"));
    return c.length ? c[rng.int(0, c.length - 1)] : undefined;
  };
  const priority = () => attacks.find(m => m.priority > 0 && m.basePower >= 40 && m.category === mainCat && !chosen.includes(m.id));
  const status = (prefer: string[]) => {
    const list = Object.keys(STATUS_GOOD).filter(id => has(id) && !chosen.includes(id) && !["protect", "substitute", "rest"].includes(id));
    list.sort((a, b) => (prefer.includes(b) ? 30 : 0) + STATUS_GOOD[b] - ((prefer.includes(a) ? 30 : 0) + STATUS_GOOD[a]));
    return list[0];
  };
  const recovery = () => [...RECOVERY].find(id => has(id) && !chosen.includes(id));
  const pivot = () => [...PIVOTS].find(id => has(id) && !chosen.includes(id) && id !== "shedtail");
  const hazard = () => HAZARD_ORDER.find(id => has(id) && !chosen.includes(id));
  const b = s.baseStats;

  if (role === "physSweeper" || role === "specSweeper") {
    take(attacks.find(m => s.types.includes(m.type))?.id ?? attacks[0]?.id);
    const second = stab();
    const cov = coverage();
    take(second && cov && attackScore(s.id, cov) > attackScore(s.id, second) * 1.3 ? cov.id : (second || cov)?.id);
    take(priority()?.id) || take(coverage()?.id);
    take(setup()) || take(coverage()?.id);
  } else if (role === "physWall" || role === "specWall") {
    const util = UTILITY_ATTACKS.find(id => has(id) && (id === "bodypress" ? b.def >= 100 : id === "seismictoss" || id === "nightshade" ? Math.max(b.atk, b.spa) < 85 : true));
    const st = attacks.find(m => s.types.includes(m.type));
    take(st && attackScore(s.id, st) >= 90 ? st.id : util ?? st?.id ?? attacks[0]?.id);
    take(status(role === "physWall" ? ["willowisp"] : ["toxic", "thunderwave"]));
    take(recovery()) || take(["taunt", "encore", "leechseed", "haze"].find(id => has(id) && !chosen.includes(id)));
    take(pivot()) || take(status([])) || take(coverage()?.id);
  } else if (role === "lead") {
    take(hazard());
    take(has("taunt") ? "taunt" : undefined);
    take(attacks.find(m => s.types.includes(m.type))?.id ?? attacks[0]?.id);
    take(status(["thunderwave", "glare", "willowisp", "spore"])) || take(pivot()) || take(coverage()?.id);
  } else {
    take(pivot());
    take(attacks.find(m => s.types.includes(m.type))?.id ?? attacks[0]?.id);
    take(coverage()?.id);
    take(status(["willowisp", "thunderwave", "toxic"])) || take(priority()?.id) || take(coverage()?.id);
  }
  // fill what is left with the best remaining attacks
  for (const m of attacks) if (chosen.length < 4) take(m.id);
  if (!chosen.length) chosen.push(pool[0] || "tackle");
  return chosen.slice(0, 4);
}

/** A whole moveset for a species with no moves in the data (role from its base stats). */
export function autoSet(speciesId: string, seed: string): string[] {
  return buildMoveset(speciesId, roleByStats(speciesId), seed);
}

/** The EV spread an NPC trains toward for a role (slow attackers skip Speed for HP, for Trick Room). */
export function evTarget(role: Role, species: string): StatTable {
  const b = dex.species.get(species).baseStats;
  const ev = zeroStats();
  const slow = b.spe < 50;
  const atk = b.atk >= b.spa ? "atk" : "spa";
  if (role === "physSweeper" || role === "specSweeper") {
    const a = role === "physSweeper" ? "atk" : "spa";
    ev[a] = 252;
    if (slow) (ev.hp = 252), (ev[a === "atk" ? "def" : "spd"] = 4);
    else (ev.spe = 252), (ev.hp = 4);
  } else if (role === "physWall") (ev.hp = 252), (ev.def = 252), (ev.spd = 4);
  else if (role === "specWall") (ev.hp = 252), (ev.spd = 252), (ev.def = 4);
  else {
    // leads and pivots: bulky ones invest in HP and their better defence, the rest in speed (and attack)
    const bulky = roleByStats(species) === "physWall" || roleByStats(species) === "specWall";
    if (bulky || slow) (ev.hp = 252), (ev[b.def >= b.spd ? "def" : "spd"] = 252), (ev[b.def >= b.spd ? "spd" : "def"] = 4);
    else if (role === "pivot" && Math.max(b.atk, b.spa) >= 100) (ev[atk] = 252), (ev.spe = 252), (ev.hp = 4);
    else (ev.hp = 252), (ev.spe = 252), (ev.def = 4);
  }
  return ev;
}

const TYPE_BOOSTER: Record<string, string> = {
  Normal: "Silk Scarf", Fighting: "Black Belt", Flying: "Sharp Beak", Poison: "Poison Barb", Ground: "Soft Sand",
  Rock: "Hard Stone", Bug: "Silver Powder", Ghost: "Spell Tag", Steel: "Metal Coat", Fire: "Charcoal",
  Water: "Mystic Water", Grass: "Miracle Seed", Electric: "Magnet", Psychic: "Twisted Spoon",
  Ice: "Never-Melt Ice", Dragon: "Dragon Fang", Dark: "Black Glasses", Fairy: "Fairy Feather",
};

/**
 * Held items for a set, best first, following real-play rules:
 *  - Choice Band / Specs / Scarf and Assault Vest only when all four moves attack (Trick counts as fine for choice)
 *  - Life Orb for attackers that mix in a setup move or Protect; Focus Sash for frail fast attackers and leads
 *  - Leftovers / Black Sludge / Rocky Helmet for walls; Eviolite for anything that still evolves
 *  - Sitrus / Lum Berry for supports and tanks
 */
export function itemWishes(m: { species: string; moves: string[] }, role: Role): string[] {
  const s = dex.species.get(m.species);
  const b = s.baseStats;
  const mv = m.moves.map(x => dex.moves.get(x));
  const status = mv.filter(x => x.category === "Status" && x.id !== "trick").length;
  const allAttack = status === 0;
  const phys = mv.filter(x => x.category === "Physical").length >= mv.filter(x => x.category === "Special").length;
  const frail = b.hp + b.def + b.spd < 230;
  const fast = b.spe >= 95;
  const setupOrProtect = mv.some(x => SETUP[x.id] || x.id === "protect");
  const out: string[] = [];
  if (s.nfe) out.push("Eviolite");
  const sweeper = role === "physSweeper" || role === "specSweeper";
  if (sweeper) {
    if (allAttack) out.push(phys ? "Choice Band" : "Choice Specs", b.spe >= 70 && b.spe < 100 ? "Choice Scarf" : "", frail ? "" : "Assault Vest");
    if (setupOrProtect || !allAttack) out.push("Life Orb");
    if (frail && fast) out.push("Focus Sash");
    out.push("Life Orb", "Expert Belt");
  } else if (role === "physWall" || role === "specWall") {
    out.push(s.types.includes("Poison") ? "Black Sludge" : "Leftovers", role === "physWall" ? "Rocky Helmet" : "", allAttack ? "Assault Vest" : "", "Sitrus Berry");
  } else if (role === "lead") {
    out.push(frail ? "Focus Sash" : "", mv.some(x => x.id === "reflect" || x.id === "lightscreen") ? "Light Clay" : "", "Leftovers", "Focus Sash");
  } else {
    out.push(allAttack ? (frail ? "Choice Scarf" : "Assault Vest") : "", "Heavy-Duty Boots", "Leftovers", "Sitrus Berry");
  }
  out.push("Sitrus Berry", "Lum Berry", "Leftovers");
  // drop items that clash with the moves (choice items and Assault Vest need four attacks)
  const ok = (i: string) => !!i && dex.items.get(i).exists && (allAttack || !(/^Choice /.test(i) || i === "Assault Vest"));
  return [...new Set(out.filter(ok))];
}

/** Cheap stand-ins while saving for the real item: the main STAB's type booster, or a berry. */
export function budgetItems(m: { species: string; moves: string[] }): string[] {
  const s = dex.species.get(m.species);
  const main = m.moves.map(x => dex.moves.get(x)).find(x => x.category !== "Status" && s.types.includes(x.type));
  return [main ? TYPE_BOOSTER[main.type] : "", "Sitrus Berry", "Lum Berry"].filter(Boolean);
}

export const isBudgetItem = (item: string) => Object.values(TYPE_BOOSTER).includes(item) || /Berry$/.test(item);
