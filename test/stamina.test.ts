import { describe, it, expect, vi } from "vitest";
import { createGame, entryTeam, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { staminaCost, staminaOf, applyStamina, recoverStamina, staminaMultiplier, canField, exhaustedMessage } from "../src/game/stamina";
import { calcStats } from "../src/battle/calc";
import { BattleSession } from "../src/battle/engine";
import { afterBattle, treatSquad } from "../src/game/clinic";
import { advance, endDay, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { dayOf, leagueRoundDay, seasonEvents } from "../src/game/calendar";
import { isHomegrown, isRegistrationLegend, registrationOf, registrationProblems, registerTeam, suggestedRegistration } from "../src/game/registration";
import { rollCandidate } from "../src/game/scouting";
import { Rng } from "../src/game/rng";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });
const fake = () => ({ winner: 0 as const, remaining: [3, 0] as [number, number], turns: 1, picks: [[0,1,2], [0,1,2]] as [number[],number[]], kos: [{},{}] as [Record<number,number>,Record<number,number>] });
const sim: Simulator = async jobs => jobs.map(fake);

describe("stamina", () => {
  it.each([[100,1,true],[90,1,true],[89,0.95,true],[80,0.95,true],[79,0.9,true],[70,0.9,true],[69,0.85,true],[60,0.85,true],[59,0.8,true],[50,0.8,true],[49,0.75,false],[0,0.55,false]])("entry stamina %s uses multiplier %s and availability %s", (stamina,mult,eligible) => {
    expect(staminaMultiplier({stamina})).toBe(mult); expect(canField({stamina})).toBe(eligible);
  });
  it("scales only maximum HP, Attack and Special Attack in the actual simulator", () => {
    const st=game(); const team=entryTeam(st); const healthy={...team[0],stamina:100}; team[0].stamina=89;
    const s=new BattleSession({name:"A",team,gimmick:null,skill:1,picks:[0,1,2]}, {name:"B",team:team.map(m=>({...m,stamina:100})),gimmick:null,skill:1}, "stats");
    const pk=s.battle.sides[0].pokemon[0], base=calcStats(healthy);
    expect(pk.maxhp).toBe(Math.floor(base.hp*0.95)); expect(pk.storedStats.atk).toBe(Math.floor(base.atk*0.95)); expect(pk.storedStats.spa).toBe(Math.floor(base.spa*0.95));
    for(const k of ["def","spd","spe"]) expect(pk.storedStats[k]).toBe(base[k]);
    pk.setSpecies(pk.species); pk.setSpecies(pk.species);
    expect(pk.storedStats.atk).toBe(Math.floor(base.atk*0.95)); // no compounding after switch/form resets
    pk.updateMaxHp(); expect(pk.maxhp).toBe(Math.floor(base.hp*0.95));
  });
  it("keeps the fatigue multiplier after Mega evolution and Transform", () => {
    const st=game(); const team=entryTeam(st); team[0]={...team[0],species:"Charizard",ability:"Blaze",stamina:70};
    const s=new BattleSession({name:"A",team,gimmick:null,skill:1}, {name:"B",team:team.map(m=>({...m,stamina:100})),gimmick:null,skill:1}, "forms");
    const pk=s.battle.sides[0].pokemon[0]; pk.setSpecies(s.battle.dex.species.get("Charizard-Mega-X"));
    expect(pk.storedStats.atk).toBe(calcStats({...team[0],species:"Charizard-Mega-X"}).atk);
    const target=s.battle.sides[1].pokemon[1], targetAtk=target.storedStats.atk;
    expect(pk.transformInto(target)).toBe(true); expect(pk.storedStats.atk).toBe(Math.floor(targetAtk*0.9));
  });
  it("rejects a below-50 human pick with the tired Pokémon's name", () => {
    const st=game(); const team=entryTeam(st); team[0].stamina=49;
    const s=new BattleSession({name:"A",team,gimmick:null,skill:1,human:true,picks:[0,1,2]}, {name:"B",team:team.map(m=>({...m,stamina:100})),gimmick:null,skill:1}, "tired");
    expect(()=>s.start()).toThrow(exhaustedMessage(team[0]));
  });
  it.each([[1,1],[0.99,1],[0.9,1],[0.8,2],[0.51,4],[0.5,5],[0.01,9],[0,15]])("remaining HP %s costs %s", (hp, cost) => expect(staminaCost(hp)).toBe(cost));
  it("charges only actual appearances, recovers only on days off, and clamps to 0..100", () => {
    const st=game(); const [a,b,c]=st.player.squad;
    a.stamina=10; b.stamina=70; c.stamina=100;
    const result={...fake(), appeared: [[a.uid], []] as [string[],string[]], after: [{[a.uid]:{hp:0,pp:{}}, [b.uid]:{hp:0.5,pp:{}}},{}] as any};
    applyStamina(st, [a,b], result, 0);
    expect(a.stamina).toBe(0); expect(b.stamina).toBe(70);
    recoverStamina(st); expect(a.stamina).toBe(0); expect(b.stamina).toBe(71); expect(c.stamina).toBe(100);
    st.day++; recoverStamina(st); expect(a.stamina).toBe(1);
  });
  it("treatment restores HP and PP without recovering stamina", () => {
    const st=game(); const m=st.player.squad[0]; m.stamina=40; st.player.money=1000000;
    afterBattle(st, {[m.uid]:{hp:0,pp:{tackle:5}}}); treatSquad(st);
    expect(m.cond).toBeUndefined(); expect(m.stamina).toBe(40);
  });
  it.each([false,true])("records field appearances rather than selected reserves (doubles=%s)", doubles => {
    const st=game(); const team=entryTeam(st);
    const session=new BattleSession({name:"A",team,gimmick:null,skill:1,picks:[0,1,2,3]}, {name:"B",team:team.map(m=>({...m,uid:"b"+m.uid})),gimmick:null,skill:1,picks:[0,1,2,3]}, "appearance", {doubles});
    session.start(); session.battle.win("p1");
    const r=session.result(); expect(r.appeared![0].length).toBe(doubles?2:1);
    expect(Object.keys(r.after![0]).length).toBe(doubles?4:3);
  });
  it("records player and NPC stamina before automatic treatment", () => {
    const st=game(); st.registrationDue="league"; registerTeam(st,"league",suggestedRegistration(st,"league"));
    const opponent=allTrainers().find(t=>t.id!==st.player.slotId)!;
    st.pending={comp:"fx",label:"관동 리그",opponent:opponent.id,home:true,games:[]};
    const mine=entryTeam(st)[0], other=sideFor(st,opponent.id).team[0];
    const r={...fake(), appeared:[[mine.uid],[other.uid]] as [string[],string[]], after:[{[mine.uid]:{hp:0,pp:{}}},{[other.uid]:{hp:0.5,pp:{}}}] as any};
    recordPlayerGame(st,r); expect(mine.stamina).toBe(85); expect(st.npcStamina![other.uid].stamina).toBe(95);
    expect(sideFor(st,opponent.id).team[0].stamina).toBe(95);
  });
  it("initializes old saves without overwriting existing stamina", () => {
    const st=game(); delete st.player.squad[0].stamina; st.player.squad[1].stamina=42;
    const next=migrate(JSON.parse(JSON.stringify(st))); expect(next.player.squad[0].stamina).toBe(100); expect(next.player.squad[1].stamina).toBe(42);
  });
  it("forfeits an exhausted team without awarding appearances or training experience", () => {
    const st=game(); const team=entryTeam(st); team.forEach(m=>m.stamina=0);
    const other=team.map(m=>({...m,uid:"other"+m.uid,stamina:100}));
    const session=new BattleSession({name:"A",team,gimmick:null,skill:1}, {name:"B",team:other,gimmick:null,skill:1}, "exhausted");
    session.start(); const r=session.runToEnd();
    expect(r.winner).toBe(1); expect(r.remaining).toEqual([0,3]); expect(r.picks).toEqual([[],[]]); expect(r.appeared).toEqual([[],[]]);
  });
});

