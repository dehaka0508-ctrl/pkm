// The team-preview pickers as they were before the package-based ones: kept only as the baseline the A/B
// benchmark (pick-bench.test.ts) plays the current pickers against.
import { dex, toID } from "../../src/data/dex";
import type { MonSet } from "../../src/game/types";
import { MATCH_SIZE, type MatchRules } from "../../src/game/match-rules";
import { Rng } from "../../src/game/rng";
import { battlerFromSet, matchup, speedOf, typeMultiplier } from "../../src/battle/calc";

/** Choose 3 of 6 (returns 0-based indices; first is the lead). */
export function legacyPickThree(own: MonSet[], opp: MonSet[], skill: number, rng: Rng, size = 3, avoid?: readonly number[]): number[] {
  if (own.length <= size) {
    const idx = own.map((_, i) => i);
    return orderLead(idx, own, opp);
  }
  const ob = own.map(battlerFromSet);
  const pb = opp.map(battlerFromSet);
  const noise = (1 - skill) * 0.6;
  const value = ob.map((b, i) => {
    let v = 0;
    for (const o of pb) v += matchup(b, o);
    v /= Math.max(1, pb.length);
    v += dex.species.get(own[i].species).bst / 3000;
    return v + (rng.next() - 0.5) * noise;
  });
  const ranked = value
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0]);
  const chosen = ranked.slice(0, size).map(x => x[1]);
  if (size === 3 && avoid?.length === 3 && chosen.every(i => avoid.includes(i))) {
    const replacement = ranked.find(([, i]) => !chosen.includes(i));
    // Keep the two highest-valued picks and replace only the weakest with the best reserve.
    if (replacement) chosen[chosen.length - 1] = replacement[1];
  }
  return orderLead(chosen, own, opp);
}

const LEAGUE_HAZARDS = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
const CLEAR = new Set(["rapidspin", "defog", "mortalspin", "tidyup", "courtchange"]);
const PIVOTS = new Set(["uturn", "voltswitch", "flipturn", "partingshot", "chillyreception"]);
const PAIR_SUPPORT = new Set(["fakeout", "tailwind", "trickroom", "followme", "ragepowder", "helpinghand", "wideguard", "icywind", "electroweb"]);

export function legacyPickLineup(own: MonSet[], opp: MonSet[], skill: number, rng: Rng, rules: MatchRules, avoid?: readonly number[]): number[] {
  if (rules === "singles") return legacyPickThree(own, opp, skill, rng);
  const count = Math.min(MATCH_SIZE[rules], own.length);
  if (!count) return [];
  const theirs = opp.map(battlerFromSet);
  const ours = own.map(battlerFromSet);
  const ratings = ours.map(b => theirs.map(o => matchup(b, o)));
  const moves: string[][] = own.map(m => m.moves.map(toID));
  const base = ratings.map(row => row.reduce((a, b) => a + b, 0) / Math.max(1, row.length) + (rng.next() - .5) * (1 - skill) * .6);
  const ranked = own.map((_, i) => i).sort((a, b) => base[b] - base[a]);
  if (rules === "doubles") {
    const support = moves.map(list => list.reduce((n, id) => n + (PAIR_SUPPORT.has(id) ? .18 : id === "protect" ? .07 : 0), 0));
    const spread = moves.map(list => list.some(id => dex.moves.get(id).target === "allAdjacentFoes"));
    const allyRisk = (i: number, j: number) => moves[i].some(id => {
      const move = dex.moves.get(id);
      return move.target === "allAdjacent" && typeMultiplier(move.type, ours[j].types) > 0
        && !(move.type === "Ground" && ours[j].ability === "levitate")
        && !moves[j].includes("protect");
    }) ? .2 : 0;
    let pair = ranked.slice(0, 2);
    let top = -Infinity;
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
      const coverage = ratings[i].reduce((n, v, k) => n + Math.max(v, ratings[j][k]), 0) / Math.max(1, theirs.length);
      const speed = moves[i].includes("trickroom") && speedOf(ours[j]) < 90 || moves[j].includes("trickroom") && speedOf(ours[i]) < 90;
      const score = (base[i] + base[j]) * .5 + coverage + support[i] + support[j]
        + (spread[i] || spread[j] ? .12 : 0) + (speed ? .2 : 0) - allyRisk(i, j) - allyRisk(j, i);
      if (score > top) { top = score; pair = [i, j]; }
    }
    const bench = ranked.filter(i => !pair.includes(i)).sort((a, b) => base[b] + support[b] - base[a] - support[a]);
    return [...pair, ...bench].slice(0, count);
  }

  const chosen: number[] = [];
  const utility = [LEAGUE_HAZARDS, CLEAR, PIVOTS, RECOVER];
  while (chosen.length < count) {
    const added = ranked.filter(i => !chosen.includes(i)).map(i => {
      const coverage = ratings[i].reduce((n, v, k) => n + Math.max(0, v - Math.max(0, ...chosen.map(j => ratings[j][k]))), 0);
      const role = utility.filter(group => moves[i].some(m => group.has(m)) && !chosen.some(j => moves[j].some(m => group.has(m)))).length;
      return { i, score: base[i] + coverage / Math.max(1, theirs.length) + .16 * role };
    }).sort((a, b) => b.score - a.score)[0];
    chosen.push(added.i);
  }
  if (avoid?.length === count && chosen.every(i => avoid.includes(i))) {
    const reserve = ranked.find(i => !chosen.includes(i));
    if (reserve !== undefined) chosen[count - 1] = reserve;
  }
  const lead = chosen.slice().sort((a, b) => (base[b] + (moves[b].some(m => LEAGUE_HAZARDS.has(m) || PIVOTS.has(m)) ? .25 : 0))
    - (base[a] + (moves[a].some(m => LEAGUE_HAZARDS.has(m) || PIVOTS.has(m)) ? .25 : 0)))[0];
  return [lead, ...chosen.filter(i => i !== lead)];
}

function orderLead(idx: number[], own: MonSet[], opp: MonSet[]): number[] {
  const pb = opp.map(battlerFromSet);
  let best = idx[0];
  let bestV = -Infinity;
  for (const i of idx) {
    const b = battlerFromSet(own[i]);
    let v = 0;
    for (const o of pb) v += matchup(b, o);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return [best, ...idx.filter(i => i !== best)];
}

const SETUP_MOVES = new Set([
  "swordsdance", "dragondance", "bulkup", "shiftgear", "coil", "victorydance", "tidyup", "howl", "honeclaws",
  "nastyplot", "calmmind", "quiverdance", "tailglow", "shellsmash", "growth", "workup", "agility", "rockpolish",
  "autotomize", "irondefense", "amnesia", "cosmicpower", "curse", "bellydrum", "geomancy", "clangoroussoul", "noretreat",
]);
const RECOVER = new Set(["recover", "roost", "slackoff", "softboiled", "milkdrink", "moonlight", "morningsun", "synthesis", "shoreup", "strengthsap", "healorder", "rest", "junglehealing", "lifedew"]);
