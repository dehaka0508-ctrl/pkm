import { describe, expect, it, vi } from "vitest";
import { createGame, entryTeam, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { avoidLineupIndices, leagueLineupRun, leagueLineupToAvoid, previewLeagueLineup, recordLeagueLineup } from "../src/game/rotation";
import { recordPlayerGame, sideFor, advance, endDay, type Simulator } from "../src/game/season";
import { registerTeam, suggestedRegistration } from "../src/game/registration";
import { npcOf } from "../src/game/npc";
import { pickThree } from "../src/battle/ai";
import { BattleSession } from "../src/battle/engine";
import { Rng } from "../src/game/rng";
import { dayOf, leagueRoundDay } from "../src/game/calendar";
import { recordsOf } from "../src/game/stats";

// Keep the nine-round wiring check focused on matches, not the independent weekly shopping optimizer.
vi.mock("../src/game/ai/controller", () => ({ npcAiWeek: vi.fn() }));
const game = () => {
  const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "로테이션" });
  st.registrationDue = "league";
  expect(registerTeam(st, "league", suggestedRegistration(st, "league"))).toBeNull();
  st.player.money = 1e8;
  return st;
};
const fake = (picks = [0, 1, 2]) => ({ winner: 0 as const, remaining: [3, 0] as [number, number], turns: 1, picks: [picks, [0, 1, 2]] as [number[], number[]], kos: [{}, {}] as [Record<number, number>, Record<number, number>] });
const opponentOf = (st: ReturnType<typeof game>) => allTrainers().find(t => t.region === "kanto" && t.id !== st.player.slotId)!;

describe("league lineup sequence", () => {
  it("charges 0,0,0,0,1,2,3,4,5 even when pick order changes; total through game nine is 15", () => {
    const st = game(), id = st.player.slotId;
    const penalties = Array.from({ length: 9 }, (_, i) => recordLeagueLineup(st, id, i % 2 ? ["c", "a", "b"] : ["a", "b", "c"]).penalty);
    expect(penalties).toEqual([0, 0, 0, 0, 1, 2, 3, 4, 5]);
    expect(penalties.reduce((a, b) => a + b)).toBe(15);
  });
  it("starts a new run at one after changing a single Pokémon", () => {
    const st = game(), id = st.player.slotId;
    for (let i = 0; i < 7; i++) recordLeagueLineup(st, id, ["a", "b", "c"]);
    expect(recordLeagueLineup(st, id, ["a", "b", "d"])).toEqual({ streak: 1, penalty: 0 });
    expect(recordLeagueLineup(st, id, ["a", "b", "c"])).toEqual({ streak: 1, penalty: 0 });
  });
  it("previews do not advance the run and clubs do not share histories", () => {
    const st = game(), id = st.player.slotId, other = opponentOf(st).id;
    for (let i = 0; i < 4; i++) recordLeagueLineup(st, id, ["a", "b", "c"]);
    for (let i = 0; i < 10; i++) expect(previewLeagueLineup(st, id, ["c", "a", "b"])).toEqual({ streak: 5, penalty: 1 });
    expect(leagueLineupRun(st, id)!.streak).toBe(4);
    expect(previewLeagueLineup(st, other, ["a", "b", "c"])).toEqual({ streak: 1, penalty: 0 });
  });
  it("survives save migration, treats old saves as fresh, and resets on a new season", () => {
    const st = game(), id = st.player.slotId;
    expect(leagueLineupToAvoid(st, id)).toBeUndefined();
    for (let i = 0; i < 4; i++) recordLeagueLineup(st, id, ["a", "b", "c"]);
    const restored = migrate(JSON.parse(JSON.stringify(st)));
    expect(previewLeagueLineup(restored, id, ["c", "b", "a"]).penalty).toBe(1);
    restored.season++;
    expect(leagueLineupToAvoid(restored, id)).toBeUndefined();
    expect(recordLeagueLineup(restored, id, ["a", "b", "c"]).streak).toBe(1);
  });
  it("empty or incomplete selections break the run without inventing a penalty", () => {
    const st = game(), id = st.player.slotId;
    for (const invalid of [[], ["a", "b"], ["a", "a", "b"]]) {
      for (let i = 0; i < 4; i++) recordLeagueLineup(st, id, ["a", "b", "c"]);
      expect(recordLeagueLineup(st, id, invalid)).toEqual({ streak: 0, penalty: 0 });
      expect(leagueLineupRun(st, id)).toBeUndefined();
    }
  });
  it("clears every club's lineup history on the actual season rollover", () => {
    const st = game();
    recordLeagueLineup(st, st.player.slotId, ["a", "b", "c"]);
    recordLeagueLineup(st, opponentOf(st).id, ["d", "e", "f"]);
    st.day = dayOf(st.season, 7, 31); endDay(st, []);
    expect(st.season).toBe(2); expect(st.leagueLineups).toEqual({});
  });
});

describe("fan satisfaction settlement", () => {
  it("deducts exactly 15 for both player and opponent, including selected reserves, and records the reason", () => {
    const st = game(), opp = opponentOf(st);
    st.player.satisfaction = 80; npcOf(st, opp.id).sat = 80;
    for (let i = 0; i < 9; i++) {
      st.pending = { comp: "fx", label: "관동 리그", opponent: opp.id, home: true, games: [] };
      recordPlayerGame(st, fake(i % 2 ? [2, 0, 1] : [0, 1, 2]));
    }
    expect(st.player.satisfaction).toBe(65); expect(npcOf(st, opp.id).sat).toBe(65);
    expect(st.player.satLog!.map(l => l.d)).toEqual([-5, -4, -3, -2, -1]);
    expect(st.inbox.some(m => m.title.includes("팬 만족도 −5"))).toBe(true);
    expect(npcOf(st, opp.id).log.filter(l => l.text.includes("동일 선발"))).toHaveLength(5);
  });
  it("does not double-count a result that has already been recorded", () => {
    const st = game(), opp = opponentOf(st);
    st.pending = { comp: "fx", label: "관동 리그", opponent: opp.id, home: true, games: [] };
    recordPlayerGame(st, fake()); recordPlayerGame(st, fake());
    expect(leagueLineupRun(st, st.player.slotId)!.streak).toBe(1); expect(st.pending.games).toHaveLength(1);
  });
  it("continental and friendly games neither increment nor reset the league run", () => {
    const st = game(), id = st.player.slotId, opp = opponentOf(st);
    for (let i = 0; i < 4; i++) recordLeagueLineup(st, id, st.player.entry.slice(0, 3));
    for (const label of ["PWT 조별리그", "PCT 조별리그", "친선경기"]) {
      st.pending = { comp: "fx", label, opponent: opp.id, home: true, games: [], ...(label === "친선경기" ? { friendly: "test" } : {}) };
      recordPlayerGame(st, fake());
      expect(leagueLineupRun(st, id)!.streak).toBe(4);
    }
    expect(st.player.satLog ?? []).toHaveLength(0);
  });
  it("clamps satisfaction at zero without clamping the recorded penalty", () => {
    const st = game(), id = st.player.slotId, opp = opponentOf(st);
    const uids = st.player.entry.slice(0, 3);
    for (let i = 0; i < 8; i++) recordLeagueLineup(st, id, uids);
    st.player.satisfaction = 2;
    st.pending = { comp: "fx", label: "관동 리그", opponent: opp.id, home: true, games: [] };
    recordPlayerGame(st, fake()); expect(st.player.satisfaction).toBe(0); expect(st.player.satLog![0].d).toBe(-5);
  });
});

describe("AI minimum rotation", () => {
  const team = () => { const t = game().player.squad; return t.map((m, i) => ({ ...t[0], uid: `u${i}`, species: "Pikachu", item: "", moves: ["Thunderbolt", "Quick Attack"], nature: "Serious" })); };
  it("keeps two best picks and swaps only the lowest-valued one on the fifth identical selection", () => {
    const own = team();
    expect(pickThree(own, own, 1, new Rng(1)).slice().sort()).toEqual([0, 1, 2]);
    expect(pickThree(own, own, 1, new Rng(1), 3, [2, 0, 1]).slice().sort()).toEqual([0, 1, 3]);
    expect(pickThree(own, own, 1, new Rng(1), 3, [0, 1, 4]).slice().sort()).toEqual([0, 1, 2]);
    expect(pickThree(own, own, 1, new Rng(1), 4, [0, 1, 2]).length).toBe(4);
  });
  it("maps identities across entry reordering and ignores a trio no longer in the entry", () => {
    const own = team();
    expect(avoidLineupIndices(own.slice().reverse(), ["u0", "u1", "u2"])).toEqual([5, 4, 3]);
    expect(avoidLineupIndices(own.slice(1), ["u0", "u1", "u2"])).toBeUndefined();
  });
  it("avoids all penalties with only one mandatory substitution every fifth match", () => {
    const st = game(), own = team(), id = opponentOf(st).id;
    const selections: number[][] = [];
    for (let i = 0; i < 10; i++) {
      const cfg = JSON.parse(JSON.stringify({ name: "A", team: own, skill: 1, gimmick: null, avoidLeagueLineup: leagueLineupToAvoid(st, id) }));
      const session = new BattleSession(cfg, { name: "B", team: own, skill: 1, gimmick: null }, 1);
      session.start(); const picks = session.picks[0]; selections.push(picks.slice().sort());
      expect(recordLeagueLineup(st, id, picks.map(i => own[i].uid)).penalty).toBe(0);
    }
    expect(selections).toEqual(Array.from({ length: 10 }, (_, i) => (i + 1) % 5 === 0 ? [0, 1, 3] : [0, 1, 2]));
  });
  it("respects explicit player choices even when they incur a penalty", () => {
    const own = team();
    for (const human of [false, true]) {
      const s = new BattleSession({ name: "A", team: own, skill: 1, gimmick: null, human, picks: [2, 0, 1], avoidLeagueLineup: ["u0", "u1", "u2"] }, { name: "B", team: own, skill: 1, gimmick: null }, 1);
      s.start(); expect(s.picks[0]).toEqual([2, 0, 1]);
    }
  });
  it("passes avoidance to the opponent in league battles, but not cup, continental or friendly battles", () => {
    const st = game(), opp = opponentOf(st);
    const uids = sideFor(st, opp.id).team.slice(0, 3).map(m => m.uid);
    for (let i = 0; i < 4; i++) recordLeagueLineup(st, opp.id, uids);
    st.pending = { comp: "fx", label: "관동 리그", opponent: opp.id, home: true, games: [] };
    expect(sideFor(st, opp.id).avoidLeagueLineup).toEqual(uids.slice().sort());
    expect(sideFor(st, opp.id, false, false).avoidLeagueLineup).toBeUndefined();
    st.pending.label = "PWT 조별리그"; expect(sideFor(st, opp.id).avoidLeagueLineup).toBeUndefined();
    st.pending.label = "친선경기"; st.pending.friendly = "test";
    expect(sideFor(st, opp.id).avoidLeagueLineup).toBeUndefined();
  });
});

it("settles all NPC league fixtures once and persists streaks across nine rounds", async () => {
  const st = game(); const id = allTrainers().find(t => t.region === "johto")!.id;
  const sim: Simulator = async jobs => jobs.map(() => fake());
  for (let round = 0; round < 9; round++) {
    st.day = leagueRoundDay(st.season, round); st.dayStep = 0;
    const r = await advance(st, sim); expect(r.type).toBe("match");
    recordPlayerGame(st, fake());
    await advance(st, sim);
    expect(leagueLineupRun(st, id)!.streak).toBe(round + 1);
  }
  expect(npcOf(st, id).log.filter(l => l.text.includes("동일 선발"))).toHaveLength(5);
  // Concurrent match-record changes still book every selected Pokémon once per league game.
  for (const [owner, region] of [[st.player.slotId, st.player.region], [id, "johto"]]) {
    const table = recordsOf(st).comps[`league:${region}`];
    const appearances = Object.entries(table).filter(([key]) => key.startsWith(`${owner}|`)).reduce((n, [, line]) => n + line.a, 0);
    expect(appearances).toBe(27);
  }
}, 30000);
