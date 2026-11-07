import { beforeEach, describe, expect, it } from "vitest";
import { createGame, deleteSave, getActiveSlot, loadGame, MAX_SLOTS, parseSave, saveGame, saveText, setActiveSlot, slotSummary } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";

// localStorage stand-in (vitest runs in node here); setItem can be told to refuse big values
class MemStorage {
  data = new Map<string, string>();
  limit = Infinity;
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (v.length > this.limit) throw new Error("QuotaExceededError");
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const game = (name: string) => createGame({ mode: "trainer", slotId: allTrainers()[0].id, name });

describe("save slots", () => {
  let mem: MemStorage;
  beforeEach(() => {
    mem = new MemStorage();
    (globalThis as any).localStorage = mem;
    setActiveSlot(1);
  });

  it("slot 1 is the original key, so older saves and the web save open as slot 1", () => {
    saveGame(game("하나"));
    expect(mem.getItem("pl:save")).toBeTruthy();
    expect(loadGame(1)?.player.name).toBe("하나");
  });

  it("each slot keeps its own game", () => {
    for (let s = 1; s <= MAX_SLOTS; s++) {
      setActiveSlot(s);
      saveGame(game(`슬롯${s}`));
    }
    expect([1, 2, 3].map(s => slotSummary(s)?.name)).toEqual(["슬롯1", "슬롯2", "슬롯3"]);
    setActiveSlot(2);
    deleteSave();
    expect(slotSummary(2)).toBeNull();
    expect(loadGame(3)?.player.name).toBe("슬롯3");
    expect(getActiveSlot()).toBe(2);
  });

  it("a save that does not fit is stored compressed and still loads", () => {
    const g = game("압축");
    mem.limit = 200_000; // plain JSON is bigger than this
    saveGame(g);
    const raw = mem.getItem("pl:save")!;
    expect(raw.startsWith("z:")).toBe(true);
    expect(loadGame()?.player.name).toBe("압축");
    expect(slotSummary(1)?.name).toBe("압축");
  });

  it("save files: the web and app read each other's files", () => {
    const g = game("파일");
    const text = saveText(g);
    expect(parseSave(text)?.player.name).toBe("파일");
    expect(parseSave("﻿" + text)?.player.name).toBe("파일"); // saved with a byte-order mark
    expect(parseSave('{"version":1,"player":{}}')).toBeNull();
    expect(parseSave("not json")).toBeNull();
  });
});
