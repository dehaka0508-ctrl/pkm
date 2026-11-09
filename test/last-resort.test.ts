// 비장의무기 (Last Resort) and other moves that can only fail: the battle AI never picks them while they would
// fail, and the NPCs' match preparation never builds them into a set (Snorlax learns it at Lv.1).
import { describe, it, expect } from "vitest";
import { BattleSession } from "../src/battle/engine";
import { createGame, teamOf } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { npcTeam } from "../src/game/npc";
import { prepareFor } from "../src/game/ai/prep";
import type { TeamMember } from "../src/game/types";

const mon = (species: string, moves: string[], uid: string): TeamMember => ({
  uid, species, level: 50, ability: "Thick Fat", item: "", nature: "Adamant", moves,
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, gender: "M", teraType: null,
});

describe("moves that would fail", () => {
  it("Snorlax never wastes a turn on Last Resort", () => {
    let lr = 0;
    let failed = 0;
    for (let b = 0; b < 8; b++) {
      const team = (k: string) => [mon("Snorlax", ["lastresort", "bodyslam", "crunch", "highhorsepower"], `${k}0`), mon("Blissey", ["seismictoss", "softboiled", "toxic", "protect"], `${k}1`), mon("Garchomp", ["earthquake", "dragonclaw", "stoneedge", "swordsdance"], `${k}2`)];
      const s = new BattleSession({ name: "A", team: team("a"), gimmick: null, skill: 1 }, { name: "B", team: team("b"), gimmick: null, skill: 1 }, `lr${b}`);
      s.start();
      s.runToEnd();
      const log: string[] = s.battle.log;
      log.forEach((l, i) => {
        if (!/\|move\|[^|]+\|Last Resort\|/.test(l)) return;
        lr++;
        if (/\|-fail\|/.test(log[i + 1] || "")) failed++;
      });
    }
    expect(failed).toBe(0);
    console.log({ lastResortUsed: lr });
  });

  it("match preparation never builds Last Resort into a set", () => {
    const owners = allTrainers().filter(t => t.team.some(m => m?.species === "Snorlax"));
    const me = allTrainers().find(t => !owners.includes(t))!;
    const st = createGame({ mode: "trainer", slotId: me.id, name: "나" });
    for (const t of owners) {
      // an older preparation saved it into the set
      const key = String(t.team.findIndex(m => m?.species === "Snorlax"));
      ((st as any).npcs[t.id].care ||= {})[key] = { moves: ["lastresort", "bodyslam", "crunch", "earthquake"] };
      prepareFor(st, t.id, me.id, teamOf(st, me.id));
      const snorlax = npcTeam(st, t.id).find(m => m.species === "Snorlax");
      if (snorlax) expect(snorlax.moves).not.toContain("lastresort");
    }
  });
});
