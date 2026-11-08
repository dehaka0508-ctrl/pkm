// 새출발 (fresh start): every NPC's six start over as Lv.5 first-stage Pokémon, with random natures, abilities
// and IVs, and grow back toward the lineup's Pokémon week by week (levels, evolutions, new moves).
import { dex } from "../data/dex";
import { GENDER_FORM_BASES } from "../data/forms";
import { allTrainers, resolveTeam, trainerById } from "./lineups";
import { allLearnableMoves, levelUpMoves } from "./moves";
import { Rng } from "./rng";
import { tmCompatible } from "./shop";
import { expForLevel, LEVEL_CAP } from "./training";
import { zeroStats, type TeamMember, type TrainerDef } from "./types";
import { buildMoveset } from "./ai/loadout";
import { roleByStats } from "./ai/evaluator";

export const FRESH_LEVEL = 5;
/** EXP an NPC's Pokémon gain a week: the same as the player's level training at a level-1 facility. */
export const FRESH_WEEK_EXP = 200;

/**
 * 새출발: 올림박사's and 투로박사's Paradox Pokémon start as their modern relatives and become the Paradox form at
 * the level the relative would take its last step (Bagon → Shelgon Lv.30 → Roaring Moon Lv.50). Stone /
 * friendship steps use the fresh-start levels (Lv.20 from a first stage, Lv.36 from a second); 딜리버드 Lv.36 and
 * 코일 (Lv.30, Magneton's level) are set by hand.
 */
export const PARADOX_LINES: Record<string, { line: string[]; levels: number[]; era: "ancient" | "future" }> = {
  "Slither Wing": { line: ["Larvesta"], levels: [59], era: "ancient" },
  "Scream Tail": { line: ["Igglybuff", "Jigglypuff"], levels: [20, 36], era: "ancient" },
  "Brute Bonnet": { line: ["Foongus"], levels: [39], era: "ancient" },
  "Flutter Mane": { line: ["Misdreavus"], levels: [20], era: "ancient" },
  "Sandy Shocks": { line: ["Magnemite"], levels: [30], era: "ancient" },
  "Roaring Moon": { line: ["Bagon", "Shelgon"], levels: [30, 50], era: "ancient" },
  "Iron Moth": { line: ["Larvesta"], levels: [59], era: "future" },
  "Iron Bundle": { line: ["Delibird"], levels: [36], era: "future" },
  "Iron Hands": { line: ["Makuhita"], levels: [24], era: "future" },
  "Iron Jugulis": { line: ["Deino", "Zweilous"], levels: [50, 64], era: "future" },
  "Iron Thorns": { line: ["Larvitar", "Pupitar"], levels: [30, 55], era: "future" },
  "Iron Valiant": { line: ["Ralts", "Kirlia"], levels: [20, 30], era: "future" },
};
const paradoxLine = (target?: string) => (target ? PARADOX_LINES[dex.species.get(target).name] : undefined);
export const isParadoxTarget = (target?: string) => !!paradoxLine(target);

/** The next step of a Paradox line for a Pokémon now `species` (its species and the level it takes), or null. */
export function paradoxStep(species: string, target: string): { species: string; level: number } | null {
  const p = paradoxLine(target);
  if (!p) return null;
  const i = p.line.indexOf(dex.species.get(species).name);
  if (i < 0) return null;
  return { species: p.line[i + 1] ?? dex.species.get(target).name, level: p.levels[i] };
}

/** Becoming a Paradox Pokémon: the moves it can't have go, the nature stays, the ability becomes
 *  Protosynthesis (ancient) / Quark Drive (future), no gender. */
export function becomeParadox(m: { species: string; moves: string[]; ability: string; gender?: "M" | "F" | ""; known?: string[] }, paradox: string) {
  const to = dex.species.get(paradox);
  const can = new Set(allLearnableMoves(to.name));
  m.species = to.name;
  m.moves = m.moves.filter(x => can.has(dex.moves.get(x).id));
  if (!m.moves.length) m.moves = freshMoves(to.name, 100, to.id);
  if (m.known) m.known = m.known.filter(x => can.has(dex.moves.get(x).id));
  m.ability = to.abilities[0];
  m.gender = "";
}

/** The note on 올림박사's / 투로박사's six on a fresh start: still researching (none of the six it brings is a
 *  Paradox Pokémon yet), bringing them (some are, some modern ones left), or nothing once all six are. */
export function paradoxNote(trainerId: string, lineup: { species: string; target?: string }[], entry: { species: string }[]): string | null {
  const era = trainerId === "paldea-올림박사" ? "고대" : trainerId === "paldea-투로박사" ? "미래" : null;
  if (!era) return null;
  const isParadox = (sp: string) => !!PARADOX_LINES[dex.species.get(sp).name];
  if (!entry.some(m => isParadox(m.species))) return `${era}의 포켓몬에 대해 연구 중`;
  if (lineup.some(m => isParadoxTarget(m.target) && !isParadox(m.species))) return `${era}의 포켓몬 데려오는 중`;
  return null;
}

/** The evolution line up to a species, first stage first (Pichu → Pikachu → Raichu-Alola). */
export function evoChain(species: string): string[] {
  const p = paradoxLine(species);
  if (p) return [...p.line, dex.species.get(species).name];
  let s = dex.species.get(species);
  const out = [s.name];
  while (s.prevo) {
    s = dex.species.get(s.prevo);
    out.unshift(s.name);
  }
  return out;
}

/** The first stage of a species' line. */
export const firstStage = (species: string) => evoChain(species)[0];
/** Not evolved from anything (a fresh start's custom picks). */
export const isFirstStage = (species: string) => !dex.species.get(species).prevo;

/** The gender a Pokémon must have to end up as `target` (Froslass ♀, Gallade ♂, Meowstic-F ♀…), or a random one. */
function genderFor(base: string, target: string, rng: Rng): "M" | "F" | "" {
  const b = dex.species.get(base);
  const t = dex.species.get(target);
  if (b.gender === "N") return "";
  if (t.gender === "M" || t.gender === "F") return t.gender;
  if (GENDER_FORM_BASES.has(t.baseSpecies)) return /-F$/.test(t.name) ? "F" : "M";
  if (b.gender === "M" || b.gender === "F") return b.gender;
  return rng.chance(b.genderRatio?.F ?? 0.5) ? "F" : "M";
}

/** Moves a growing Pokémon uses: the best set from what it has learned by level up and the club's TMs it can use. */
export function freshMoves(species: string, level: number, seed: string, tms: string[] = []): string[] {
  const id = dex.species.get(species).id;
  const pool = new Set(levelUpMoves(id, level).map(m => m.id));
  if (tms.length) {
    const ok = tmCompatible(species);
    for (const x of tms) if (ok.has(x)) pool.add(x);
  }
  return buildMoveset(id, roleByStats(id), seed, [...pool]);
}

/** A Lv.5 first-stage Pokémon that grows into `target`: random nature, ability (hidden one included) and IVs. */
export function freshMon(target: string, uid: string, rng: Rng, level = FRESH_LEVEL): TeamMember {
  const chain = evoChain(target);
  const base = dex.species.get(chain[0]);
  const abilities = Object.values(base.abilities).filter(Boolean) as string[];
  const iv = () => rng.int(0, 31);
  const natures = dex.natures.all();
  return {
    uid,
    species: base.name,
    level,
    exp: expForLevel(level),
    target: chain[chain.length - 1],
    ability: rng.pick(abilities),
    item: "",
    nature: rng.pick(natures).name,
    moves: freshMoves(base.name, level, uid),
    evs: zeroStats(),
    ivs: { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() },
    gender: genderFor(base.name, target, rng),
    teraType: null,
  };
}

/** A trainer's six for a fresh start (the same seed always gives the same six). */
export function freshTeam(t: TrainerDef, seed: string): TeamMember[] {
  return resolveTeam(t).map((m, i) => {
    const mon = freshMon(m.species, m.uid, new Rng(`${seed}:${t.id}#${i}`));
    if (m.placeholder) mon.placeholder = true;
    if (m.foodNative) mon.foodNative = true;
    return mon;
  });
}

/** Every trainer's six (the start screen shows them before a seat is picked). */
export function freshTeams(seed: string): Record<string, TeamMember[]> {
  return Object.fromEntries(allTrainers().map(t => [t.id, freshTeam(t, seed)]));
}

/** The next step toward its target and the level it takes (level evolutions at their level; stones, trades and
 *  friendship at Lv.20 from a first stage, Lv.36 from a second). */
export function nextEvolution(mon: TeamMember): { species: string; level: number } | null {
  if (!mon.target) return null;
  if (isParadoxTarget(mon.target)) return paradoxStep(mon.species, mon.target);
  const chain = evoChain(mon.target);
  const i = chain.indexOf(dex.species.get(mon.species).name);
  if (i < 0 || i >= chain.length - 1) return null;
  const nx = dex.species.get(chain[i + 1]);
  return { species: nx.name, level: nx.evoLevel || (i === 0 ? 20 : 36) };
}

/** A week's growth: EXP, level ups, evolutions on the way, then its moves picked again. True when it changed. */
export function growFresh(mon: TeamMember, exp: number, seed: string, tms: string[] = [], lineupDef?: TeamMember): boolean {
  if (!mon.target) return false;
  const before = `${mon.species}:${mon.level}`;
  if (mon.level < LEVEL_CAP) {
    mon.exp = (mon.exp ?? expForLevel(mon.level)) + exp;
    while (mon.level < LEVEL_CAP && mon.exp >= expForLevel(mon.level + 1)) mon.level++;
  }
  for (let step = nextEvolution(mon); step && mon.level >= step.level; step = nextEvolution(mon)) {
    if (isParadoxTarget(step.species)) {
      becomeParadox(mon, step.species);
      continue;
    }
    const from = dex.species.get(mon.species);
    const to = dex.species.get(step.species);
    const idx = Math.max(0, Object.values(from.abilities).indexOf(mon.ability));
    mon.ability = (Object.values(to.abilities)[idx] as string) || to.abilities[0];
    mon.species = to.name;
    // the lineup's own traits come with the last step (레드's Pikachu: own base stats, never evolves)
    if (to.name === mon.target && lineupDef) {
      if (lineupDef.baseStats) mon.baseStats = { ...lineupDef.baseStats };
      if (lineupDef.noEvolve) mon.noEvolve = true;
    }
  }
  if (`${mon.species}:${mon.level}` === before) return false;
  mon.moves = freshMoves(mon.species, mon.level, seed, tms);
  return true;
}

/** The lineup Pokémon a fresh slot grows into (for its own traits). */
export function lineupDefOf(trainerId: string, key: string): TeamMember | undefined {
  const t = trainerById(trainerId);
  return t ? resolveTeam(t)[Number(key)] : undefined;
}
