// Scouting: missions to regions, candidate reports, signing.
import { isBanned } from "../data/forms";
import { onSign } from "./fans";
import { koSpecies } from "../data/dex";
import { dex, HISUI_DEX, REGIONS, isLegendaryLike, speciesRegion, toID, SCOUT_PARADOX, SCOUT_ULTRA_BEASTS } from "../data/dex";
import { HISUI_STARTER_LINES } from "./moves";
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
    if (isLegendaryLike(s.id) || isBanned(s.id)) continue;
    out[speciesRegion(s.id)]?.push(s.id);
  }
  // 레전드: 6th-gen Pokémon and the Hisui Pokédex (Hisui forms where the species has one)
  const legend = new Set(out.kalos);
  for (const s of dex.species.all()) {
    if (!HISUI_DEX.has(s.num) || s.prevo || s.battleOnly || isLegendaryLike(s.id)) continue;
    if (["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string)) continue;
    if (s.forme && !/^Hisui$/.test(s.forme) && s.name !== "Basculin-White-Striped") continue;
    legend.add(s.id);
  }
  // a species with a Hisui form appears only as that form
  for (const id of [...legend]) {
    const sp = dex.species.get(id);
    if (!sp.forme && (legend.has(toID(sp.name + "hisui")) || (sp.name === "Basculin" && legend.has("basculinwhitestriped")))) legend.delete(id);
  }
  out.legend = [...legend];
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

/** Ultra Beasts (Alola) or Paradox Pokémon (Paldea) a well-equipped scout may find (of one type, if given). */
export function rarePool(region: string, facility: number, type?: string | null): string[] {
  if (facility < RARE_SCOUT_LEVEL) return [];
  const list = region === "alola" ? SCOUT_ULTRA_BEASTS : region === "paldea" ? SCOUT_PARADOX : [];
  return list.map(n => dex.species.get(n).id).filter(id => !type || dex.species.get(id).types.includes(type));
}

/** A scout sent "for" a type still searches the whole pool; Pokémon of that type are twice as likely. */
export const TYPE_FOCUS_WEIGHT = 2;

/** Rolls one candidate. */
export function rollCandidate(rng: Rng, region: string, opts: { level?: number; type?: string | null; facility: number; expires: number; allowEvolved?: boolean; species?: string }): ScoutCandidate {
  let species = opts.species ?? "";
  if (!opts.species) {
    // one weighted draw over the region's pool: ordinary species weigh 1, rare ones (Ultra Beasts / Paradox)
    // 0.5, and the focus type doubles a species' weight
    const typed = (id: string) => !!opts.type && dex.species.get(id).types.includes(opts.type);
    const pool = (basePools()[region] || basePools().kanto).map(id => ({ id, w: typed(id) ? TYPE_FOCUS_WEIGHT : 1 }));
    for (const id of rarePool(region, opts.facility)) pool.push({ id, w: RARE_SCOUT_WEIGHT * (typed(id) ? TYPE_FOCUS_WEIGHT : 1) });
    let r = rng.next() * pool.reduce((a, x) => a + x.w, 0);
    species = pool[pool.length - 1].id;
    for (const x of pool) {
      r -= x.w;
      if (r < 0) {
        species = x.id;
        break;
      }
    }
  }
  let level = opts.level ?? Math.min(45, 5 + rng.int(0, 6 + opts.facility * 3));
  // occasionally the scout finds an already-evolved Pokémon at higher levels
  if (opts.allowEvolved && level >= 20) {
    let s = dex.species.get(species);
    while (s.evos.length) {
      // Hisui forms only for the 레전드 starter lines; other evolutions keep their usual form
      const hisuian = region === "legend" && HISUI_STARTER_LINES.has(s.id) && s.evos.some(e => /-Hisui$/.test(e));
      const evos = s.evos.filter(e => /-Hisui$/.test(e) === hisuian);
      if (!evos.length) break;
      const nx = dex.species.get(rng.pick(evos));
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
  // Rowlet / Cyndaquil / Oshawott (they grow into their Hisui forms) + the Legends Z-A three
  legend: ["Rowlet", "Cyndaquil", "Oshawott", "Chikorita", "Tepig", "Totodile"],
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
  legend: ["Bidoof", "Kricketot", "Starly", "Bunnelby", "Scatterbug", "Fletchling"],
};

/** The rookie start's six questions, in order: partner (a starter), first catch (an early-route mammal / bird /
 *  bug), two Pokémon met on the journey (this region), two to meet travelling (any region). */
export const ROOKIE_STAGES = ["starter", "early", "region", "region", "world", "world"] as const;
export type RookieStage = (typeof ROOKIE_STAGES)[number];
export const ROOKIE_QUESTION: Record<RookieStage, string> = {
  starter: "당신의 파트너는?",
  early: "당신이 처음으로 잡은 포켓몬은?",
  region: "당신이 모험에서 만난 기억에 남는 포켓몬은?",
  world: "당신이 다른 지역으로 여행한다면 만나고 싶은 포켓몬은?",
};

/** Random-pick pool: first-stage non-legendary species weigh 1, first-stage Ultra Beasts / Paradox Pokémon 0.5
 *  (Alola's and Paldea's for a region; all of them for the world). */
export function rookiePool(region: string | null): { id: string; w: number }[] {
  const ids = region ? basePools()[region] || [] : [...new Set(Object.values(basePools()).flat())];
  const rare = (region ? rarePool(region, RARE_SCOUT_LEVEL) : [...rarePool("alola", RARE_SCOUT_LEVEL), ...rarePool("paldea", RARE_SCOUT_LEVEL)]).filter(id => !dex.species.get(id).prevo);
  return [...ids.map(id => ({ id, w: 1 })), ...rare.filter(id => !ids.includes(id)).map(id => ({ id, w: RARE_SCOUT_WEIGHT }))];
}

/** Three Lv.5 candidates for one question of the rookie start (none of the species in `exclude`). */
export function rookieOptions(region: string, stage: RookieStage, seed: string, exclude: Set<string> = new Set()): ScoutCandidate[] {
  const rng = new Rng(`${seed}:${stage}`);
  const roll = (species: string, origin: string) => {
    const c = rollCandidate(rng, origin, { level: 5, facility: 3, expires: 0, species });
    c.fee = 0;
    return c;
  };
  const free = (sp: string) => !exclude.has(dex.species.get(sp).id);
  if (stage === "starter" || stage === "early") {
    const list = ((stage === "starter" ? STARTERS : EARLY_MONS)[region] || (stage === "starter" ? STARTERS : EARLY_MONS).kanto).filter(free);
    return rng.shuffle(list.slice()).slice(0, 3).map(sp => roll(sp, region));
  }
  const pool = rookiePool(stage === "region" ? region : null).filter(x => free(x.id));
  const out: ScoutCandidate[] = [];
  while (out.length < 3 && pool.length) {
    let r = rng.next() * pool.reduce((a, x) => a + x.w, 0);
    let i = pool.length - 1;
    for (let j = 0; j < pool.length; j++) if ((r -= pool[j].w) < 0) { i = j; break; }
    const [x] = pool.splice(i, 1);
    out.push(roll(x.id, stage === "region" ? region : speciesRegion(x.id)));
  }
  return out;
}

/** All six questions' candidates at once (no species twice). */
export function scoutStartOptions(region: string, seed: string): ScoutCandidate[][] {
  const used = new Set<string>();
  return ROOKIE_STAGES.map((stage, i) => {
    const o = rookieOptions(region, stage, `${seed}:${i}`, used);
    for (const c of o) used.add(dex.species.get(c.species).id);
    return o;
  });
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
