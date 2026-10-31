// Pokémon World Tournament: 32 entrants, Swiss stage (3 wins advance / 3 losses out),
// then a 16-player best-of-3 knockout.
import { REGIONS } from "../data/dex";
import { standings } from "./league";
import type { GameState, PwtMatch, PwtState } from "./state";
import { Rng } from "./rng";

/** Regions sorted by coefficient; top 5 get a 4th slot (27 + 5 = 32). */
export function slotsPerRegion(state: GameState): Record<string, number> {
  const order = REGIONS.map(r => r.id).sort((a, b) => (state.coefficients[b] ?? 0) - (state.coefficients[a] ?? 0));
  const out: Record<string, number> = {};
  order.forEach((id, i) => (out[id] = i < 5 ? 4 : 3));
  return out;
}

export function qualify(state: GameState): PwtState {
  const slots = slotsPerRegion(state);
  const entrants: string[] = [];
  const seeds: Record<string, string> = {};
  for (const r of REGIONS) {
    const table = standings(state.leagues[r.id]);
    table.slice(0, slots[r.id]).forEach((row, i) => {
      entrants.push(row.id);
      seeds[row.id] = `${r.name} ${i + 1}위`;
    });
  }
  const records: PwtState["records"] = {};
  for (const e of entrants) records[e] = { w: 0, l: 0 };
  return { season: state.season, entrants, seeds, records, swiss: [], advanced: [], eliminated: [], ko: [] };
}

/** Pairs the next Swiss round among active players with equal records. */
export function pairSwiss(pwt: PwtState, rng: Rng): PwtMatch[] {
  const active = pwt.entrants.filter(e => !pwt.advanced.includes(e) && !pwt.eliminated.includes(e));
  const played = new Set<string>();
  for (const round of pwt.swiss) for (const m of round) played.add([m.a, m.b].sort().join("|"));
  const groups = new Map<string, string[]>();
  for (const e of rng.shuffle(active.slice())) {
    const r = pwt.records[e];
    const key = `${r.w}-${r.l}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const keys = [...groups.keys()].sort((a, b) => Number(b.split("-")[0]) - Number(a.split("-")[0]) || Number(a.split("-")[1]) - Number(b.split("-")[1]));
  const matches: PwtMatch[] = [];
  let carry: string[] = [];
  for (const k of keys) {
    const pool = [...carry, ...groups.get(k)!];
    carry = [];
    while (pool.length >= 2) {
      const a = pool.shift()!;
      let j = pool.findIndex(b => !played.has([a, b].sort().join("|")));
      if (j < 0) j = 0;
      const b = pool.splice(j, 1)[0];
      matches.push({ a, b, bestOf: 1, games: [] });
    }
    carry = pool;
  }
  if (carry.length === 1) {
    // odd one out gets a bye win (rare)
    pwt.records[carry[0]].w++;
  }
  return matches;
}

export function applySwiss(pwt: PwtState, m: PwtMatch) {
  if (!m.winner) return;
  const loser = m.winner === m.a ? m.b : m.a;
  pwt.records[m.winner].w++;
  pwt.records[loser].l++;
  for (const id of [m.winner, loser]) {
    const r = pwt.records[id];
    if (r.w >= 3 && !pwt.advanced.includes(id)) pwt.advanced.push(id);
    if (r.l >= 3 && !pwt.eliminated.includes(id)) pwt.eliminated.push(id);
  }
}

/** Build the round of 16 from Swiss results (best records seeded apart). */
export function seedKnockout(pwt: PwtState) {
  let adv = pwt.advanced.slice();
  if (adv.length < 16) {
    const rest = pwt.entrants
      .filter(e => !adv.includes(e))
      .sort((a, b) => pwt.records[b].w - pwt.records[a].w || pwt.records[a].l - pwt.records[b].l);
    adv = adv.concat(rest.slice(0, 16 - adv.length));
  }
  adv = adv.slice(0, 16).sort((a, b) => pwt.records[a].l - pwt.records[b].l);
  const order = [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];
  const seeded = order.map(i => adv[i]);
  const r16: PwtMatch[] = [];
  for (let i = 0; i < 16; i += 2) r16.push({ a: seeded[i], b: seeded[i + 1], bestOf: 3, games: [] });
  pwt.ko = [r16];
}

export function nextKoRound(pwt: PwtState) {
  const last = pwt.ko[pwt.ko.length - 1];
  if (!last || last.some(m => !m.winner)) return;
  if (last.length === 1) {
    pwt.champion = last[0].winner;
    return;
  }
  const next: PwtMatch[] = [];
  for (let i = 0; i < last.length; i += 2) next.push({ a: last[i].winner!, b: last[i + 1].winner!, bestOf: 3, games: [] });
  pwt.ko.push(next);
}

export const KO_NAMES = ["16강", "8강", "준결승", "결승"];

export function playerPwtResult(pwt: PwtState | null, id: string): string {
  if (!pwt || !pwt.entrants.includes(id)) return "진출 실패";
  if (pwt.champion === id) return "우승";
  for (let i = pwt.ko.length - 1; i >= 0; i--) {
    const m = pwt.ko[i].find(x => x.a === id || x.b === id);
    if (m) return m.winner && m.winner !== id ? `${KO_NAMES[i]} 탈락` : KO_NAMES[i];
  }
  if (pwt.eliminated.includes(id)) return "스위스 탈락";
  return "스위스 진행 중";
}
