import { describe, expect, it } from "vitest";
import { TeamValidator } from "@pkmn/sim";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { createGame, migrate } from "../src/game/state";
import { itemWishes, npcOf, npcTeam, ROLE_START_ITEMS, slotMarks } from "../src/game/npc";
import { simulateMatch, toShowdownSet } from "../src/battle/engine";
import { dex } from "../src/data/dex";
import rankings from "../src/data/npc-items.json";

const trainer = (name: string) => allTrainers().find(t => t.id === "paldea-" + name)!;
const species: Record<string, string[]> = {
  "보민": ["Skeledirge", "Cyclizar", "Dondozo", "Sinistcha", "Tinkaton", "Garganacl"],
  "푸름": ["Meowscarada", "Cyclizar", "Palafin", "Armarouge", "Gholdengo", "Clodsire"],
};
const game = () => createGame({ mode: "trainer", slotId: "kanto-레드", name: "검증" });

describe("Paldea protagonist competitive lineups", () => {
  it.each(["보민", "푸름"])("gives %s the requested order and legal, explicit SV singles sets", name => {
    const t = trainer(name), team = resolveTeam(t);
    expect(team.map(m => m.species)).toEqual(species[name]);
    const validator = new TeamValidator("gen9anythinggoes");
    for (const [i, m] of team.entries()) {
      expect(m.placeholder || m.autoMoves).toBe(false);
      expect(m.moves).toHaveLength(4);
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      // Check obtainable move/ability combinations before the league's Lv50 scaling and EV training.
      const set = toShowdownSet(m, i);
      set.level = 100;
      set.evs = { ...set.evs, hp: 1 };
      expect(validator.validateSet(set, {})).toBeNull();
    }
  });
  it.each(["보민", "푸름"])("uses refreshed built-in item rankings and the existing budget for %s", name => {
    const t = trainer(name), team = resolveTeam(t), st = game();
    expect(t.team.every(m => m?.item === null)).toBe(true);
    team.forEach((m, i) => {
      const pre = (rankings as Record<string, { sp: string; items: string[] }>)[`${t.id}#${i}`];
      expect(pre.sp).toBe(dex.species.get(m.species).id);
      expect(pre.items.length).toBeGreaterThan(0);
      expect(itemWishes(t, String(i), m).slice(0, pre.items.length)).toEqual(pre.items);
    });
    expect(npcTeam(st, t.id).filter(m => m.item)).toHaveLength(ROLE_START_ITEMS[t.role]);
  });
  it.each(["보민", "푸름"])("refreshes %s in old saves once and preserves subsequent training", name => {
    const id = trainer(name).id;
    for (const legacy of ["missing", "species"]) {
      const st = game(), n = npcOf(st, id);
      if (legacy === "missing") delete n.slots;
      else n.slots = resolveTeam(trainer(name)).map(m => m.species);
      n.care = { "0": { moves: ["Protect"] } };
      const fresh = migrate(JSON.parse(JSON.stringify(st)));
      expect(npcOf(fresh, id).care?.["0"]).toBeUndefined();
      expect(npcOf(fresh, id).slots).toEqual(slotMarks(trainer(name)));
      expect(npcTeam(fresh, id).map(m => m.moves)).toEqual(resolveTeam(trainer(name)).map(m => m.moves));
      npcOf(fresh, id).care = { "0": { evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } } };
      expect(npcOf(migrate(JSON.parse(JSON.stringify(fresh))), id).care?.["0"]?.evs?.hp).toBe(252);
    }
  });
  it("can field every new slot in both singles and doubles", () => {
    const a = trainer("보민"), b = trainer("푸름");
    for (const doubles of [false, true]) for (const second of [false, true]) {
      const picks = doubles ? (second ? [3, 4, 5, 0] : [0, 1, 2, 3]) : (second ? [3, 4, 5] : [0, 1, 2]);
      const result = simulateMatch(
        { name: a.name, team: resolveTeam(a), gimmick: a.gimmick, skill: 0.85, picks },
        { name: b.name, team: resolveTeam(b), gimmick: b.gimmick, skill: 0.85, picks },
        `paldea-protagonists-${doubles}-${second}`, { doubles });
      expect(result.picks).toEqual([picks, picks]);
      expect(result.turns).toBeGreaterThan(0);
      expect([-1, 0, 1]).toContain(result.winner);
    }
  });
});
