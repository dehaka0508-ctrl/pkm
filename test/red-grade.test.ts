import { it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam, trainerIv } from "../src/game/lineups";
import { npcOf } from "../src/game/npc";

it("레드: protagonist with a champion's IVs and fame", () => {
  const red = allTrainers().find(t => t.name === "레드")!;
  expect(red.role).toBe("주인공");
  expect(trainerIv(red)).toBe(31);
  expect(resolveTeam(red).every(m => Object.values(m.ivs).every(v => v === 31))).toBe(true);
  const g = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "나" });
  expect(npcOf(g, red.id).reputation).toBe(80);
  const asRed = createGame({ mode: "trainer", slotId: red.id, name: "레드" });
  expect(asRed.player.reputation).toBe(80);
  // older save: Red's fame raised once
  const old = JSON.parse(JSON.stringify(g));
  delete old.fameSet;
  old.npcs[red.id].reputation = 45;
  expect(npcOf(migrate(old), red.id).reputation).toBe(80);
});
