import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { swapPlaces } from "../src/game/entry";

function game() {
  const t = allTrainers().find(x => x.role === "관장")!;
  const st = createGame({ mode: "trainer", slotId: t.id, name: "t" });
  const p = st.player;
  // 6 in the entry plus 2 in reserve
  while (p.squad.length < 8) p.squad.push({ ...p.squad[0], uid: `x${p.squad.length}` });
  p.entry = p.squad.slice(0, 6).map(m => m.uid);
  return st;
}

describe("squad swap", () => {
  it("swaps two entry places", () => {
    const st = game();
    const [a, , c] = st.player.entry;
    expect(swapPlaces(st, { kind: "entry", i: 0 }, { kind: "entry", i: 2 })).toBeNull();
    expect(st.player.entry[0]).toBe(c);
    expect(st.player.entry[2]).toBe(a);
  });
  it("entry ↔ reserve trades places", () => {
    const st = game();
    const out = st.player.entry[1];
    const inn = st.player.squad[7].uid;
    swapPlaces(st, { kind: "entry", i: 1 }, { kind: "bench", uid: inn });
    expect(st.player.entry[1]).toBe(inn);
    expect(st.player.entry).not.toContain(out);
    expect(st.player.entry.length).toBe(6);
    // reserve → entry the other way round
    swapPlaces(st, { kind: "bench", uid: out }, { kind: "entry", i: 1 });
    expect(st.player.entry[1]).toBe(out);
  });
  it("keeps the entry between 4 and 6", () => {
    const st = game();
    swapPlaces(st, { kind: "entry", i: 5 }, { kind: "out" });
    swapPlaces(st, { kind: "entry", i: 4 }, { kind: "out" });
    expect(st.player.entry.length).toBe(4);
    expect(swapPlaces(st, { kind: "entry", i: 0 }, { kind: "out" })).toMatch(/최소 4/);
    expect(st.player.entry.length).toBe(4);
    // a reserve Pokémon fills an empty entry place
    const r = st.player.squad.find(m => !st.player.entry.includes(m.uid))!.uid;
    swapPlaces(st, { kind: "bench", uid: r }, { kind: "entry", i: 5 });
    expect(st.player.entry).toContain(r);
    expect(st.player.entry.length).toBe(5);
    expect(new Set(st.player.entry).size).toBe(5);
  });
});
