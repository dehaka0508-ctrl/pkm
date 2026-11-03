import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { advance, recordPlayerGame, type Simulator } from "../src/game/season";
import { allTrainers } from "../src/game/lineups";
import { declineAllOffers, offersLapsingToday, sponsorOf } from "../src/game/sponsor";

const sim: Simulator = async jobs => jobs.map(() => ({ winner: 0, remaining: [1, 0], picks: [[0, 1, 2], [0, 1, 2]], kos: [[0, 0, 0], [0, 0, 0]], turns: 10, log: [] }) as any);

describe("sponsor offers lapsing", () => {
  it("advancing stops on the last offer day, so the game can ask before going on without a sponsor", async () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.name === "그린")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    const step = async () => {
      const r = await advance(st, sim, undefined, { toMyNext: true });
      if (r.type === "match") recordPlayerGame(st, (await sim([{ seed: "p" } as any]))[0]);
    };
    for (let i = 0; i < 60 && !sponsorOf(st).offers.length; i++) await step();
    const sp = sponsorOf(st);
    expect(sp.offers.length).toBeGreaterThan(0);
    // "to my next match" must not skip past the deadline
    for (let i = 0; i < 60 && !offersLapsingToday(st) && st.day <= sp.offersUntil; i++) await step();
    expect(offersLapsingToday(st)).toBe(true);
    expect(st.day).toBe(sp.offersUntil);
    declineAllOffers(st);
    expect(offersLapsingToday(st)).toBe(false);
    expect(st.inbox.some(m => m.title === "스폰서 없이 시즌 진행")).toBe(true);
  });
});
