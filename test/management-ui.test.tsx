// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { setGame } from "../src/ui/store";
import { TrainingTab } from "../src/ui/tabs/Training";
import { LoanPanel } from "../src/ui/LoanPanel";
import { SquadTab } from "../src/ui/tabs/Squad";
import { RegistrationDialog } from "../src/ui/Registration";
import { lendersFor } from "../src/game/loan";
import { expForLevel } from "../src/game/training";
import { registrationOf } from "../src/game/registration";

let root: HTMLDivElement;
const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t=>t.region==="kanto" && t.role==="관장")!.id, name:"UI 검증" });
async function mount(node: any) { await act(()=>render(node,root)); }
async function click(button: Element) { await act(()=> (button as HTMLElement).click()); }
function button(text: string, scope: ParentNode = root) { const b=[...scope.querySelectorAll("button")].find(b=>b.textContent?.includes(text)); if(!b) throw new Error("Missing button: "+text); return b; }
beforeEach(()=> { vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Assets are not fetched by DOM tests"))); root=document.createElement("div"); document.body.append(root); });
afterEach(async()=> { await act(()=>render(null,root)); root.remove(); setGame(null); localStorage.clear(); vi.unstubAllGlobals(); });

describe("management UI",()=> {
  it("opens a training popup with six EV rows, selects one plan, and saves it on confirmation", async()=> {
    const g=game(); const m=g.player.squad[0]; m.evs.atk=32; m.nature="Adamant"; g.player.plan[m.uid]="level"; setGame(g);
    await mount(h(TrainingTab,{g}));
    expect(root.querySelector("select")).toBeNull();
    await click(button("레벨 훈련"));
    const modal=root.querySelector(".training-plan")!;
    expect(modal.querySelectorAll(".training-stat")).toHaveLength(6);
    expect(modal.textContent).toContain("노력치 32/510");
    expect(modal.querySelector(".nature-up")?.textContent).toContain("↑");
    await click(modal.querySelector('[aria-label="공격 노력치 감소"]')!);
    expect(g.player.plan[m.uid]).toBe("level");
    await click(button("훈련 확정",modal));
    expect(g.player.plan[m.uid]).toBe("-atk"); expect(root.querySelector(".training-plan")).toBeNull();
    expect(JSON.parse(localStorage.getItem("pl:save")!).player.plan[m.uid]).toBe("-atk");
  });
  it("opens a loan amount selector inside the selected lender, and moves it on another lender click",async()=> {
    const g=game(); g.player.reputation=100; setGame(g); await mount(h(LoanPanel,{g,toast:()=>{}}));
    const lenders=lendersFor(g.player.region);
    await click(button("빌리기"));
    const range=root.querySelector('input[type="range"]')!;
    const first=range.closest(".card")!.parentElement!;
    expect(first.querySelector(":scope > .row")?.textContent).toContain(lenders[0].name);
    const choices=[...root.querySelectorAll("button")].filter(b=>b.textContent?.includes("빌리기"));
    await click(choices[1]);
    expect(root.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(root.querySelector('input[type="range"]')!.closest(".card")!.parentElement).not.toBe(first);
  });
  it("shows separate HP, thin EXP and stamina bars in squad slots", async()=> {
    const g=game(); const m=g.player.squad[0]; m.stamina=63; m.level=50; m.exp=expForLevel(50)+100; setGame(g);
    await mount(h(SquadTab,{g}));
    const slot=root.querySelector(".pslot")!;
    expect(slot.querySelector(".pslot-hp")).not.toBeNull();
    expect(slot.querySelector(".pslot-exp .bar.exp i")?.getAttribute("style")).toContain("width:");
    expect(slot.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("63");
  });
  it("registers the suggested valid season roster through the popup", async()=> {
    const g=game(); g.registrationDue="league"; setGame(g); let confirmed=false;
    await mount(h(RegistrationDialog,{g,competition:"league",onClose:()=>{},onRegistered:()=>{confirmed=true;}}));
    await click(button("시즌 등록 확정"));
    expect(confirmed).toBe(true); expect(registrationOf(g,"league")!.uids.length).toBeGreaterThanOrEqual(3);
    expect(g.registrationDue).toBeUndefined();
  });
});
