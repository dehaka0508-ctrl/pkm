import { describe, expect, it } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { dex, koAbility, koMove } from "../src/data/dex";
import { createGame, migrate } from "../src/game/state";
import { itemWishes, npcOf, npcTeam, ROLE_START_ITEMS, startingTera, slotMarks } from "../src/game/npc";
import { simulateMatch } from "../src/battle/engine";
import references from "./fixtures/paldea-gym-images.json";
import rankings from "../src/data/npc-items.json";

const expected = references as Record<string, [string, string, string, string[], string?][]>;
const names = Object.keys(expected);
const trainer = (name: string) => allTrainers().find(t => t.id === "paldea-" + name)!;
const game = () => createGame({ mode: "trainer", slotId: "kanto-레드", name: "검증" });

describe("Paldea gym image lineups", () => {
  it.each(names)("matches %s's pictured species, forms, genders, abilities, moves and Tera type", name => {
    const team = resolveTeam(trainer(name));
    expect(team.map(m => [m.species, m.gender, koAbility(m.ability), m.moves.map(koMove), m.teraType])).toEqual(expected[name].map(([s, g, a, m, tera]) => [s, g, a, m, tera || null]));
    for (const m of team) {
      expect(m.placeholder || m.autoMoves).toBe(false);
      expect(m.moves).toHaveLength(4);
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      expect(m.moves.every(x => dex.moves.get(x).exists)).toBe(true);
    }
  });
  it.each(names)("uses refreshed AI item rankings and the existing budget for %s", name => {
    const t = trainer(name), team = resolveTeam(t);
    expect(t.team.every(m => m?.item === null && m.nature === null)).toBe(true);
    team.forEach((m, i) => {
      const pre = (rankings as Record<string, { sp: string; items: string[] }>)[`${t.id}#${i}`];
      expect(pre.sp).toBe(dex.species.get(m.species).id);
      expect(pre.items.length).toBeGreaterThan(0);
      expect(itemWishes(t, String(i), m).slice(0, pre.items.length)).toEqual(pre.items);
    });
    expect(npcTeam(game(), t.id).filter(m => m.item)).toHaveLength(ROLE_START_ITEMS[t.role] - (startingTera(t) ? 1 : 0));
  });
  it.each(names)("updates %s's legacy NPC saves once, preserving subsequent training", name => {
    const t = trainer(name);
    for (const legacy of ["missing", "species"]) {
      const st = game(), n = npcOf(st, t.id);
      if (legacy === "missing") delete n.slots;
      else n.slots = resolveTeam(t).map(m => m.species);
      n.care = { "0": { moves: ["Protect"] } };
      const fresh = migrate(JSON.parse(JSON.stringify(st)));
      expect(npcOf(fresh, t.id).care?.["0"]).toBeUndefined();
      expect(npcOf(fresh, t.id).slots).toEqual(slotMarks(t));
      expect(npcTeam(fresh, t.id).map(m => m.moves)).toEqual(resolveTeam(t).map(m => m.moves));
      npcOf(fresh, t.id).care = { "0": { evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } } };
      expect(npcOf(migrate(JSON.parse(JSON.stringify(fresh))), t.id).care?.["0"]?.evs?.hp).toBe(252);
    }
  });
  it.each(names)("runs all six %s slots in singles and doubles", name => {
    const t = trainer(name), foe = trainer(names[(names.indexOf(name) + 1) % names.length]);
    for (const doubles of [false, true]) for (const second of [false, true]) {
      const picks = doubles ? (second ? [3, 4, 5, 0] : [0, 1, 2, 3]) : (second ? [3, 4, 5] : [0, 1, 2]);
      const result = simulateMatch({ name, team: resolveTeam(t), gimmick: t.gimmick, skill: 0.85, picks },
        { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: 0.85, picks }, `paldea-gyms-${name}-${doubles}-${second}`, { doubles });
      expect(result.picks).toEqual([picks, picks]);
      expect(result.turns).toBeGreaterThan(0);
    }
  });
});
