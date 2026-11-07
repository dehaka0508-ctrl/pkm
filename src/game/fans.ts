// Fans' mood (팬 만족도) and fame (명성), both 0–100.
// Mood follows recent form and club decisions and moves quickly; fame is the club's outward, long-term standing.
import type { GameState } from "./state";
import { pushMsg } from "./state";
import { dex } from "../data/dex";
import type { OwnedMon } from "./types";

export const SAT_START = 60;
const LOG_LEN = 8;
export interface MoodEntry {
  day: number;
  text: string;
  d: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export const satOf = (state: GameState) => state.player.satisfaction ?? SAT_START;
/** 0.4 (furious) … 1.2 (ecstatic): scales merchandise and how fast the fan base grows. */
export const moodFactor = (sat: number) => 0.4 + (clamp(sat, 0, 100) / 100) * 0.8;

export function addSat(state: GameState, d: number, text: string) {
  d = r1(d);
  if (!d) return;
  const p = state.player;
  p.satisfaction = r1(clamp(satOf(state) + d, 0, 100));
  (p.satLog ||= []).unshift({ day: state.day, text, d });
  p.satLog.length = Math.min(p.satLog.length, LOG_LEN);
}

export function addFame(state: GameState, d: number, text: string, notify = true) {
  d = r1(d);
  if (!d) return;
  const p = state.player;
  p.reputation = r1(clamp(p.reputation + d, 0, 100));
  (p.fameLog ||= []).unshift({ day: state.day, text, d });
  p.fameLog.length = Math.min(p.fameLog.length, LOG_LEN);
  if (notify) pushMsg(state, "info", `명성 ${d > 0 ? "+" : ""}${d}: ${text}`, `명성 ${Math.round(p.reputation)}/100`);
}

/** Weekly: moods cool off toward neutral; the ticket price fans compare against catches up. */
export function moodWeek(state: GameState) {
  const p = state.player;
  const s = satOf(state);
  p.satisfaction = r1(s + (50 - s) * 0.05);
  p.priceRef = p.ticketPrice;
}

const nameOf = (m: { nickname?: string; species: string }, ko: (s: string) => string) => m.nickname || ko(m.species);

/** Fame lost on every 5th loss in a row: 2, or only 1 while the club stands higher in its league than expected. */
export const streakLossFame = (aboveExpectation: boolean) => (aboveExpectation ? 1 : 2);

/**
 * A finished game. `outcome`: 0 win, 1 loss, -1 draw.
 * Fame: every 5th win (loss) in a row, all competitions. Mood: league results, more on a league run.
 * `aboveExpectation` (asked only on a 5th loss): the club is ranked above its expected league finish.
 */
export function onGameResult(state: GameState, outcome: 0 | 1 | -1, league: boolean, aboveExpectation: () => boolean = () => false) {
  const p = state.player;
  const st = p.streak ?? 0;
  const ns = outcome === 0 ? Math.max(1, st + 1) : outcome === 1 ? Math.min(-1, st - 1) : 0;
  p.streak = ns;
  if (ns >= 5 && ns % 5 === 0) addFame(state, 2, `${ns}연승`);
  if (ns <= -5 && ns % 5 === 0) {
    const above = aboveExpectation();
    addFame(state, -streakLossFame(above), above ? `${-ns}연패 (순위는 기대 이상)` : `${-ns}연패`);
  }
  if (!league) return;
  const ls = p.leagueStreak ?? 0;
  const nls = outcome === 0 ? Math.max(1, ls + 1) : outcome === 1 ? Math.min(-1, ls - 1) : 0;
  p.leagueStreak = nls;
  if (outcome === 0) addSat(state, nls >= 3 ? 2 : 1, nls >= 3 ? `리그 ${nls}연승` : "리그 승리");
  else if (outcome === 1) addSat(state, nls <= -3 ? -2 : -1, nls <= -3 ? `리그 ${-nls}연패` : "리그 패배");
}

/** A knockout tie or a group stage is decided. */
export function onStage(state: GameState, comp: string, kind: "advance" | "out" | "runnerUp" | "title") {
  if (kind === "advance") addSat(state, 3, `${comp} 진출`);
  else if (kind === "out") addSat(state, -3, `${comp} 탈락`);
  else if (kind === "runnerUp") addSat(state, -1, `${comp} 준우승`);
  else addSat(state, 8, `${comp} 우승`);
}

/** A new Pokémon joins: fans cheer a strong signing (high base stats and IVs). */
export function onSign(state: GameState, m: OwnedMon, ko: (s: string) => string, legend = false) {
  const bst = dex.species.get(m.species).bst;
  const iv = Object.values(m.ivs).reduce((a, b) => a + b, 0);
  const gain = legend ? 5 : clamp(Math.round((bst - 480) / 40 + (iv - 140) / 25), 0, 5);
  if (gain > 0) addSat(state, gain, `${nameOf(m, ko)} 영입`);
}

/** The ace (the Pokémon with the highest base stats × IVs) is let go. */
export function onRelease(state: GameState, m: OwnedMon, squadBefore: OwnedMon[], ko: (s: string) => string) {
  const power = (x: OwnedMon) => dex.species.get(x.species).bst * Object.values(x.ivs).reduce((a, b) => a + b, 0);
  const ace = squadBefore.reduce((a, b) => (power(b) > power(a) ? b : a), squadBefore[0]);
  if (ace && ace.uid === m.uid) addSat(state, -6, `에이스 ${nameOf(m, ko)} 방출`);
}

/** Pokémon sent out still hurt from an untreated battle. */
export function onHurtFielded(state: GameState, mons: OwnedMon[], ko: (s: string) => string) {
  for (const m of mons) {
    if (!m.cond || m.cond.hp >= 0.5) continue;
    addSat(state, m.cond.hp <= 0 ? -3 : -2, `회복 못 한 ${nameOf(m, ko)} 출전`);
  }
}

/** A change of ticket price of 10% or more at once: a one-off jolt to the mood. */
export function setTicketPrice(state: GameState, price: number) {
  const p = state.player;
  const ref = p.priceRef ?? p.ticketPrice;
  p.ticketPrice = price;
  const ch = price / ref - 1;
  if (Math.abs(ch) < 0.1) return 0;
  const d = r1(clamp(-ch * 20, -8, 8));
  addSat(state, d, `표값 대폭 ${ch > 0 ? "인상" : "인하"} (₽${ref}→₽${price})`);
  p.priceRef = price;
  return d;
}

/** Preview of the mood change a new price would cause. */
export function priceJolt(state: GameState, price: number): number {
  const ref = state.player.priceRef ?? state.player.ticketPrice;
  const ch = price / ref - 1;
  return Math.abs(ch) < 0.1 ? 0 : r1(clamp(-ch * 20, -8, 8));
}

/** Season end: fame moves with the league finish against what the squad's strength promised. */
export function seasonFame(state: GameState, expected: number, actual: number) {
  const d = clamp(Math.round((expected - actual) * 0.75), -8, 8);
  if (d) addFame(state, d, `시즌 기대 ${expected}위 → 실제 ${actual}위`);
}

// ---------- NPC clubs (same rules, without the logs) ----------

export interface NpcMood {
  reputation: number;
  sat?: number;
  streak?: number;
}

export function npcResult(n: NpcMood, outcome: 0 | 1 | -1, aboveExpectation: () => boolean = () => false) {
  const st = n.streak ?? 0;
  const ns = outcome === 0 ? Math.max(1, st + 1) : outcome === 1 ? Math.min(-1, st - 1) : 0;
  n.streak = ns;
  if (ns >= 5 && ns % 5 === 0) n.reputation = clamp(n.reputation + 2, 0, 100);
  if (ns <= -5 && ns % 5 === 0) n.reputation = clamp(n.reputation - streakLossFame(aboveExpectation()), 0, 100);
  const s = n.sat ?? SAT_START;
  n.sat = clamp(s + (outcome === 0 ? (ns >= 3 ? 2 : 1) : outcome === 1 ? (ns <= -3 ? -2 : -1) : 0), 0, 100);
}

export function npcMoodWeek(n: NpcMood) {
  const s = n.sat ?? SAT_START;
  n.sat = r1(s + (50 - s) * 0.05);
}
