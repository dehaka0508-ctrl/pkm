// A/B benchmark for the team-preview pickers: the current pickers against the ones before them, in real battles
// between NPC clubs' teams (each pairing played twice, sides swapped). Heavy: run with BENCH=1.
//   BENCH=1 BENCH_N=150 npx vitest run test/pick-bench.test.ts
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { sideFor } from "../src/game/season";
import { simulateMatch } from "../src/battle/engine";
import { pickLineup, TRIO_WEIGHTS } from "../src/battle/ai";
import { legacyPickLineup } from "./bench/legacy-pick";
import { Rng } from "../src/game/rng";
import type { MatchRules } from "../src/game/match-rules";

const N = Number(process.env.BENCH_N || 60);
const run = process.env.BENCH ? describe : describe.skip;

async function bench(rules: MatchRules, n: number) {
  const st = createGame({ mode: "trainer", slotId: allTrainers()[0].id, name: "b" });
  const ids = allTrainers().map(t => t.id).filter(id => id !== st.player.slotId);
  const rng = new Rng(`bench:${rules}`);
  let win = 0, loss = 0, draw = 0;
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) await new Promise<void>(r => setTimeout(r, 0)); // let the test worker answer its messages
    const a = rng.pick(ids);
    let b = rng.pick(ids);
    while (b === a) b = rng.pick(ids);
    const doubles = rules === "doubles";
    const A = sideFor(st, a, doubles, rules === "league", b);
    const B = sideFor(st, b, doubles, rules === "league", a);
    for (const flip of [false, true]) {
      // `mine` uses the current picker, `theirs` the legacy one; both see the other's whole team
      const [X, Y] = flip ? [B, A] : [A, B];
      const mine = { ...X, picks: pickLineup(X.team, Y.team, 1, new Rng(`n${i}${flip}`), rules) };
      const theirs = { ...Y, picks: legacyPickLineup(Y.team, X.team, 1, new Rng(`o${i}${flip}`), rules) };
      const r = simulateMatch(mine, theirs, `bench:${rules}:${i}:${flip}`, { doubles });
      if (r.winner === 0) win++;
      else if (r.winner === 1) loss++;
      else draw++;
    }
  }
  return { rules, games: win + loss + draw, win, loss, draw, rate: +(win / Math.max(1, win + loss)).toFixed(3) };
}

// weight sets to compare in one run: BENCH_TUNE='[{"avg":1,"cover":0,...},...]'
const TUNE: Partial<typeof TRIO_WEIGHTS>[] = process.env.BENCH_TUNE ? JSON.parse(process.env.BENCH_TUNE) : [];
run("trio weights", () => {
  for (const w of TUNE) {
    it(JSON.stringify(w), async () => {
      const keep = { ...TRIO_WEIGHTS };
      Object.assign(TRIO_WEIGHTS, w);
      const r = await bench("singles", N);
      Object.assign(TRIO_WEIGHTS, keep);
      console.log("TUNE " + JSON.stringify(w) + " → " + r.rate + ` (${r.win}-${r.loss})`);
    }, 3_600_000);
  }
});

run("picker A/B (current vs legacy)", () => {
  for (const rules of (process.env.BENCH_RULES || "singles,doubles").split(",") as MatchRules[]) {
    it(rules, async () => {
      const r = await bench(rules, N);
      console.log("BENCH " + JSON.stringify(r));
      expect(r.games).toBe(N * 2);
    }, 3_600_000);
  }
});
