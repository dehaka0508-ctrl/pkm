import { it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { advanceWithRegistration as advance } from "./registered-advance";
import { recordPlayerGame, type Simulator } from "../src/game/season";
import { allTrainers } from "../src/game/lineups";
import { Rng } from "../src/game/rng";
import { leagueRoundDay } from "../src/game/calendar";

const OPEN = leagueRoundDay(1, 0);

const fake = (seed: string) => {
  const r = new Rng(seed);
  const w = r.chance(0.5) ? 0 : 1;
  const rem = [0, 0];
  rem[w] = r.int(1, 3);
  return { winner: w, remaining: rem, picks: [[0, 1, 2], [0, 1, 2]], kos: [[0, 0, 0], [0, 0, 0]] } as any;
};
const sim: Simulator = async jobs => jobs.map(j => fake(j.seed));

it("old save with a removed trainer (클라벨) keeps running after migration", async () => {
  const t = allTrainers().find(x => x.name === "레드")!;
  const st = createGame({ mode: "trainer", slotId: t.id, name: "레드" });
  // make it look like a save from before 클라벨 → 카지
  const old = JSON.parse(JSON.stringify(st).split('"paldea-카지"').join('"paldea-클라벨"'));
  await expect(
    (async () => {
      for (let i = 0; i < 200 && old.day <= OPEN; i++) {
        const r = await advance(old, sim);
        if (r.type === "match") recordPlayerGame(old, fake("o" + i));
      }
    })(),
  ).rejects.toThrow(/unknown trainer id: paldea-클라벨/);
  const fixed = migrate(JSON.parse(JSON.stringify(st).split('"paldea-카지"').join('"paldea-클라벨"')));
  expect(JSON.stringify(fixed)).not.toContain("클라벨");
  for (let i = 0; i < 300 && fixed.day < OPEN + 22; i++) {
    const r = await advance(fixed, sim);
    if (r.type === "match") recordPlayerGame(fixed, fake("f" + i));
  }
  expect(fixed.day).toBeGreaterThanOrEqual(OPEN + 22);
  expect(fixed.leagues.paldea.table["paldea-카지"].p).toBeGreaterThan(0);
});
