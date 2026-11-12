import { describe, expect, it } from "vitest";
import { createGame, entryTeam, migrate } from "../src/game/state";
import { awardTicket, ticketsOf, useTicket } from "../src/game/legend";
import { pendingCompetition, registerTeam } from "../src/game/registration";
import { playerCupTeam, sideFor, advance } from "../src/game/season";
import { swapPlaces } from "../src/game/entry";
import { eventsOn, seasonEvents } from "../src/game/calendar";
import { newTie } from "../src/game/tie";

function game() {
  const st = createGame({ mode: "trainer", slotId: "kanto-그린", name: "PSB" });
  st.player.squad = st.player.squad.slice(0, 6);
  st.player.entry = st.player.squad.map(m => m.uid);
  expect(registerTeam(st, "cup", st.player.entry)).toBeNull();
  awardTicket(st, "both", "kanto", "관동 리그");
  const ticket = ticketsOf(st)[0];
  expect(useTicket(st, ticket.id, ticket.choices[0])).toBeNull();
  const legend = st.player.squad.at(-1)!;
  st.pending = { comp: "tie", label: "PSB 결승 (더블배틀)", opponent: "kanto-레드", home: true, games: [], doubles: true, tie: { kind: "psb", key: "final", leg: 0 } };
  return { st, legend };
}

describe("PSB current entry", () => {
  it("allows a league trophy recruit outside the locked cup roster in preview and battle", () => {
    const { st, legend } = game();
    expect(swapPlaces(st, { kind: "entry", i: 0 }, { kind: "bench", uid: legend.uid })).toBeNull();
    expect(pendingCompetition(st.pending)).toBeNull();
    expect(entryTeam(st).map(m => m.uid)).toEqual(st.player.entry);
    expect(st.player.registrations!.cup!.uids).not.toContain(legend.uid);
    st.pending!.reg = [0, 1, 2, 3];
    expect(playerCupTeam(st).team[0].uid).toBe(legend.uid);
    expect(sideFor(st, st.player.slotId, true).team[0].uid).toBe(legend.uid);
    const loaded = migrate(JSON.parse(JSON.stringify(st)));
    expect(entryTeam(loaded)[0].uid).toBe(legend.uid);
    expect(playerCupTeam(loaded).team[0].uid).toBe(legend.uid);
    // The regional cup still uses its season roster.
    st.pending!.tie = { kind: "cup", region: "kanto", key: "F", leg: 0 };
    expect(entryTeam(st).some(m => m.uid === legend.uid)).toBe(false);
  });

  it("does not ask for a cup roster when resuming a PSB match", async () => {
    const { st } = game();
    delete st.player.registrations;
    st.day = seasonEvents(st.season).find(e => e.kind === "psb" && e.round === 3)!.day;
    st.dayStep = eventsOn(st.day).findIndex(e => e.kind === "psb");
    st.psb = { season: st.season, champs: { east: [st.player.slotId], west: [st.pending!.opponent] }, ties: { final: newTie(st.player.slotId, st.pending!.opponent, "single") } };
    expect((await advance(st, async () => { throw new Error("unexpected simulation"); })).type).toBe("match");
    expect(st.registrationDue).toBeUndefined();
  });

  it("clears match registration after a squad swap, then uses the newly selected members", () => {
    const { st, legend } = game();
    st.pending!.reg = [0, 1, 2, 3];
    swapPlaces(st, { kind: "entry", i: 0 }, { kind: "bench", uid: legend.uid });
    expect(st.pending!.reg).toBeUndefined();
    st.pending!.reg = [0, 2, 3, 4];
    expect(playerCupTeam(st).team.map(m => m.uid)).toEqual([0, 2, 3, 4].map(i => st.player.entry[i]));
    swapPlaces(st, { kind: "entry", i: 0 }, { kind: "entry", i: 2 });
    expect(st.pending!.reg).toBeUndefined();
  });
});
