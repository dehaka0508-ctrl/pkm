// Every 5th loss in a row costs 2 fame — only 1 while the club is ranked above its expected league finish.
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { onGameResult, npcResult } from "../src/game/fans";
import { aboveExpectation, expectedRanks } from "../src/game/npc";

const weakClub = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "트레이너")!.id, name: "검증" });

describe("losing-run fame", () => {
  it("player: −2 on the 5th loss, −1 when above expectation", () => {
    for (const above of [false, true]) {
      const st = weakClub();
      st.player.reputation = 50;
      for (let i = 0; i < 5; i++) onGameResult(st, 1, true, () => above);
      expect(st.player.reputation).toBe(above ? 49 : 48);
      expect(st.player.fameLog?.[0].text).toBe(above ? "5연패 (순위는 기대 이상)" : "5연패");
    }
  });
  it("NPC clubs follow the same rule", () => {
    for (const above of [false, true]) {
      const n = { reputation: 50 };
      for (let i = 0; i < 5; i++) npcResult(n, 1, () => above);
      expect(n.reputation).toBe(above ? 49 : 48);
    }
  });
  it("above expectation = ranked higher in the league table than the expected finish, once games are played", () => {
    const st = weakClub();
    const me = st.player.slotId;
    const lg = st.leagues[st.player.region];
    const expected = expectedRanks(st, st.player.region)[me];
    expect(expected).toBeGreaterThan(1);
    expect(aboveExpectation(st, me)).toBe(false); // no league game yet
    const row = (id: string, pts: number) => ({ id, p: 5, w: pts / 3, d: 0, l: 5 - pts / 3, pts, diff: 0, gf: 0, form: [] });
    for (const id of lg.teams) lg.table[id] = row(id, 3);
    lg.table[me] = row(me, 15); // top of the table
    expect(aboveExpectation(st, me)).toBe(true);
    lg.table[me] = row(me, 0); // bottom
    expect(aboveExpectation(st, me)).toBe(false);
  });
});
