// Draw ceremonies: the result plus every step, so the UI can replay it ball by ball.
import { Rng } from "./rng";

export interface DrawStep {
  team: string;
  pool: number;
  box: number;
  slot: number;
}
export interface DrawData {
  title: string;
  pools: { name: string; teams: string[] }[];
  boxes: { name: string; size: number }[];
  steps: DrawStep[];
}

export const GROUP_NAMES = "ABCDEFGH".split("");

/**
 * Champions-League style group draw: pot by pot, each drawn team goes to the first group
 * (A→H) that has no team from its pot or region and still leaves a valid draw for everyone else.
 */
export function drawGroups(pots: string[][], regionOf: (id: string) => string, rng: Rng, title: string): { groups: string[][]; draw: DrawData } {
  const G = pots[0].length;
  const groups: string[][] = Array.from({ length: G }, () => []);
  const regions: Set<string>[] = Array.from({ length: G }, () => new Set());
  const steps: DrawStep[] = [];
  const order = pots.map(p => rng.shuffle(p.slice()));
  let strictRegion = true;
  const ok = (team: string, pot: number, g: number) => groups[g].length === pot && (!strictRegion || !regions[g].has(regionOf(team)));
  const remaining = (pi: number, ti: number) => {
    const out: { team: string; pot: number }[] = [];
    for (let p = pi; p < order.length; p++) for (let t = p === pi ? ti : 0; t < order[p].length; t++) out.push({ team: order[p][t], pot: p });
    return out;
  };
  // feasibility of placing `rest` (pot-ordered: a pot is complete before the next starts)
  let budget = 0;
  const feasible = (rest: { team: string; pot: number }[]): boolean => {
    if (!rest.length) return true;
    if (--budget < 0) return true; // give up checking; worst case we relax later
    const pot = rest[0].pot;
    const inPot = rest.filter(r => r.pot === pot);
    // most constrained team of this pot first
    let best = -1;
    let bestOpts: number[] = [];
    for (let i = 0; i < inPot.length; i++) {
      const opts: number[] = [];
      for (let g = 0; g < G; g++) if (ok(inPot[i].team, pot, g)) opts.push(g);
      if (!opts.length) return false;
      if (best < 0 || opts.length < bestOpts.length) {
        best = i;
        bestOpts = opts;
      }
    }
    const pick = inPot[best];
    const others = rest.filter(r => r !== pick);
    for (const g of bestOpts) {
      groups[g].push(pick.team);
      regions[g].add(regionOf(pick.team));
      const good = feasible(others);
      groups[g].pop();
      if (!groups[g].some(t => regionOf(t) === regionOf(pick.team))) regions[g].delete(regionOf(pick.team));
      if (good) return true;
    }
    return false;
  };
  for (let p = 0; p < order.length; p++) {
    for (let t = 0; t < order[p].length; t++) {
      const team = order[p][t];
      let placed = -1;
      for (let g = 0; g < G && placed < 0; g++) {
        if (!ok(team, p, g)) continue;
        groups[g].push(team);
        regions[g].add(regionOf(team));
        budget = 20000;
        if (feasible(remaining(p, t + 1))) placed = g;
        else {
          groups[g].pop();
          if (!groups[g].some(x => regionOf(x) === regionOf(team))) regions[g].delete(regionOf(team));
        }
      }
      if (placed < 0) {
        // no valid draw exists with region protection — relax it
        strictRegion = false;
        placed = groups.findIndex(gr => gr.length === p);
        groups[placed].push(team);
        regions[placed].add(regionOf(team));
      }
      steps.push({ team, pool: p, box: placed, slot: p });
    }
  }
  return {
    groups,
    draw: {
      title,
      pools: pots.map((p, i) => ({ name: `포트 ${i + 1}`, teams: p.slice() })),
      boxes: groups.map((_, i) => ({ name: `${GROUP_NAMES[i]}조`, size: pots.length })),
      steps,
    },
  };
}

/**
 * Round-of-16 draw: a runner-up is drawn, then a group winner from another group and region.
 * Returns pairs [runnerUp, winner] in bracket order.
 */
export function drawKnockout(
  winners: string[],
  runners: string[],
  groupOf: (id: string) => number,
  regionOf: (id: string) => string,
  rng: Rng,
  title: string,
): { pairs: [string, string][]; draw: DrawData } {
  const steps: DrawStep[] = [];
  const pairs: [string, string][] = [];
  const freeW = new Set(winners);
  const rOrder = rng.shuffle(runners.slice());
  let level = 2; // 2 = group + region protection, 1 = group only, 0 = none
  const can = (r: string, w: string) => (level < 1 || groupOf(r) !== groupOf(w)) && (level < 2 || regionOf(r) !== regionOf(w));
  const matchable = (rs: string[], ws: string[]): boolean => {
    // bipartite perfect matching (Kuhn)
    const match = new Map<string, string>();
    const tryR = (r: string, seen: Set<string>): boolean => {
      for (const w of ws) {
        if (!can(r, w) || seen.has(w)) continue;
        seen.add(w);
        const cur = match.get(w);
        if (!cur || tryR(cur, seen)) {
          match.set(w, r);
          return true;
        }
      }
      return false;
    };
    return rs.every(r => tryR(r, new Set()));
  };
  while (!matchable(rOrder, winners) && level > 0) level--;
  rOrder.forEach((r, i) => {
    steps.push({ team: r, pool: 0, box: i, slot: 0 });
    const restR = rOrder.slice(i + 1);
    const cands = rng.shuffle([...freeW].filter(w => can(r, w)));
    let w = cands.find(c => {
      const ws = [...freeW].filter(x => x !== c);
      return matchable(restR, ws);
    });
    if (!w) w = cands[0] ?? [...freeW][0];
    freeW.delete(w);
    steps.push({ team: w, pool: 1, box: i, slot: 1 });
    pairs.push([r, w]);
  });
  return {
    pairs,
    draw: {
      title,
      pools: [
        { name: "조 2위", teams: runners.slice() },
        { name: "조 1위", teams: winners.slice() },
      ],
      boxes: pairs.map((_, i) => ({ name: `16강 ${i + 1}경기`, size: 2 })),
      steps,
    },
  };
}
