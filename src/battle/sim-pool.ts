// Runs many AI matches in Web Workers (falls back to the main thread).
import type { MatchResult } from "./engine";
import type { SimJob, Simulator } from "../game/season";

let workers: Worker[] | null = null;
let nextId = 1;

function getWorkers(): Worker[] {
  if (workers) return workers;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  workers = [];
  try {
    for (let i = 0; i < n; i++) workers.push(new Worker(new URL("./sim-worker.ts", import.meta.url), { type: "module" }));
  } catch (e) {
    console.warn("workers unavailable", e);
    workers = [];
  }
  return workers;
}

function runOn(w: Worker, jobs: SimJob[], tick: () => void): Promise<MatchResult[]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const onMsg = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.progress) return tick();
      w.removeEventListener("message", onMsg);
      resolve(e.data.results);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", reject, { once: true });
    w.postMessage({ id, jobs: JSON.parse(JSON.stringify(jobs)) });
  });
}

async function mainThread(jobs: SimJob[], tick: () => void): Promise<MatchResult[]> {
  const { simulateMatch } = await import("./engine");
  const out: MatchResult[] = [];
  for (const j of jobs) {
    try {
      out.push(simulateMatch(j.p1, j.p2, j.seed));
    } catch (err) {
      // same fallback as the worker: one broken battle must not stop the whole matchday
      console.error("sim failed", j.p1.name, j.p2.name, err);
      out.push({ winner: 0, remaining: [1, 0], turns: 0, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as unknown as MatchResult);
    }
    tick();
    if (out.length % 4 === 0) await new Promise(r => setTimeout(r, 0));
  }
  return out;
}

export const workerSimulator: Simulator = async (jobs, onProgress) => {
  if (!jobs.length) return [];
  const ws = getWorkers();
  let done = 0;
  const tick = () => onProgress?.(Math.min(jobs.length, ++done), jobs.length);
  if (!ws.length) return mainThread(jobs, tick);
  try {
    const chunks: SimJob[][] = ws.map(() => []);
    jobs.forEach((j, i) => chunks[i % ws.length].push(j));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new Error("worker timeout")), 120000)));
    const parts = await Promise.race([Promise.all(chunks.map((c, i) => (c.length ? runOn(ws[i], c, tick) : Promise.resolve([])))), timeout]).finally(() => clearTimeout(timer));
    const out: MatchResult[] = new Array(jobs.length);
    parts.forEach((res, wi) => res.forEach((r, k) => (out[k * ws.length + wi] = r)));
    return out;
  } catch (e) {
    // e.g. workers blocked by the host: run everything on the main thread from now on
    console.warn("worker simulation failed, using main thread", e);
    for (const w of ws) w.terminate();
    workers = [];
    done = 0;
    return mainThread(jobs, tick);
  }
};
