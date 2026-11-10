import { dex } from "../src/data/dex";
// A title brings an NPC club the player's legendary prize; older saves give up recruits made before.
import { expect, it } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { npcOf, npcRecruit, npcRoster } from "../src/game/npc";

it("a PWT title brings a legendary (no mythical, no bottle cap); an older save's recruits leave on load", () => {
  const st = createGame({ mode: "trainer", slotId: allTrainers()[0].id, name: "x" });
  const id = st.leagues.kanto.teams.find(t => t !== st.player.slotId)!;
  const bag = { ...(npcOf(st, id).bag || {}) };
  npcRecruit(st, id, "all", "PWT", "legend");
  const got = npcOf(st, id).legends;
  expect(got.length).toBe(1);
  expect(got[0].until).toBe(st.season + 3);
  expect(dex.species.get(got[0].mon.species).tags).not.toContain("Mythical");
  expect(npcOf(st, id).bag || {}).toEqual(bag);
  npcOf(st, id).legends = [];
  // an older save: a scouted Pokémon and a legendary recruit, both holding items
  const n = npcOf(st, id);
  const six = npcRoster(st, id).map(c => c.mon);
  n.roster = [{ key: "S1", mon: { ...six[0], uid: "s1" } } as any];
  n.legends = [{ mon: { ...six[1], uid: "l0" }, until: st.season + 2, comp: "PWT" }];
  n.items.S1 = "Leftovers";
  n.items.L0 = "Choice Band";
  delete (st as any).npcFixedLineups;
  const old = migrate(JSON.parse(JSON.stringify(st)));
  const m = npcOf(old, id);
  expect(m.roster).toEqual([]);
  expect(m.legends).toEqual([]);
  expect(m.items.S1).toBeUndefined();
  expect(m.items.L0).toBeUndefined();
  expect(npcRoster(old, id).length).toBe(6);
});
