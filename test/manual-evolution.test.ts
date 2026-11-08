// Level evolutions wait for the manager; the day summary says once (bold in the UI) when one is possible.
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { gainExp, expForLevel, evolve } from "../src/game/training";
import { EVO_NOTICE, evolutionNotices } from "../src/game/season";
import { dex } from "../src/data/dex";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });

describe("manual evolution", () => {
  it("levelling past the evolution level keeps the species; the notice comes once", () => {
    const st = game();
    const m = st.player.squad[0];
    m.species = "Bulbasaur";
    m.noEvolve = false;
    m.level = 15;
    m.exp = expForLevel(15);
    const logs: string[] = [];
    gainExp(m, expForLevel(17) - m.exp, logs);
    expect(m.level).toBe(17);
    expect(dex.species.get(m.species).id).toBe("bulbasaur");
    const day: string[] = ["다른 일"];
    evolutionNotices(st, day);
    expect(day[0].startsWith(EVO_NOTICE)).toBe(true);
    expect(day[0]).toContain("이상해풀");
    expect(st.inbox.some(x => x.body?.includes("[진화]") || (x as any).text?.includes("[진화]"))).toBe(true);
    const again: string[] = [];
    evolutionNotices(st, again);
    expect(again.length).toBe(0);
    evolve(m, "ivysaur");
    expect(dex.species.get(m.species).id).toBe("ivysaur");
  });
});
