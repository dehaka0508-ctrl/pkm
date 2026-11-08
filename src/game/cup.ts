// Regional cup: 20 trainers, two wings of five two-team slots (A–E); every match a single game, the final too.
// Wing bracket: A–B, C–D, then (C/D) vs E, then (A/B) vs (C/D/E) in the wing final.
// Matches are doubles under Pokémon Champions rules (bring 6, pick 4, no duplicate species or items).
import { regionById } from "../data/dex";
import type { DrawData } from "./draw";
import { newTie, type Tie } from "./tie";
import { Rng } from "./rng";
import type { PrevRow } from "./pwt";

export const LETTERS = ["A", "B", "C", "D", "E"] as const;
export const WING_NAMES = ["A윙", "B윙"];
/** Tie keys played in each cup round (per wing). */
export const ROUND_KEYS = [["A", "B", "C", "D"], ["AB", "CD", "E"], ["CDE"], ["WF"]];
const FEEDERS: Record<string, [string, string]> = { AB: ["A", "B"], CD: ["C", "D"], CDE: ["CD", "E"], WF: ["AB", "CDE"] };

export interface Cup {
  region: string;
  season: number;
  draw: DrawData;
  ties: Record<string, Tie>; // "0A", "1CD", "0WF", "F"
  /** previous-season rank, used to decide who hosts the second leg */
  rank: Record<string, number>;
  champion?: string;
}

/**
 * Season 1: random draw. Later: odd ranks → A wing, even ranks → B wing, then
 * filled E, D, C, B, A two at a time in rank order (so last season's top 4 sit in the E slots).
 */
export function makeCup(region: string, season: number, teams: string[], prev: PrevRow[] | undefined, random: boolean, rng: Rng): Cup {
  const rank: Record<string, number> = {};
  (prev || []).forEach(r => (rank[r.id] = r.rank));
  teams.forEach(id => (rank[id] ??= 99));
  const boxes = [0, 1].flatMap(w => LETTERS.map(L => ({ name: `${WING_NAMES[w]} ${L}`, size: 2 })));
  const boxIdx = (w: number, L: string) => w * 5 + LETTERS.indexOf(L as any);
  const slots: string[][] = boxes.map(() => []);
  const steps: DrawData["steps"] = [];
  let poolTeams: string[];
  if (random) {
    poolTeams = teams.slice();
    const order = rng.shuffle(teams.slice());
    order.forEach((id, i) => {
      const box = Math.floor(i / 2);
      slots[box].push(id);
      steps.push({ team: id, pool: 0, box, slot: i % 2 });
    });
  } else {
    const ranked = teams.slice().sort((a, b) => rank[a] - rank[b]);
    poolTeams = ranked;
    ranked.forEach((id, i) => {
      const w = i % 2; // rank 1,3,5… → A wing
      const k = Math.floor(i / 2); // 0..9 inside the wing
      const L = "EDCBA"[Math.floor(k / 2)];
      const box = boxIdx(w, L);
      steps.push({ team: id, pool: 0, box, slot: slots[box].length });
      slots[box].push(id);
    });
  }
  const ties: Record<string, Tie> = {};
  [0, 1].forEach(w =>
    LETTERS.forEach(L => {
      const [x, y] = slots[boxIdx(w, L)];
      ties[`${w}${L}`] = orderTie(x, y, rank, random);
    }),
  );
  const draw: DrawData = {
    title: `시즌 ${season} ${regionById(region).name} 컵 대진 추첨`,
    pools: [{ name: random ? "참가 트레이너" : "전 시즌 순위", teams: poolTeams }],
    boxes,
    steps,
  };
  return { region, season, draw, ties, rank };
}

/** The better-ranked trainer hosts the second leg (b). In a random draw the first drawn hosts first. */
function orderTie(x: string, y: string, rank: Record<string, number>, keepOrder = false, format: Tie["format"] = "single"): Tie {
  if (keepOrder) return newTie(x, y, format);
  return rank[x] <= rank[y] ? newTie(y, x, format) : newTie(x, y, format);
}

/** Creates the ties of a round once their feeder ties are decided. */
export function ensureCupRound(cup: Cup, round: number): Tie[] {
  const out: Tie[] = [];
  for (const w of [0, 1]) {
    for (const key of ROUND_KEYS[round]) {
      const k = `${w}${key}`;
      if (!cup.ties[k]) {
        const f = FEEDERS[key];
        const a = cup.ties[`${w}${f[0]}`]?.winner;
        const b = cup.ties[`${w}${f[1]}`]?.winner;
        if (a && b) cup.ties[k] = orderTie(a, b, cup.rank);
      }
      if (cup.ties[k]) out.push(cup.ties[k]);
    }
  }
  return out;
}

export function ensureCupFinal(cup: Cup): Tie | null {
  if (cup.ties.F) return cup.ties.F;
  const a = cup.ties["0WF"]?.winner;
  const b = cup.ties["1WF"]?.winner;
  if (!a || !b) return null;
  cup.ties.F = newTie(a, b, "single");
  return cup.ties.F;
}

/** 3rd-place match: the two wing-final losers (the day before the final; no prize). */
export function ensureCupThird(cup: Cup): Tie | null {
  if (cup.ties.T) return cup.ties.T;
  const loser = (k: string) => {
    const t = cup.ties[k];
    return t?.winner ? (t.winner === t.a ? t.b : t.a) : null;
  };
  const a = loser("0WF");
  const b = loser("1WF");
  if (!a || !b) return null;
  cup.ties.T = newTie(a, b, "single");
  return cup.ties.T;
}

/** Wing and starting letter of a trainer. */
export function cupSlot(cup: Cup, id: string): { wing: number; letter: string } | null {
  for (const w of [0, 1]) for (const L of LETTERS) {
    const t = cup.ties[`${w}${L}`];
    if (t && (t.a === id || t.b === id)) return { wing: w, letter: L };
  }
  return null;
}

const PATH: Record<string, string[]> = { A: ["A", "AB", "WF"], B: ["B", "AB", "WF"], C: ["C", "CD", "CDE", "WF"], D: ["D", "CD", "CDE", "WF"], E: ["E", "CDE", "WF"] };
export const roundOfKey = (key: string) => ROUND_KEYS.findIndex(r => r.includes(key));

/** Keys of the ties `id` plays (or would play) on the way to the final. */
export function cupPath(cup: Cup, id: string): string[] {
  const s = cupSlot(cup, id);
  if (!s) return [];
  return [...PATH[s.letter].map(k => `${s.wing}${k}`), "F"];
}

export function cupAlive(cup: Cup, id: string): boolean {
  for (const k of cupPath(cup, id)) {
    const t = cup.ties[k];
    if (!t) return true;
    if (t.winner && t.winner !== id) return false;
    if (!t.winner) return true;
  }
  return true;
}

export const CUP_STAGE_NAME: Record<string, string> = { A: "1라운드", B: "1라운드", C: "1라운드", D: "1라운드", AB: "2라운드", CD: "2라운드", E: "2라운드", CDE: "3라운드", WF: "윙 결승", F: "결승" };

export function cupResult(cup: Cup | undefined, id: string): string {
  if (!cup) return "-";
  if (cup.champion === id) return "우승";
  const path = cupPath(cup, id);
  for (const k of path) {
    const t = cup.ties[k];
    if (!t) return "진행 중";
    if (t.winner && t.winner !== id) {
      if (k.endsWith("WF")) {
        const third = cup.ties.T;
        if (third?.winner) return third.winner === id ? "3위" : "4위";
        return "3·4위전";
      }
      return k === "F" ? "준우승" : `${CUP_STAGE_NAME[k.replace(/^\d/, "")]} 탈락`;
    }
    if (!t.winner) return `${CUP_STAGE_NAME[k.replace(/^\d/, "")]} 진행 중`;
  }
  return "진행 중";
}

/** Prize for winning a cup match: 10,000 × round (1–4), 80,000 for the final. */
export const cupPrize = (key: string) => (key === "T" ? 0 : key === "F" ? 80000 : 10000 * (roundOfKey(key.replace(/^\d/, "")) + 1));

/**
 * Old saves: two-legged / best-of-3 ties still open become single games (a game already played decides
 * them), and a cup from the short-lived Swiss format is drawn again as a wing bracket.
 */
export function fixCupFormat(c: any): boolean {
  if (!c || Array.isArray(c.swiss)) return false;
  for (const t of Object.values(c.ties || {}) as Tie[]) {
    if (t.winner || t.format === "single") continue;
    t.format = "single";
    const last = t.games[t.games.length - 1];
    if (last) t.winner = last.w === 0 ? t.a : last.w === 1 ? t.b : last.ra >= last.rb ? t.a : t.b;
  }
  return true;
}
export const isSwissCup = (c: any) => !!c && Array.isArray(c.swiss);

// ---------- Pokémon Champions team rules for cup matches ----------

import type { TeamMember } from "./types";
import { dex } from "../data/dex";

/** Species for the "one of each" rule: a regional form (Alola, Galar, Hisui, Paldea) counts as its own Pokémon. */
const natNum = (m: TeamMember) => {
  const sp = dex.species.get(m.species);
  const region = /^(Alola|Galar|Hisui|Paldea)/.exec(sp.forme || "")?.[1];
  return region ? `${sp.num}-${region}` : String(sp.num);
};
const itemId = (m: TeamMember) => (m.item ? dex.items.get(m.item).id : "");

/** What breaks the rules in a registration (4–6 Pokémon, no two of the same species, no two same held items). */
export function registrationProblems(team: TeamMember[], idx: number[]): string[] {
  const out: string[] = [];
  if (idx.length < 4 || idx.length > 6) out.push("4~6마리를 등록해야 합니다.");
  const mons = idx.map(i => team[i]).filter(Boolean);
  const nums = mons.map(natNum);
  if (new Set(nums).size !== nums.length) out.push("같은 포켓몬을 두 마리 등록할 수 없습니다.");
  const items = mons.map(itemId).filter(Boolean);
  if (new Set(items).size !== items.length) out.push("같은 도구를 지닌 포켓몬을 두 마리 등록할 수 없습니다.");
  return out;
}

/**
 * Automatic registration (NPCs, or the player's games played without them): strongest first, one of each
 * species; a held item already taken is left off the weaker Pokémon. Returns entry indices and the team.
 */
export function autoRegistration(team: TeamMember[]): { idx: number[]; team: TeamMember[] } {
  const order = team.map((m, i) => i).sort((a, b) => dex.species.get(team[b].species).bst - dex.species.get(team[a].species).bst || a - b);
  const nums = new Set<string>();
  const items = new Set<string>();
  const idx: number[] = [];
  const out: TeamMember[] = [];
  for (const i of order) {
    const m = team[i];
    if (nums.has(natNum(m)) || idx.length >= 6) continue;
    nums.add(natNum(m));
    const it = itemId(m);
    const keep = !it || !items.has(it);
    if (it && keep) items.add(it);
    idx.push(i);
    out.push(keep ? m : { ...m, item: "" });
  }
  // keep the entry order for display
  const pairs = idx.map((i, k) => [i, out[k]] as const).sort((a, b) => a[0] - b[0]);
  return { idx: pairs.map(p => p[0]), team: pairs.map(p => p[1]) };
}
