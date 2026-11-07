// Base PP + 포인트업/포인트맥스, type-focused scouting (×2), the January roster window with its Feb 1
// confirmation, and the one-week limit on "to my next match".
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { BattleSession } from "../src/battle/engine";
import { advance, sideFor, TO_MY_NEXT_DAYS, winterConfirmDue, type Simulator } from "../src/game/season";
import { dateOf, dayOf } from "../src/game/calendar";
import { canChangeRegistration, changeRegistration, registerTeam, registrationOf, suggestedRegistration } from "../src/game/registration";
import { addItem, catalog, usePP } from "../src/game/shop";
import { movePP } from "../src/game/pp";
import { basePools, rollCandidate, TYPE_FOCUS_WEIGHT } from "../src/game/scouting";
import { Rng } from "../src/game/rng";
import { dex } from "../src/data/dex";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });
const fake = () => ({ winner: 0 as const, remaining: [3, 0] as [number, number], turns: 1, picks: [[0, 1, 2], [0, 1, 2]] as [number[], number[]], kos: [{}, {}] as [Record<number, number>, Record<number, number>] });
const sim: Simulator = async jobs => jobs.map(fake);

describe("PP", () => {
  it("moves start at base PP; PP Ups raise it by a fifth each, PP Max to ×1.6", () => {
    const st = game();
    const m = st.player.squad[0];
    m.moves = ["thunderbolt", "protect", "surf", "icebeam"];
    expect(movePP("thunderbolt")).toBe(15);
    expect(movePP("thunderbolt", 3)).toBe(24);
    addItem(st, "ppup", 2);
    addItem(st, "ppmax");
    expect(usePP(st, m, "thunderbolt", "ppup")).toBeNull();
    expect(usePP(st, m, "thunderbolt", "ppup")).toBeNull();
    expect(m.ppUps?.thunderbolt).toBe(2);
    expect(usePP(st, m, "protect", "ppmax")).toBeNull();
    expect(usePP(st, m, "protect", "ppup")).toBe("이미 PP가 최대입니다.");
    expect(usePP(st, m, "flamethrower", "ppup")).toBe("그 기술을 가지고 있지 않습니다.");
    // in battle
    const me = sideFor(st, st.player.slotId);
    me.team = [m, ...me.team.filter(x => x.uid !== m.uid)];
    const opp = sideFor(st, st.leagues[st.player.region].teams.find(id => id !== st.player.slotId)!);
    const s = new BattleSession({ ...me, human: false }, { ...opp, human: false }, "pp");
    const pk = s.battle.sides[0].pokemon.find((p: any) => p.set.name === "m0");
    const pp = Object.fromEntries(pk.baseMoveSlots.map((x: any) => [x.id, x.maxpp]));
    expect(pp).toEqual({ thunderbolt: 21, protect: 16, surf: 15, icebeam: 10 });
    // the opponent's moves are at base PP too
    for (const p of s.battle.sides[1].pokemon) for (const x of p.baseMoveSlots) expect(x.maxpp).toBe(movePP(x.id));
  });
  it("shop: 포인트맥스 and 포인트업 head the 성격·특성 tab at 10000 / 5000", () => {
    const care = catalog().filter(i => i.cat === "care");
    expect(care.slice(0, 2)).toEqual([
      { key: "ppmax", cat: "care", price: 10000 },
      { key: "ppup", cat: "care", price: 5000 },
    ]);
  });
});

describe("type-focused scouting", () => {
  it("searches the whole pool, with the focus type twice as likely", () => {
    const pool = basePools().kanto;
    const isFire = (id: string) => dex.species.get(id).types.includes("Fire");
    const fires = pool.filter(isFire).length;
    const rng = new Rng("focus");
    let fire = 0;
    const N = 6000;
    for (let i = 0; i < N; i++) if (isFire(dex.species.get(rollCandidate(rng, "kanto", { type: "Fire", facility: 3, expires: 0 }).species).id)) fire++;
    const expected = (fires * TYPE_FOCUS_WEIGHT) / (fires * TYPE_FOCUS_WEIGHT + pool.length - fires);
    expect(fire / N).toBeGreaterThan(expected - 0.03);
    expect(fire / N).toBeLessThan(expected + 0.03);
    expect(fire).toBeLessThan(N); // other types still come
  });
});

describe("January roster window", () => {
  it("league / cup rosters change in January and are confirmed again when the date turns to Feb 1", async () => {
    const st = game();
    for (const comp of ["league", "cup"] as const) expect(registerTeam(st, comp, suggestedRegistration(st, comp))).toBeNull();
    const reg = registrationOf(st, "league")!;
    expect(canChangeRegistration(st, "league")).toBe(false); // August
    st.day = dayOf(st.season, 1, 10);
    expect(canChangeRegistration(st, "league")).toBe(true);
    expect(canChangeRegistration(st, "pwt")).toBe(false);
    const other = st.player.squad.map(m => m.uid).filter(u => !reg.uids.includes(u));
    const next = [...reg.uids.slice(0, -1), ...(other.length ? [other[0]] : [reg.uids[reg.uids.length - 1]])];
    expect(changeRegistration(st, "league", next)).toBeNull();
    expect(registrationOf(st, "league")!.uids).toEqual(next);
    // Feb 1: the confirmation is due (the cup only while the club is still in it)
    st.day = dayOf(st.season, 2, 1);
    st.dayStep = 0;
    st.pending = null;
    expect(canChangeRegistration(st, "league")).toBe(false);
    expect(winterConfirmDue(st)).toBe("league");
    const r = await advance(st, sim);
    expect(r).toEqual({ type: "registration", competition: "league" });
    expect(st.registrationDue).toBe("league");
    expect(canChangeRegistration(st, "league")).toBe(true);
    expect(changeRegistration(st, "league", next)).toBeNull();
    expect(registrationOf(st, "league")!.winterConfirmed).toBe(true);
    expect(st.registrationDue).toBeUndefined();
    expect(canChangeRegistration(st, "league")).toBe(false);
    expect(winterConfirmDue(st)).not.toBe("league");
  });
  it("Jan 1 opens the registration notice", async () => {
    const st = game();
    registerTeam(st, "league", suggestedRegistration(st, "league"));
    st.day = dayOf(st.season, 1, 1);
    st.dayStep = 0;
    st.pending = null;
    await advance(st, sim);
    expect((st as any).regNotice).toBe(st.season);
    expect(st.inbox.some(m => m.title === "1월 등록 명단 변경 기간")).toBe(true);
  });
});

describe("to my next match", () => {
  it("covers at most a week (the preseason can't vanish in one press)", async () => {
    const st = game();
    const start = st.day;
    const r = await advance(st, sim, undefined, { toMyNext: true });
    expect(st.day - start).toBeLessThanOrEqual(TO_MY_NEXT_DAYS);
    expect(r.type === "day" || r.type === "match" || r.type === "draw" || r.type === "registration").toBe(true);
    expect(dateOf(st.day).month).toBe(8);
  });
});
