// Learnsets and automatic move selection.
import { dex, koItem, toID } from "../data/dex";
import { Rng } from "./rng";

type Learnset = Record<string, string[]>;
const lsCache = new Map<string, Learnset>();

function rawLearnset(id: string): Learnset {
  const data = dex.species.getLearnsetData(id as any) as any;
  return (data && data.learnset) || {};
}

/** Learnset for a species, falling back to its out-of-battle forme (megas etc.). */
export function learnset(speciesId: string, withPrevos = false): Learnset {
  const key = speciesId + (withPrevos ? "+p" : "");
  const hit = lsCache.get(key);
  if (hit) return hit;
  let s = dex.species.get(speciesId);
  if (s.battleOnly) s = dex.species.get(Array.isArray(s.battleOnly) ? s.battleOnly[0] : s.battleOnly);
  let ls = rawLearnset(s.id);
  if (!Object.keys(ls).length && s.changesFrom) ls = rawLearnset(toID(s.changesFrom));
  if (!Object.keys(ls).length && s.baseSpecies !== s.name) ls = rawLearnset(toID(s.baseSpecies));
  const out: Learnset = { ...ls };
  if (withPrevos) {
    let p = s.prevo ? dex.species.get(s.prevo) : null;
    while (p && p.exists) {
      for (const [m, src] of Object.entries(rawLearnset(p.id))) out[m] = [...(out[m] || []), ...src];
      p = p.prevo ? dex.species.get(p.prevo) : null;
    }
  }
  lsCache.set(key, out);
  return out;
}

const usable = (id: string) => {
  const m = dex.moves.get(id);
  return m.exists && !m.isZ && !m.isMax && !["CAP", "LGPE", "Custom", "Gigantamax"].includes(m.isNonstandard as string);
};

/** Minimum level at which a move is learned by level-up, or null. */
function levelOf(sources: string[]): number | null {
  let best: number | null = null;
  for (const s of sources) {
    const m = s.match(/^\dL(\d+)/);
    if (m) {
      const lv = Number(m[1]);
      if (best === null || lv < best) best = lv;
    }
  }
  return best;
}

/** Level-up moves available at or below `level`, sorted by level. */
export function levelUpMoves(speciesId: string, level: number): { id: string; level: number }[] {
  const out: { id: string; level: number }[] = [];
  for (const [id, src] of Object.entries(learnset(speciesId))) {
    if (!usable(id)) continue;
    const lv = levelOf(src);
    if (lv !== null && lv <= level) out.push({ id, level: lv });
  }
  return out.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

/** Moves newly learnable when reaching exactly `level`. */
export function movesLearnedAt(speciesId: string, level: number): string[] {
  return levelUpMoves(speciesId, level).filter(m => m.level === level).map(m => m.id);
}

/** Moves a player-owned Pokémon may set: level-up (<= level) + TM + tutor. */
export function learnableMoves(speciesId: string, level: number): string[] {
  const set = new Set<string>();
  for (const m of levelUpMoves(speciesId, level)) set.add(m.id);
  for (const [id, src] of Object.entries(learnset(speciesId, true))) {
    if (!usable(id)) continue;
    if (src.some(s => /^\d[MT]/.test(s))) set.add(id);
    const lv = levelOf(src);
    if (lv !== null && lv <= level) set.add(id);
  }
  return [...set].sort((a, b) => dex.moves.get(a).name.localeCompare(dex.moves.get(b).name));
}

/** Every move the species can learn by any method (level-up, TM, tutor, egg, event, pre-evolutions). */
export function allLearnableMoves(speciesId: string): string[] {
  return Object.keys(learnset(dex.species.get(speciesId).id, true))
    .filter(usable)
    .sort((a, b) => dex.moves.get(a).name.localeCompare(dex.moves.get(b).name));
}

/** Default moves like the main games: last 4 level-up moves learned. */
export function defaultMoves(speciesId: string, level: number): string[] {
  const list = levelUpMoves(speciesId, level);
  const ids: string[] = [];
  for (let i = list.length - 1; i >= 0 && ids.length < 4; i--) if (!ids.includes(list[i].id)) ids.push(list[i].id);
  if (!ids.length) ids.push("tackle");
  return ids.reverse();
}

const BANNED = new Set([
  "explosion", "selfdestruct", "mistyexplosion", "finalgambit", "memento", "healingwish", "lunardance", "hyperbeam",
  "gigaimpact", "blastburn", "frenzyplant", "hydrocannon", "rockwrecker", "roaroftime", "prismaticlaser", "eternabeam",
  "focuspunch", "dreameater", "lastresort", "belch", "fling", "naturalgift", "synchronoise", "snore", "skyattack",
  "solarbeam", "solarblade", "razorwind", "skullbash", "freezeshock", "iceburn", "steelbeam", "mindblown", "struggle",
  "beatup", "present", "rollout", "iceball", "furycutter", "echoedvoice", "round", "uproar", "trumpcard", "spitup",
  "stockpile", "swallow", "naturepower", "metronome", "assist", "copycat", "mefirst", "mirrormove", "sleeptalk",
  "counter", "mirrorcoat", "metalburst", "bide", "endeavor", "electroball", "gyroball", "grassknot", "lowkick",
  "heavyslam", "heatcrash", "punishment", "storedpower", "powertrip", "frustration", "return", "spitup",
  "selfdestruct", "doomdesire", "futuresight", "magnitude", "present", "constrict", "barrage", "doubleslap",
  "cometpunch", "spikecannon", "fissure", "sheercold", "horndrill", "guillotine", "chatter", "relicsong",
  "hiddenpower", "terablast", "steelroller", "meteorbeam", "electroshot", "skydrop", "shadowforce", "phantomforce", "dig", "dive",
  "fly", "bounce", "geomancy", "outrage", "thrash", "petaldance", "ragingfury",
]);

const SETUP: Record<string, "atk" | "spa" | "both"> = {
  swordsdance: "atk", dragondance: "atk", bulkup: "atk", shiftgear: "atk", coil: "atk", victorydance: "atk",
  tidyup: "atk", howl: "atk", honeclaws: "atk", nastyplot: "spa", calmmind: "spa", quiverdance: "spa",
  tailglow: "spa", torchsong: "spa", shellsmash: "both", growth: "both", workup: "both",
};
const RECOVERY = new Set(["recover", "roost", "slackoff", "softboiled", "milkdrink", "moonlight", "morningsun", "synthesis", "shoreup", "strengthsap", "healorder", "wish", "junglehealing", "lifedew"]);
const STATUS_GOOD: Record<string, number> = {
  spore: 90, sleeppowder: 72, willowisp: 70, thunderwave: 66, toxic: 66, glare: 66, yawn: 55, stunspore: 55,
  hypnosis: 40, stealthrock: 55, spikes: 40, toxicspikes: 40, leechseed: 55, substitute: 45, protect: 30,
  encore: 45, taunt: 40, trickroom: 30, reflect: 35, lightscreen: 35, auroraveil: 40, haze: 30, rest: 25,
};

/**
 * Picks a sensible moveset for an NPC/placeholder Pokémon.
 * `fixed` are moves already decided (kept); empty slots get filled.
 */
export function autoMoveset(speciesId: string, seed: string, fixed: (string | null)[] = []): string[] {
  const rng = new Rng(seed);
  const s = dex.species.get(speciesId);
  const base = s.baseStats;
  const physBias = base.atk / Math.max(base.atk, base.spa);
  const specBias = base.spa / Math.max(base.atk, base.spa);
  const chosen: string[] = fixed.filter((m): m is string => !!m).map(m => toID(m));
  if (chosen.length >= 4) return chosen.slice(0, 4);

  const attacks: { id: string; type: string; score: number }[] = [];
  const statuses: { id: string; score: number }[] = [];
  for (const [id, src] of Object.entries(learnset(s.id, true))) {
    if (!usable(id) || BANNED.has(id) || chosen.includes(id)) continue;
    if (!src.length) continue;
    const m = dex.moves.get(id);
    if (m.category === "Status") {
      let sc = 0;
      const setup = SETUP[id];
      if (setup === "atk") sc = 60 + 40 * physBias - (physBias < 0.9 ? 60 : 0);
      else if (setup === "spa") sc = 60 + 40 * specBias - (specBias < 0.9 ? 60 : 0);
      else if (setup === "both") sc = 70;
      else if (RECOVERY.has(id)) sc = 75;
      else sc = STATUS_GOOD[id] ?? 0;
      if (sc > 0) statuses.push({ id, score: sc + rng.next() * 10 });
      continue;
    }
    let bp = m.basePower;
    if (m.multihit) bp *= Array.isArray(m.multihit) ? 3.1 : m.multihit;
    if (bp <= 1) continue;
    const acc = m.accuracy === true ? 100 : m.accuracy;
    const stab = s.types.includes(m.type) ? 1.5 : 1;
    const bias = m.category === "Physical" ? physBias : specBias;
    let score = Math.min(bp, 150) * (acc / 100) * stab * bias * bias;
    if (m.recoil || m.mindBlownRecoil) score *= 0.92;
    if (m.self && (m.self as any).boosts) score *= 0.95;
    if (m.flags.charge || m.flags.recharge) score *= 0.5;
    if (m.priority > 0) score *= 1.05;
    attacks.push({ id, type: m.type, score: score * (0.95 + rng.next() * 0.1) });
  }
  attacks.sort((a, b) => b.score - a.score);
  statuses.sort((a, b) => b.score - a.score);

  const types = new Set(chosen.map(id => dex.moves.get(id).type));
  const pickAttack = (needNewType: boolean) => {
    const a = attacks.find(x => !chosen.includes(x.id) && (!needNewType || !types.has(x.type)));
    if (a) {
      chosen.push(a.id);
      types.add(a.type);
      return true;
    }
    return false;
  };
  // 1) best STAB/attack, 2) coverage of a new type, 3) maybe status, then fill.
  if (chosen.filter(id => dex.moves.get(id).category !== "Status").length === 0) pickAttack(false);
  while (chosen.length < 3) if (!pickAttack(true) && !pickAttack(false)) break;
  if (chosen.length < 4) {
    const st = statuses[0];
    if (st && st.score >= 60 && rng.chance(0.65)) chosen.push(st.id);
  }
  while (chosen.length < 4) {
    if (!pickAttack(true) && !pickAttack(false)) {
      const st = statuses.find(x => !chosen.includes(x.id));
      if (st) chosen.push(st.id);
      else break;
    }
  }
  if (!chosen.length) chosen.push("tackle");
  return chosen.slice(0, 4);
}

/** Evolution options available for an owned Pokémon at a level. */
export function evolutionOptions(speciesId: string, level: number): { id: string; how: string; ready: boolean; item?: string }[] {
  const s = dex.species.get(speciesId);
  const out: { id: string; how: string; ready: boolean; item?: string }[] = [];
  for (const e of s.evos || []) {
    const t = dex.species.get(e);
    if (!t.exists || ["LGPE", "CAP", "Custom"].includes(t.isNonstandard as string)) continue;
    let how = "";
    let ready = false;
    if (t.evoType === undefined && t.evoLevel) {
      how = `Lv.${t.evoLevel}`;
      ready = level >= t.evoLevel;
    } else if (t.evoType === "useItem" && t.evoItem) {
      out.push({ id: t.id, how: `${koItem(t.evoItem)} 사용`, ready: true, item: t.evoItem });
      continue;
    } else if (t.evoType === "trade" && t.evoItem) {
      out.push({ id: t.id, how: `${koItem(t.evoItem)}을(를) 지니고 통신교환 (Lv.30부터)`, ready: level >= 30, item: t.evoItem });
      continue;
    } else if (t.evoType === "trade") {
      how = "통신교환 (Lv.30부터 가능)";
      ready = level >= 30;
    } else if (t.evoType === "levelFriendship") {
      how = "친밀도 (Lv.20부터 가능)";
      ready = level >= 20;
    } else {
      const lv = t.evoLevel || 30;
      how = `특수 조건 (Lv.${lv}부터 가능)`;
      ready = level >= lv;
    }
    out.push({ id: t.id, how, ready });
  }
  return out;
}
