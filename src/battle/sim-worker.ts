/// <reference lib="webworker" />
import { simulateMatch } from "./engine";

self.onmessage = (e: MessageEvent) => {
  const { id, jobs } = e.data as { id: number; jobs: { p1: any; p2: any; seed: string }[] };
  const results = [];
  for (const j of jobs) {
    try {
      results.push(simulateMatch(j.p1, j.p2, j.seed));
    } catch (err) {
      console.error("sim failed", err);
      results.push({ winner: 0, remaining: [1, 0], turns: 0, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] });
    }
    (self as any).postMessage({ id, progress: 1 });
  }
  (self as any).postMessage({ id, results });
};
