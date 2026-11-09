// Two-turn moves in the battle viewer: their own first-turn line, and Fly / Dig / Dive leave the field and come back.
import { describe, it, expect } from "vitest";
import { BattleDirector } from "../src/render/director";

function recorder() {
  const calls: [string, any[]][] = [];
  const scene: any = new Proxy({}, {
    get: (_t, k) => (k === "then" ? undefined : k === "mons" ? [{}, {}, {}, {}] : (...a: any[]) => (calls.push([String(k), a]), Promise.resolve())),
  });
  return { scene, calls };
}
const team = [{ species: "Pidgeot" }, { species: "Snorlax" }] as any;

async function play(lines: string[]) {
  const { scene, calls } = recorder();
  const d = new BattleDirector(scene, {} as any, [{ trainerName: "A", trainerSprite: null, team }, { trainerName: "B", trainerSprite: null, team }], async () => "", () => false);
  await d.playLines(lines);
  return calls;
}

describe("two-turn moves", () => {
  for (const [move, line, how] of [
    ["Fly", "하늘 높이 날아올랐다!", "up"],
    ["Dig", "땅으로 파고들었다!", "down"],
    ["Dive", "물속으로 숨었다!", "down"],
  ] as const) {
    it(`${move}: its own line, out of sight, back for the attack`, async () => {
      const calls = await play([`|move|p1a: m0|${move}||[still]`, `|-prepare|p1a: m0|${move}`, `|move|p1a: m0|${move}|p2a: m0|[from] lockedmove`]);
      const says = calls.filter(c => c[0] === "say").map(c => c[1][0] as string);
      expect(says.some(t => t.endsWith(line))).toBe(true);
      expect(says.some(t => t.includes("힘을 모으고"))).toBe(false);
      const vanish = calls.findIndex(c => c[0] === "vanish");
      const back = calls.findIndex((c, i) => c[0] === "reappear" && i > vanish);
      expect(calls[vanish][1]).toEqual([0, how]);
      expect(back).toBeGreaterThan(vanish);
    });
  }
});
