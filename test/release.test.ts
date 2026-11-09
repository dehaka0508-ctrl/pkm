// 놓아주기: any time in the season, as long as every roster the Pokémon is on keeps the registration rules.
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { dropFromRegistrations, releaseProblem } from "../src/game/registration";

describe("letting a Pokémon go", () => {
  it("is allowed while each roster stays legal, and takes it off the rosters", () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.team.length >= 6)!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    const p = st.player;
    // all six count as homegrown (the trainer's own six): a roster of 6 may lose one, a roster of 3 may not
    p.registrations = {
      league: { season: st.season, uids: p.squad.slice(0, 6).map(m => m.uid) },
      cup: { season: st.season, uids: p.squad.slice(0, 4).map(m => m.uid) },
    };
    const last = p.squad[5].uid;
    expect(releaseProblem(st, last)).toBeNull();
    dropFromRegistrations(st, last);
    expect(p.registrations.league!.uids).not.toContain(last);
    // the cup needs four: one of its four can't go
    expect(releaseProblem(st, p.squad[0].uid)).toMatch(/지방 컵 등록 명단/);
    // and the squad never drops below four
    p.squad = p.squad.slice(0, 4);
    p.registrations = {};
    expect(releaseProblem(st, p.squad[0].uid)).toMatch(/최소 4마리/);
  });
});
