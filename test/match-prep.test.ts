// NPC clubs get ready for each match the night before: only what they may know, only changes they can undo,
// and nobody is told.
import { describe, expect, it } from "vitest";
import { createGame, entryTeam } from "../src/game/state";
import { allTrainers, resolveTeam, trainerById, trainerIv } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { endDay, sideFor } from "../src/game/season";
import { prepareFor, prepareMatches, publicTeam, rememberMeeting } from "../src/game/ai/prep";
import { npcOf, npcMembers, npcTeam, unpackSeen } from "../src/game/npc";
import { reserveOf } from "../src/game/ai/controller";
import { leagueRoundDay } from "../src/game/calendar";
import { levelUpMoves } from "../src/game/moves";
import { tmCompatible } from "../src/game/shop";
import { dex } from "../src/data/dex";
import { toID } from "@pkmn/sim";

const game = (slot = allTrainers()[0].id) => createGame({ mode: "trainer", slotId: slot, name: "검증" });
const npcPair = (st: ReturnType<typeof game>) => {
  const f = st.leagues.kanto.rounds[0].find(x => x.home !== st.player.slotId && x.away !== st.player.slotId)!;
  return [f.home, f.away] as const;
};

describe("what a club remembers", () => {
  it("after a game, each NPC keeps what the other side showed — only the latest meeting", () => {
    const st = game();
    const [a, b] = npcPair(st);
    const A = sideFor(st, a, false, false), B = sideFor(st, b, false, false);
    const r = simulateMatch(A, B, "meet");
    rememberMeeting(st, [a, b], [A.team, B.team], r);
    const memA = { ...npcOf(st, a).met![b], mons: npcOf(st, a).met![b].mons.map(unpackSeen) };
    const shown = Object.keys(r.seen![1]).map(i => dex.species.get(B.team[+i].species).id);
    expect(memA.mons.map(m => m.s).sort()).toEqual(shown.sort());
    for (const m of memA.mons) {
      const set = B.team.find(x => dex.species.get(x.species).id === m.s)!.moves.map(x => toID(x));
      for (const mv of m.m || []) expect(set).toContain(mv); // only moves of its set it actually used
    }
    expect(npcOf(st, b).met![a]).toBeDefined();
    // a later meeting replaces it
    const r2 = simulateMatch(A, B, "meet2");
    st.day += 3;
    rememberMeeting(st, [a, b], [A.team, B.team], r2);
    expect(npcOf(st, a).met![b].day).toBe(st.day);
  });

  it("the player keeps no AI memory; an NPC remembers what the player showed", () => {
    const st = game();
    const me = st.player.slotId;
    const opp = st.leagues[st.player.region].teams.find(id => id !== me)!;
    const P = sideFor(st, me, false, false), O = sideFor(st, opp, false, false);
    rememberMeeting(st, [me, opp], [P.team, O.team], simulateMatch(P, O, "p"));
    expect(npcOf(st, opp).met![me]).toBeDefined();
    expect((st.npcs as any)[me]?.met).toBeUndefined();
  });

  it("the opponent it plans against is its public team: no hidden base stats, IVs as its club info shows", () => {
    const st = game(allTrainers().find(t => t.region === "kanto" && t.id !== "kanto-레드")!.id);
    const pub = publicTeam(st, "kanto-레드");
    const pika = pub.find(m => m.species === "Pikachu")!;
    expect(pika.baseStats).toBeUndefined();
    const iv = trainerIv(trainerById("kanto-레드")!);
    expect(Object.values(pika.ivs).every(v => v === iv)).toBe(true);
    // the player's public team is the entry six as shown
    expect(publicTeam(st, st.player.slotId).map(m => m.species)).toEqual(entryTeam(st).map(m => m.species));
  });
});

describe("getting ready", () => {
  it("only held items and move sets change; moves come from what each Pokémon may use; no news, no notes", () => {
    const st = game();
    const [a, b] = npcPair(st);
    const n = npcOf(st, a);
    n.money = 400000;
    const before = npcMembers(st, a).map(x => ({ ...x.mon }));
    const heldBefore = { ...n.items };
    const inbox = st.inbox.length;
    const log = n.log.length;
    prepareFor(st, a, b, publicTeam(st, b));
    const after = npcMembers(st, a).map(x => x.mon);
    after.forEach((m, i) => {
      expect(m.species).toBe(before[i].species);
      expect(m.ability).toBe(before[i].ability);
      expect(m.nature).toBe(before[i].nature);
      expect(m.evs).toEqual(before[i].evs);
      const base = resolveTeam(trainerById(a)!)[i];
      const pool = new Set([...levelUpMoves(dex.species.get(m.species).id, m.level).map(x => x.id), ...base.moves.map(x => toID(x)), ...before[i].moves.map(x => toID(x)), ...(n.tms || []).filter(x => tmCompatible(m.species).has(x))]);
      for (const mv of m.moves) expect(pool.has(toID(mv))).toBe(true);
    });
    // Mega Stones / Z-Crystals, choice items and Assault Vest stay where they were
    for (const [k, item] of Object.entries(heldBefore)) {
      const it = dex.items.get(item);
      if (it.exists && (it.megaStone || it.zMove || /^(choice|assaultvest)/.test(it.id))) expect(n.items[k]).toBe(item);
    }
    expect(st.inbox.length).toBe(inbox);
    expect(n.log.length).toBe(log);
    expect(n.money).toBeGreaterThanOrEqual(Math.min(400000, reserveOf(st, a)));
  });

  it("spends nothing without money above its reserve, and gets ready once per match day", () => {
    const st = game();
    const [a, b] = npcPair(st);
    const n = npcOf(st, a);
    n.money = reserveOf(st, a);
    const money = n.money;
    prepareFor(st, a, b, publicTeam(st, b));
    expect(n.money).toBe(money);
    const snap = JSON.stringify(npcTeam(st, a));
    n.money = 900000;
    prepareFor(st, a, b, publicTeam(st, b)); // same day, same opponent: already done
    expect(JSON.stringify(npcTeam(st, a))).toBe(snap);
    expect(n.money).toBe(900000);
  });

  it("the night before a league round, every NPC with a match is ready for its opponent", () => {
    const st = game();
    const day = leagueRoundDay(st.season, 0);
    st.day = day - 1;
    st.dayStep = 0;
    endDay(st, []);
    expect(st.day).toBe(day);
    for (const f of st.leagues.kanto.rounds[0]) {
      for (const [me, opp] of [[f.home, f.away], [f.away, f.home]]) {
        if (me === st.player.slotId) continue;
        expect(npcOf(st, me).prepped).toBe(`${day}:${opp}`);
      }
    }
  });

  it("everyone plans from the other's team as it was before anyone changed (no peeking)", () => {
    const st = game();
    const [a, b] = npcPair(st);
    npcOf(st, a).money = npcOf(st, b).money = 500000;
    const pubB = JSON.stringify(publicTeam(st, b));
    const pubA = JSON.stringify(publicTeam(st, a));
    // what b sees of a must be a's team before a got ready: run the pair together and compare with b alone
    const st2 = JSON.parse(JSON.stringify(st));
    prepareMatches(st, [[a, b]]);
    prepareFor(st2, b, a, JSON.parse(pubA));
    expect(JSON.stringify(npcTeam(st, b))).toBe(JSON.stringify(npcTeam(st2, b)));
    void pubB;
  });
});
