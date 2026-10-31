// Trainer lineup data: loading, user overrides, and filling blanks with placeholders.
import baseData from "../data/trainers.json";
import pools from "../data/gen/placeholder-pools.json";
import { dex, toID, isLegendaryLike } from "../data/dex";
import { autoMoveset } from "./moves";
import { Rng, hashStr } from "./rng";
import type { TrainerData, TrainerDef, TeamMember, Gimmick } from "./types";
import { maxIvs, zeroStats } from "./types";

const OVERRIDE_KEY = "pl:lineupOverride";
let cached: TrainerData | null = null;

export function trainerData(): TrainerData {
  if (cached) return cached;
  let data = baseData as unknown as TrainerData;
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch {}
  cached = data;
  return data;
}

export function setLineupOverride(data: TrainerData | null) {
  try {
    if (data) localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data));
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {}
  cached = null;
  teamCache.clear();
}

export function hasLineupOverride(): boolean {
  try {
    return !!localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return false;
  }
}

export function baseTrainerData(): TrainerData {
  return baseData as unknown as TrainerData;
}

export function allTrainers(): (TrainerDef & { region: string })[] {
  return trainerData().regions.flatMap(r => r.trainers.map(t => ({ ...t, region: r.id })));
}

export function trainerById(id: string): (TrainerDef & { region: string }) | undefined {
  for (const r of trainerData().regions) {
    const t = r.trainers.find(x => x.id === id);
    if (t) return { ...t, region: r.id };
  }
}

// ---- placeholder pools ----
const POOLS = pools as Record<string, { pool: string[]; type?: string }>;

/** Type specialties for trainers that PokeRogue has no data for. */
const EXTRA_TYPE: Record<string, string> = {
  youngster_m: "Normal", hiker: "Rock", psychic_m: "Psychic", swimmer_f: "Water", hex_maniac: "Ghost",
  ranger_m: "Grass", school_kid_m: "Normal", baker: "Grass", firebreather: "Fire", artist: "Fairy",
  officer: "Dark", worker_f: "Ground", rocket_grunt_f: "Poison", plasma_grunt_m: "Dragon", skull_grunt_m: "Dark",
  macro_grunt_m: "Steel", dancer: "Normal", lorelei: "Ice", bruno: "Fighting", agatha: "Ghost", will: "Psychic",
  karen: "Dark", koga: "Poison", sidney: "Dark", phoebe: "Ghost", glacia: "Ice", drake: "Dragon", aaron: "Bug",
  bertha: "Ground", flint: "Fire", lucian: "Psychic", shauntal: "Ghost", grimsley: "Dark", caitlin: "Psychic",
  marshal: "Fighting", wikstrom: "Steel", malva: "Fire", siebold: "Water", drasna: "Dragon", hala: "Fighting",
  olivia: "Rock", acerola: "Ghost", kahili: "Flying", molayne: "Steel", rika: "Ground", poppy: "Steel",
  larry: "Flying", hassel: "Dragon", archer: "Dark", maxie: "Fire", archie: "Water", cyrus: "Dark",
  ghetsis: "Dark", lysandre: "Fire", lusamine: "Fairy", guzma: "Bug", rose: "Steel", penny: "Fairy",
  mustard: "Fighting", lance: "Dragon", iris: "Dragon", steven: "Steel", wallace: "Water", diantha: "Fairy",
  cynthia: "Dragon", alder: "Bug", geeta: "Rock", leon: "Fire", kukui: "Rock", nemona: "Fighting",
};

let fullyEvolved: { id: string; types: string[]; bst: number }[] | null = null;
function fullyEvolvedPool() {
  if (fullyEvolved) return fullyEvolved;
  fullyEvolved = dex.species
    .all()
    .filter(s => s.num > 0 && s.num <= 1025 && !s.evos.length && !s.battleOnly && !s.isNonstandard?.match(/CAP|LGPE|Custom/))
    .filter(s => !s.forme || /^(Alola|Galar|Hisui|Paldea)/.test(s.forme))
    .filter(s => !isLegendaryLike(s.id))
    .map(s => ({ id: s.id, types: s.types, bst: s.bst }));
  return fullyEvolved;
}

function placeholderSpecies(t: TrainerDef, slot: number, used: Set<string>): string {
  const rng = new Rng(`${t.id}#ph${slot}`);
  const key = t.sprite.toLowerCase();
  const pool = (POOLS[key]?.pool || []).filter(id => !used.has(id));
  if (pool.length) return rng.pick(pool);
  const type = POOLS[key]?.type || EXTRA_TYPE[key];
  let cands = fullyEvolvedPool().filter(s => !used.has(s.id));
  if (type) {
    const typed = cands.filter(s => s.types.includes(type) && s.bst >= 440).sort((a, b) => b.bst - a.bst).slice(0, 30);
    if (typed.length) return rng.pick(typed).id;
  }
  cands = cands.filter(s => s.bst >= 470 && s.bst <= 560);
  return rng.pick(cands).id;
}

const teamCache = new Map<string, TeamMember[]>();

/** Normalizes a battle-only forme (e.g. Mega) into base species + required item. */
export function normalizeForme(species: string, item: string | null): { species: string; item: string | null } {
  const s = dex.species.get(species);
  if (s.battleOnly && !s.requiredAbility) {
    const base = Array.isArray(s.battleOnly) ? s.battleOnly[0] : s.battleOnly;
    return { species: dex.species.get(base).name, item: item || s.requiredItem || null };
  }
  return { species: s.name, item };
}

/** The six Pokémon a trainer brings, with placeholders for empty data. Level is fixed at 50. */
export function resolveTeam(t: TrainerDef, level = 50): TeamMember[] {
  const ck = t.id + "@" + level + "@" + hashStr(JSON.stringify(t.team));
  const hit = teamCache.get(ck);
  if (hit) return hit;
  const used = new Set<string>();
  for (const m of t.team) if (m?.species) used.add(toID(m.species));
  const out: TeamMember[] = t.team.map((m, slot) => {
    const placeholder = !m || !m.species || !dex.species.get(m.species).exists;
    let species = placeholder ? placeholderSpecies(t, slot, used) : m!.species;
    used.add(toID(species));
    const norm = normalizeForme(species, m?.item ?? null);
    species = norm.species;
    const sp = dex.species.get(species);
    const fixedMoves = (m?.moves || []).filter(x => x && dex.moves.get(x).exists) as string[];
    const auto = fixedMoves.length < 4;
    const moves = auto ? autoMoveset(sp.id, `${t.id}#${slot}`, fixedMoves) : fixedMoves;
    const rng = new Rng(`${t.id}#g${slot}`);
    const gender: "M" | "F" | "" =
      sp.gender === "N" ? "" : sp.gender === "M" ? "M" : sp.gender === "F" ? "F" : m?.gender === "M" || m?.gender === "F" ? m.gender : rng.chance(sp.genderRatio?.F ?? 0.5) ? "F" : "M";
    return {
      uid: `${t.id}#${slot}`,
      species: sp.name,
      level,
      ability: m?.ability && dex.abilities.get(m.ability).exists ? m.ability : sp.abilities[0],
      item: norm.item || "",
      nature: m?.nature || "Serious",
      moves,
      evs: zeroStats(),
      ivs: maxIvs(),
      gender,
      teraType: m?.teraType || null,
      placeholder,
      autoMoves: auto,
    };
  });
  teamCache.set(ck, out);
  return out;
}

export function trainerGimmick(t: TrainerDef): Gimmick {
  return t.gimmick ?? null;
}

/** Rough team strength (used for preseason predictions / AI difficulty). */
export function teamRating(team: { species: string; level: number }[]): number {
  const bsts = team.map(m => dex.species.get(m.species).bst * (0.5 + m.level / 100)).sort((a, b) => b - a);
  const top = bsts.slice(0, 4);
  return Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length));
}

/** AI skill by role (0..1). */
export function roleSkill(role: string): number {
  return ({ 챔피언: 0.95, 사천왕: 0.85, 보스: 0.8, 관장: 0.7, 라이벌: 0.75, 주인공: 0.75, 박사: 0.6, 기타: 0.6, 트레이너: 0.45 } as Record<string, number>)[role] ?? 0.6;
}
