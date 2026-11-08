// Learnsets and automatic move selection.
import { dex, koItem, toID } from "../data/dex";

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
  // non-regional formes (Rotom-Wash, Kyurem-Black…) keep only their own extra move in the data: add the base's
  if (s.baseSpecies !== s.name && !/^(Alola|Galar|Hisui|Paldea)/.test(s.forme)) {
    for (const [m, src] of Object.entries(rawLearnset(toID(s.changesFrom || s.baseSpecies)))) out[m] = [...(out[m] || []), ...src];
  }
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

export const BANNED = new Set([
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

export const SETUP: Record<string, "atk" | "spa" | "both"> = {
  swordsdance: "atk", dragondance: "atk", bulkup: "atk", shiftgear: "atk", coil: "atk", victorydance: "atk",
  tidyup: "atk", howl: "atk", honeclaws: "atk", nastyplot: "spa", calmmind: "spa", quiverdance: "spa",
  tailglow: "spa", torchsong: "spa", shellsmash: "both", growth: "both", workup: "both",
};
export const RECOVERY = new Set(["recover", "roost", "slackoff", "softboiled", "milkdrink", "moonlight", "morningsun", "synthesis", "shoreup", "strengthsap", "healorder", "wish", "junglehealing", "lifedew"]);
export const STATUS_GOOD: Record<string, number> = {
  spore: 90, sleeppowder: 72, willowisp: 70, thunderwave: 66, toxic: 66, glare: 66, yawn: 55, stunspore: 55,
  hypnosis: 40, stealthrock: 55, spikes: 40, toxicspikes: 40, leechseed: 55, substitute: 45, protect: 30,
  encore: 45, taunt: 40, trickroom: 30, reflect: 35, lightscreen: 35, auroraveil: 40, haze: 30, rest: 25,
};

/** Evolution options available for an owned Pokémon at a level. */
/** Starter lines scouted in 레전드 that evolve into their Hisui forms (Decidueye, Typhlosion, Samurott). */
export const HISUI_STARTER_LINES = new Set(["rowlet", "dartrix", "cyndaquil", "quilava", "oshawott", "dewott"]);

/**
 * Evolutions open to a Pokémon. Hisui forms only for a Rowlet / Cyndaquil / Oshawott scouted in 레전드
 * (`hisuian`), which evolve into them instead of the usual form.
 */
export function evolutionOptions(speciesId: string, level: number, hisuian = false): { id: string; how: string; ready: boolean; item?: string }[] {
  const s = dex.species.get(speciesId);
  const out: { id: string; how: string; ready: boolean; item?: string }[] = [];
  // this game's own rules: Kubfu by scroll, Rockruff into any of the three Lycanroc, Zygarde 10% → 50% → 100%
  const special: Record<string, { id: string; how: string; ready: boolean; item?: string }[]> = {
    kubfu: [
      { id: "urshifu", how: "악의 족자 사용", ready: true, item: "key:scrolldark" },
      { id: "urshifurapidstrike", how: "물의 족자 사용", ready: true, item: "key:scrollwater" },
    ],
    rockruff: ["lycanroc", "lycanrocmidnight", "lycanrocdusk"].map(id => ({ id, how: "Lv.25", ready: level >= 25 })),
    zygarde10: [{ id: "zygarde", how: "Lv.25", ready: level >= 25 }],
    zygarde: [{ id: "zygardecomplete", how: "Lv.50", ready: level >= 50 }],
  };
  if (special[s.id]) return special[s.id];
  const evos = (s.evos || []).filter(e => {
    const isHisui = /-Hisui$/.test(e);
    const hasHisui = (s.evos || []).some(x => /-Hisui$/.test(x));
    return hisuian && hasHisui ? isHisui : !isHisui;
  });
  for (const e of evos) {
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
