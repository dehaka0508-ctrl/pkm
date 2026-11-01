import { it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { allLearnableMoves } from "../src/game/moves";
import { simulateMatch } from "../src/battle/engine";
import { sideFor } from "../src/game/season";

it("custom start builds the chosen team", () => {
  const slot = allTrainers().find(t => t.region === "johto" && t.role === "트레이너")!;
  const ivs = { hp: 31, atk: 31, def: 31, spa: 0, spd: 31, spe: 31 };
  const team = [
    { species: "Garchomp", level: 62, ivs, nature: "Jolly", ability: "Rough Skin", moves: ["earthquake", "dragonclaw", "swordsdance", "stoneedge"] },
    { species: "Rotom-Wash", level: 40, ivs, nature: "Bold", ability: "Levitate", moves: ["hydropump", "voltswitch"] },
    { species: "Ninetales-Alola", level: 5, ivs, nature: "Timid", ability: "Snow Warning", moves: ["auroraveil", "blizzard"] },
  ];
  expect(allLearnableMoves("Ninetales-Alola")).toContain("auroraveil");
  const st = createGame({ mode: "custom", slotId: slot.id, name: "커스텀", customTeam: team });
  expect(st.player.squad.map(m => [m.species, m.level, m.ability])).toEqual([
    ["Garchomp", 62, "Rough Skin"],
    ["Rotom-Wash", 40, "Levitate"],
    ["Ninetales-Alola", 5, "Snow Warning"],
  ]);
  expect(st.player.squad[0].ivs.spa).toBe(0);
  expect(st.player.squad[1].known).toEqual(["hydropump", "voltswitch"]);
  expect(st.player.entry.length).toBe(3);
  const opp = st.leagues.johto.teams.find(id => id !== slot.id)!;
  const r = simulateMatch(sideFor(st, slot.id), sideFor(st, opp), "c");
  expect([0, 1, -1]).toContain(r.winner);
});
