import { describe, it, expect, vi } from "vitest";
import { createGame, entryTeam, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
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

describe("season registrations", () => {
  it("uses regional Pokedex membership, not generation of introduction", () => {
    expect(isHomegrown("Pikachu","alola")).toBe(true);
    expect(isHomegrown("Gyarados","johto")).toBe(true);
    expect(isHomegrown("Tinkaton","kanto")).toBe(false);
    expect(isHomegrown("Meltan","kanto")).toBe(true); // Let's Go
    expect(isRegistrationLegend("Mew")).toBe(true); expect(isRegistrationLegend("Articuno")).toBe(true);
    expect(isRegistrationLegend("Iron Hands")).toBe(false);
  });
  it("enforces strict homegrown majority, combined legendary limit, and shiny exceptions", () => {
    const st=game(); const ms=st.player.squad.slice(0,4); st.player.squad=ms;
    ms.forEach((m,i)=>{m.species=i<2?"Pikachu":"Tinkaton";m.shiny=false;});
    const ids=ms.map(m=>m.uid);
    expect(registrationProblems(st,"cup",ids).join()).toContain("과반");
    ms[2].shiny=true; expect(registrationProblems(st,"cup",ids)).toEqual([]);
    ms[0].species="Mew"; ms[1].species="Mewtwo";
    expect(registrationProblems(st,"cup",ids).join()).toContain("전설");
    ms[0].shiny=true; expect(registrationProblems(st,"cup",ids)).toEqual([]);
    expect(registrationProblems(st,"league",[...ids,ids[0]]).join()).toContain("서로 다른");
  });
  it("locks each competition independently and limits actual entry to its registered UIDs", () => {
    const st=game(); const ids=suggestedRegistration(st,"league").slice(0,3);
    st.registrationDue="league"; expect(registerTeam(st,"league",ids)).toBeNull();
    expect(registerTeam(st,"league",ids)).toContain("이미");
    expect(registrationOf(st,"cup")).toBeUndefined();
    st.pending={comp:"fx",label:"관동 리그",opponent:"x",home:true,games:[]};
    st.player.entry=st.player.squad.slice().reverse().map(m=>m.uid);
    expect(new Set(entryTeam(st).map(m=>m.uid))).toEqual(new Set(ids));
  });
  it("allows eight registered among ten owned and rejects a ninth", () => {
    const st=game(); const source=st.player.squad[0];
    st.player.squad=Array.from({length:10},(_,i)=>({...source,uid:"u"+i,species:"Pikachu",shiny:false}));
    const ids=st.player.squad.map(m=>m.uid);
    expect(registrationProblems(st,"league",ids.slice(0,8))).toEqual([]);
    expect(registrationProblems(st,"league",ids.slice(0,9)).join()).toContain("3~8");
    st.registrationDue="league"; expect(registerTeam(st,"league",ids.slice(0,8))).toBeNull();
    expect(st.player.squad).toHaveLength(10); expect(registrationOf(st,"league")!.uids).toHaveLength(8);
  });
  it("stops before the league opener and cup draw, resumes only after valid registration", async () => {
    const st=game(); st.day=leagueRoundDay(1,0);
    const before=st.day;
    expect((await advance(st,sim)).type).toBe("registration");
    expect(st.day).toBe(before); expect(st.pending).toBeNull();
    expect(registerTeam(st,"league",suggestedRegistration(st,"league"))).toBeNull();
    expect((await advance(st,sim)).type).toBe("match");
    st.pending=null; st.day=seasonEvents(1).find(e=>e.kind==="cupDraw")!.day; st.dayStep=0;
    const r=await advance(st,sim); expect(r.type).toBe("registration"); expect(st.cups).toBeNull();
    expect(registerTeam(st,"cup",suggestedRegistration(st,"cup"))).toBeNull();
    expect((await advance(st,sim)).type).toBe("draw"); expect(st.cups).not.toBeNull();
  });
  it("clears rosters only at season rollover", () => {
    const st=game(); st.registrationDue="league"; registerTeam(st,"league",suggestedRegistration(st,"league"));
    st.day=dayOf(1,7,31); endDay(st,[]); expect(st.season).toBe(2); expect(registrationOf(st,"league")).toBeUndefined();
  });
  it("rolls shiny independently at 1/4096 for each scout candidate", () => {
    const rng=new Rng("shiny"); const spy=vi.spyOn(rng,"chance").mockImplementation(p=>p===1/4096);
    for(let i=0;i<3;i++) expect(rollCandidate(rng,"kanto",{facility:1,expires:10}).shiny).toBe(true);
    expect(spy.mock.calls.filter(([p])=>p===1/4096)).toHaveLength(3);
  });
});
