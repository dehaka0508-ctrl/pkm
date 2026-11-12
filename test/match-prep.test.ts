// NPC clubs get ready for each match the night before: only what they may know, only changes they can undo,
// and nobody is told.
import { describe, expect, it } from "vitest";
import { createGame, entryTeam, migrate } from "../src/game/state";
import { allTrainers, resolveTeam, trainerById, trainerIv } from "../src/game/lineups";
import { simulateMatch } from "../src/battle/engine";
import { endDay, sideFor } from "../src/game/season";
import { prepareFor, prepareMatches, publicTeam, rememberMeeting } from "../src/game/ai/prep";
import { npcOf, npcMembers, npcTeam, unpackSeen } from "../src/game/npc";
import { reserveOf } from "../src/game/ai/controller";
import { leagueRoundDay } from "../src/game/calendar";
import { registerTeam, suggestedRegistration } from "../src/game/registration";
import { eggMoves, levelUpMoves } from "../src/game/moves";
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
  it("only held items and move sets change — for that match only; moves come from what each Pokémon may use; no news, no notes", () => {
    const st = game();
    const [a, b] = npcPair(st);
    const n = npcOf(st, a);
    n.money = 400000;
    const before = npcMembers(st, a).map(x => ({ ...x.mon }));
    const ownTeam = JSON.stringify(npcTeam(st, a));
    const ownCare = JSON.stringify(n.care || {});
    const heldBefore = { ...n.items };
    const inbox = st.inbox.length;
    const log = n.log.length;
    prepareFor(st, a, b, publicTeam(st, b));
    // the club's own sets are untouched: what it shows, and what the next preparation starts from
    expect(JSON.stringify(npcTeam(st, a))).toBe(ownTeam);
    expect(JSON.stringify(n.care || {})).toBe(ownCare);
    expect(n.items).toEqual(heldBefore);
    // tonight's team (against b) carries the changes
    const tonight = sideFor(st, a, false, false, b).team;
    const shown = sideFor(st, a, false, false, b, false).team;
    expect(JSON.stringify(shown)).toBe(ownTeam);
    tonight.forEach((m, i) => {
      expect(m.species).toBe(before[i].species);
      expect(m.ability).toBe(before[i].ability);
      expect(m.nature).toBe(before[i].nature);
      expect(m.evs).toEqual(before[i].evs);
      const base = resolveTeam(trainerById(a)!)[i];
      const pool = new Set([...levelUpMoves(dex.species.get(m.species).id, m.level).map(x => x.id), ...eggMoves(m.species), ...base.moves.map(x => toID(x)), ...before[i].moves.map(x => toID(x)), ...(n.tms || []).filter(x => tmCompatible(m.species).has(x))]);
      for (const mv of m.moves) expect(pool.has(toID(mv))).toBe(true);
      // status moves of its own set are never swapped out (the set is built around them)
      for (const mv of before[i].moves.map(x => toID(x))) if (dex.moves.get(mv).category === "Status") expect(m.moves.map(x => toID(x))).toContain(mv);
    });
    // Mega Stones / Z-Crystals, choice items and Assault Vest stay where they were
    for (const [k, item] of Object.entries(heldBefore)) {
      const it = dex.items.get(item);
      const uid = npcMembers(st, a).find(x => x.key === k)?.mon.uid;
      if (uid && it.exists && (it.megaStone || it.zMove || /^(choice|assaultvest)/.test(it.id))) expect(tonight.find(m => m.uid === uid)!.item).toBe(item);
    }
    expect(st.inbox.length).toBe(inbox);
    expect(n.log.length).toBe(log);
    expect(n.money).toBeGreaterThanOrEqual(Math.min(400000, reserveOf(st, a)));
    // against anyone else, or on another day, it is its own team again
    const other = st.leagues.kanto.teams.find(id => id !== a && id !== b && id !== st.player.slotId)!;
    expect(JSON.stringify(sideFor(st, a, false, false, other).team)).toBe(ownTeam);
    st.day++;
    expect(JSON.stringify(sideFor(st, a, false, false, b).team)).toBe(ownTeam);
  });

  it("no drift: a season of preparations leaves the club's own sets as they were", () => {
    const st = game();
    const [a] = npcPair(st);
    const n = npcOf(st, a);
    n.money = 600000;
    const own = JSON.stringify(npcTeam(st, a));
    const others = st.leagues.kanto.teams.filter(id => id !== a && id !== st.player.slotId);
    for (const opp of others) {
      st.day += 7;
      prepareFor(st, a, opp, publicTeam(st, opp));
      prepareFor(st, a, opp, publicTeam(st, opp, "doubles"), "doubles");
      prepareFor(st, a, opp, publicTeam(st, opp, "league"), "league");
    }
    expect(JSON.stringify(npcTeam(st, a))).toBe(own);
    // what it bought stays: TMs and items in the bag
    expect(n.money).toBeLessThanOrEqual(600000);
  });

  it("an older save's drifted move sets go back to the lineup's own once", () => {
    const st = game();
    const [a] = npcPair(st);
    const own = JSON.stringify(npcTeam(st, a));
    (npcOf(st, a).care ||= {})["0"] = { moves: ["tackle", "growl"] };
    delete (st as any).baselineV2;
    const back = migrate(JSON.parse(JSON.stringify(st)));
    expect(JSON.stringify(npcTeam(back, a))).toBe(own);
  });

  it("doubles: Protect is bought once and joins tonight's sets; six-a-side: boots against hazards", () => {
    const st = game();
    const [a, b] = npcPair(st);
    const n = npcOf(st, a);
    n.money = 900000;
    n.tms = (n.tms || []).filter(x => x !== "protect");
    prepareFor(st, a, b, publicTeam(st, b, "doubles"), "doubles");
    const tonight = sideFor(st, a, true, false, b).team;
    const couldUse = tonight.filter(m => tmCompatible(m.species).has("protect") && !/^(choice|assaultvest)/.test(toID(m.item)));
    if (couldUse.some(m => !resolveTeam(trainerById(a)!).find(x => x.uid === m.uid)?.moves.map(x => toID(x)).includes("protect"))) {
      expect(n.tms).toContain("protect");
      expect(tonight.some(m => m.moves.map(x => toID(x)).includes("protect"))).toBe(true);
    }
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
    st.registrationDue = "league";
    expect(registerTeam(st, "league", suggestedRegistration(st, "league"))).toBeNull();
    const day = leagueRoundDay(st.season, 0);
    st.day = day - 1;
    st.dayStep = 0;
    endDay(st, []);
    expect(st.day).toBe(day);
    for (const f of st.leagues.kanto.rounds[0]) {
      for (const [me, opp] of [[f.home, f.away], [f.away, f.home]]) {
        if (me === st.player.slotId) continue;
        expect(npcOf(st, me).prepped).toBe(`${day}:${opp}:league`);
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
