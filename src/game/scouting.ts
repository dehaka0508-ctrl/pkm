// Scouting: missions to regions, candidate reports, signing.
import { onSign } from "./fans";
import { koSpecies } from "../data/dex";
import { dex, REGIONS, isLegendaryLike, speciesRegion, SCOUT_PARADOX, SCOUT_ULTRA_BEASTS } from "../data/dex";
import type { GameState, ScoutCandidate } from "./state";
import { absWeek, newUid, candidateToOwned, pushMsg } from "./state";
import { Rng } from "./rng";
import type { StatTable } from "./types";

export const SQUAD_MAX = 10;
export const MISSION_WEEKS = 2;
export const MISSION_COST = 3000;
export const CANDIDATE_WEEKS = 4;

export function maxMissions(scoutingLv: number) {
  return 1 + Math.floor(scoutingLv / 4);
}

let poolCache: Record<string, string[]> | null = null;
/** First-stage, non-legendary species per origin region. */
export function basePools(): Record<string, string[]> {
  if (poolCache) return poolCache;
  const out: Record<string, string[]> = {};
  for (const r of REGIONS) out[r.id] = [];
  for (const s of dex.species.all()) {
    if (s.num <= 0 || s.num > 1025 || s.prevo || s.battleOnly) continue;
    if (["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string)) continue;
    if (s.forme && !/^(Alola|Galar|Hisui|Paldea)$/.test(s.forme)) continue;
    if (isLegendaryLike(s.id)) continue;
    out[speciesRegion(s.id)]?.push(s.id);
  }
  poolCache = out;
  return out;
}

function stage(id: string): number {
  let s = dex.species.get(id);
  let n = 0;
  while (s.prevo) {
    n++;
    s = dex.species.get(s.prevo);
  }
  return n;
}

export function candidateFee(species: string, level: number, stars: number): number {
  const s = dex.species.get(species);
  const fee = (s.bst * s.bst) / 220 + level * 120 + stars * 600;
  return Math.round(fee / 100) * 100;
}

/** Scouting level from which Alola's scouts find Ultra Beasts and Paldea's find Paradox Pokémon. */
export const RARE_SCOUT_LEVEL = 5;
/** Each Ultra Beast / Paradox species is half as likely to turn up as any one ordinary species. */
export const RARE_SCOUT_WEIGHT = 0.5;

/** Ultra Beasts (Alola) or Paradox Pokémon (Paldea) a well-equipped scout may find, of the type asked for. */
export function rarePool(region: string, facility: number, type?: string | null): string[] {
  if (facility < RARE_SCOUT_LEVEL) return [];
  const list = region === "alola" ? SCOUT_ULTRA_BEASTS : region === "paldea" ? SCOUT_PARADOX : [];
  return list.map(n => dex.species.get(n).id).filter(id => !type || dex.species.get(id).types.includes(type));
}

/** Rolls one candidate. */
export function rollCandidate(rng: Rng, region: string, opts: { level?: number; type?: string | null; facility: number; expires: number; allowEvolved?: boolean; species?: string }): ScoutCandidate {
  const pool = basePools()[region] || basePools().kanto;
  let cands = pool;
  if (opts.type) {
    const typed = pool.filter(id => dex.species.get(id).types.includes(opts.type!));
    if (typed.length) cands = typed;
  }
  const rare = opts.species ? [] : rarePool(region, opts.facility, opts.type);
  let species = opts.species ?? rng.pick(cands);
  if (!opts.species && rare.length) {
    // one draw over both lists: ordinary species weigh 1, rare ones 0.5
    const r = rng.next() * (cands.length + rare.length * RARE_SCOUT_WEIGHT);
    species = r < cands.length ? cands[Math.floor(r)] : rare[Math.min(rare.length - 1, Math.floor((r - cands.length) / RARE_SCOUT_WEIGHT))];
  }
  let level = opts.level ?? Math.min(45, 5 + rng.int(0, 6 + opts.facility * 3));
  // occasionally the scout finds an already-evolved Pokémon at higher levels
  if (opts.allowEvolved && level >= 20) {
    let s = dex.species.get(species);
    while (s.evos.length) {
      const nx = dex.species.get(rng.pick(s.evos));
      if (nx.evoLevel && nx.evoLevel > level) break;
      if (!nx.evoLevel && level < 30) break;
      s = nx;
    }
    species = s.name;
  }
  const quality = 0.35 + 0.05 * opts.facility; // shifts IV distribution up
  const iv = () => Math.min(31, Math.floor(rng.next() * 32 * (1 - quality) + quality * 31 * rng.next() + rng.next() * 8));
  const ivs: StatTable = { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() };
  const avg = Object.values(ivs).reduce((a, b) => a + b, 0) / 6;
  const err = (rng.next() - 0.5) * (2.4 - opts.facility * 0.2);
  const stars = Math.max(1, Math.min(5, Math.round(((avg / 31) * 5 + err) * 2) / 2));
  const s = dex.species.get(species);
  const abilities = Object.values(s.abilities) as string[];
  const ability = rng.chance(0.08) && s.abilities.H ? s.abilities.H : abilities[rng.int(0, Math.min(1, abilities.length - 1))];
  const natures = dex.natures.all();
  const gender: "M" | "F" | "" = s.gender === "N" ? "" : s.gender === "M" ? "M" : s.gender === "F" ? "F" : rng.chance(s.genderRatio?.F ?? 0.5) ? "F" : "M";
  return {
    id: newUid("c"),
    species: s.name,
    level,
    ivs,
    nature: rng.pick(natures).name,
    ability,
    gender,
    shiny: rng.chance(1 / 4096),
    stars,
    fee: candidateFee(s.name, level, stars),
    region,
    expires: opts.expires,
  };
}

/** Starter Pokémon of each region. */
export const STARTERS: Record<string, string[]> = {
  kanto: ["Bulbasaur", "Charmander", "Squirtle"],
  johto: ["Chikorita", "Cyndaquil", "Totodile"],
  hoenn: ["Treecko", "Torchic", "Mudkip"],
  sinnoh: ["Turtwig", "Chimchar", "Piplup"],
  unova: ["Snivy", "Tepig", "Oshawott"],
  kalos: ["Chespin", "Fennekin", "Froakie"],
  alola: ["Rowlet", "Litten", "Popplio"],
  galar: ["Grookey", "Scorbunny", "Sobble"],
  paldea: ["Sprigatito", "Fuecoco", "Quaxly"],
};

/** Early-route mammals, bugs and birds (first stage; regional forms in their own region). */
export const EARLY_MONS: Record<string, string[]> = {
  kanto: ["Rattata", "Caterpie", "Weedle", "Pidgey", "Spearow"],
  johto: ["Sentret", "Ledyba", "Spinarak", "Hoothoot"],
  hoenn: ["Zigzagoon", "Wurmple", "Surskit", "Taillow", "Wingull"],
  sinnoh: ["Bidoof", "Kricketot", "Starly"],
  unova: ["Patrat", "Lillipup", "Sewaddle", "Venipede", "Pidove"],
  kalos: ["Bunnelby", "Scatterbug", "Fletchling"],
  alola: ["Yungoos", "Rattata-Alola", "Grubbin", "Pikipek"],
  galar: ["Skwovet", "Wooloo", "Zigzagoon-Galar", "Blipbug", "Rookidee"],
  paldea: ["Lechonk", "Tarountula", "Nymble", "Squawkabilly", "Wattrel"],
};

/** The three scout reports of a scout start: starters, early-route Pokémon, 3 random ones. */
export function scoutStartOptions(region: string, seed: string): ScoutCandidate[][] {
  const rng = new Rng(seed);
  const roll = (species: string) => {
    const c = rollCandidate(rng, region, { level: 5, facility: 3, expires: 0, species });
    c.fee = 0;
    return c;
  };
  const starters = (STARTERS[region] || STARTERS.kanto).map(roll);
  const early = (EARLY_MONS[region] || EARLY_MONS.kanto).map(roll);
  const used = new Set([...starters, ...early].map(c => c.species));
  const random = starterCandidates(region, `${seed}:r`, 12).filter(c => !used.has(c.species)).slice(0, 3);
  return [starters, early, random];
}

/** Initial pool for the scout start: 9 Lv5 first-stage Pokémon from a region. */
export function starterCandidates(region: string, seed: string, count = 9): ScoutCandidate[] {
  const rng = new Rng(seed);
  const out: ScoutCandidate[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const c = rollCandidate(rng, region, { level: 5, facility: 3, expires: 0 });
    if (stage(c.species) !== 0 || seen.has(c.species)) continue;
    seen.add(c.species);
    c.fee = 0;
    out.push(c);
  }
  return out;
}

export function startMission(state: GameState, region: string, type: string | null): string | null {
  const p = state.player;
  if (p.missions.length >= maxMissions(p.facilities.scouting)) return "보낼 수 있는 스카우트가 없습니다.";
  if (p.money < MISSION_COST) return "자금이 부족합니다.";
  p.money -= MISSION_COST;
  p.missions.push({ id: newUid("s"), region, type, weeksLeft: MISSION_WEEKS });
  return null;
}

/** Weekly scouting progress. */
export function scoutWeek(state: GameState, rng: Rng) {
  const p = state.player;
  const now = absWeek(state);
  for (const m of p.missions) m.weeksLeft--;
  const done = p.missions.filter(m => m.weeksLeft <= 0);
  p.missions = p.missions.filter(m => m.weeksLeft > 0);
  for (const m of done) {
    const n = 3 + Math.floor(p.facilities.scouting / 3) + (rng.chance(0.4) ? 1 : 0);
    const found: ScoutCandidate[] = [];
    for (let i = 0; i < n; i++) found.push(rollCandidate(rng, m.region, { type: m.type, facility: p.facilities.scouting, expires: now + CANDIDATE_WEEKS, allowEvolved: true }));
    p.candidates.push(...found);
    const regionName = REGIONS.find(r => r.id === m.region)?.name;
    pushMsg(state, "scout", `${regionName} 스카우트 보고서 도착`, `${found.length}마리의 후보를 찾았습니다. 스카우트 화면에서 확인하세요.`);
  }
  p.candidates = p.candidates.filter(c => c.expires > now);
}

export function signCandidate(state: GameState, id: string): string | null {
  const p = state.player;
  const c = p.candidates.find(x => x.id === id);
  if (!c) return "후보를 찾을 수 없습니다.";
  if (p.squad.length >= SQUAD_MAX) return `스쿼드는 최대 ${SQUAD_MAX}마리입니다. 먼저 방출하세요.`;
  if (p.money < c.fee) return "자금이 부족합니다.";
  p.money -= c.fee;
  const mon = candidateToOwned(c, state.season);
  p.squad.push(mon);
  onSign(state, mon, koSpecies);
  p.plan[mon.uid] = mon.level < 50 ? "level" : "spe";
  if (p.entry.length < 6) p.entry.push(mon.uid);
  p.candidates = p.candidates.filter(x => x.id !== id);
  return null;
}
