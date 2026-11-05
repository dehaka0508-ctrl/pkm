import { roleSeats } from "../src/game/finance";
import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { advanceWithRegistration as advance } from "./registered-advance";
import { recordPlayerGame, type Simulator } from "../src/game/season";
import { allTrainers, trainerById } from "../src/game/lineups";
import { npcGate, npcMembers, npcOf, npcTeam, planGimmicks, startingItems } from "../src/game/npc";
import { nextGoal } from "../src/game/ai/controller";
import { Rng } from "../src/game/rng";
import { koItem, koSpecies, koType } from "../src/data/dex";

const fake = (seed: string) => {
  const rng = new Rng(seed);
  const w = rng.chance(0.06) ? -1 : rng.chance(0.5) ? 0 : 1;
  const rem = [0, 0];
  if (w === 0) rem[0] = rng.int(1, 3);
  if (w === 1) rem[1] = rng.int(1, 3);
  return { winner: w, remaining: rem, picks: [[0, 1, 2], [0, 1, 2]], kos: [[0, 0, 0], [0, 0, 0]], turns: 10, log: [] } as any;
};
const sim: Simulator = async jobs => jobs.map(j => fake(j.seed));

const npcGoalsDone = (st: any, n: any) => { const id = Object.entries(st.npcs).find(([, x]) => x === n)![0]; return !nextGoal(st, id); };
const show = (st: any, id: string) => {
  const n = npcOf(st, id);
  const team = npcTeam(st, id);
  return `${trainerById(id)!.name}: ₽${Math.round(n.money).toLocaleString()} 명성${Math.round(n.reputation)} 팬${n.fans} 경기장${n.stadium} 스폰서 ${n.sponsor ? `${n.sponsor.name} 월${n.sponsor.monthly}` : "-"}\n   ${team.map(m => `${koSpecies(m.species)}${m.item ? `@${koItem(m.item)}` : ""}${m.teraType ? `[테라 ${koType(m.teraType)}]` : ""}`).join(", ")}`;
};

describe("npc economy", () => {
  it("starting items by role and gimmick plans", () => {
    for (const name of ["레드", "그린", "칸나", "웅", "반바지 꼬마 오성", "난천", "테사"]) {
      const t = allTrainers().find(x => x.name === name)!;
      console.log(name, t.role, JSON.stringify(startingItems(t)));
    }
    const st = createGame({ mode: "trainer", slotId: allTrainers().find(x => x.name === "웅")!.id, name: "나" });
    for (const name of ["레드", "그린", "난천", "성호", "테사", "단델"]) {
      const id = allTrainers().find(x => x.name === name)!.id;
      const p = planGimmicks(trainerById(id)!, npcMembers(st, id));
      const sp = (k?: string) => (k ? koSpecies(npcMembers(st, id).find(m => m.key === k)!.mon.species) : "-");
      console.log(name, "메가", sp(p.mega?.key), p.mega?.item, "| Z", sp(p.z?.key), p.z?.item, p.z?.move, "| 테라", sp(p.tera?.key), p.tera?.type);
    }
    expect(Object.keys(startingItems(allTrainers().find(x => x.name === "반바지 꼬마 오성")!)).length).toBe(0);
  });

  it("two seasons", async () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.role === "관장")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    console.log("player stadium", st.player.facilities.stadium, "items", st.player.squad.map(m => m.item || "-").join(","));
    const ids = ["레드", "그린", "난천", "반바지 꼬마 오성", "테사", "카지"].map(n => allTrainers().find(x => x.name === n)!.id);
    for (let i = 0; i < 6000 && st.season < 3; i++) {
      const before = st.season;
      const r = await advance(st, sim);
      if (r.type === "match") recordPlayerGame(st, fake(`p${i}`));
      if (st.season !== before) {
        console.log(`== season ${before} end ==`);
        for (const id of ids) console.log(show(st, id));
      }
      const d = (await import("../src/game/calendar")).dateOf(st.day);
      if (d.date <= 7 && (st as any)._m !== `${st.season}-${d.month}`) {
        (st as any)._m = `${st.season}-${d.month}`;
        const all = Object.values(st.npcs!);
        const done = all.filter(n => npcGoalsDone(st, n)).length;
        console.log(`s${st.season} ${d.month}월: 아이템 평균 ${(all.reduce((a, n) => a + Object.values(n.items).filter(Boolean).length, 0) / all.length).toFixed(1)} · 다 갖춘 NPC ${done} · 스폰서 ${all.filter(n => n.sponsor).length}`);
      }
    }
    const all = Object.values(st.npcs!);
    const items = all.map(n => Object.values(n.items).filter(Boolean).length);
    console.log("items held avg", (items.reduce((a, b) => a + b, 0) / items.length).toFixed(2), "full", items.filter(x => x >= 6).length, "/", all.length);
    const gates = all.map(n => npcGate(n).income).sort((a, b) => a - b);
    console.log("gate per home game min/median/max", gates[0], gates[gates.length >> 1], gates[gates.length - 1]);
    const fans = all.map(n => n.fans).sort((a, b) => a - b);
    console.log("fans min/median/max", fans[0], fans[fans.length >> 1], fans[fans.length - 1], "player fans", st.player.fans);
    const start = Object.fromEntries(Object.keys(st.npcs!).map(id => [id, roleSeats(trainerById(id)?.role)]));
    const moved = Object.entries(st.npcs!).filter(([id, n]) => (n.seats ?? 0) !== start[id]);
    console.log("NPC grounds bought/expanded", moved.length, "/", all.length, moved.slice(0, 8).map(([id, n]) => `${start[id]}→${n.seats}`).join(" "));
    const prices = all.map(n => npcGate(n).price).sort((a, b) => a - b);
    console.log("NPC ticket price min/median/max", prices[0], prices[prices.length >> 1], prices[prices.length - 1], "mood", Math.min(...all.map(n => n.sat ?? 60)), Math.max(...all.map(n => n.sat ?? 60)));
    console.log("money min/avg/max", Math.min(...all.map(n => n.money)), Math.round(all.reduce((a, n) => a + n.money, 0) / all.length), Math.max(...all.map(n => n.money)));
    console.log("sponsored", all.filter(n => n.sponsor).length, "mega", all.filter(n => Object.values(n.items).some(i => /ite( [XY])?$/.test(i))).length, "tera", all.filter(n => n.tera).length);
    console.log("recruits", Object.entries(st.npcs!).filter(([, n]) => n.legends.length).map(([id, n]) => `${trainerById(id)!.name}:${n.legends.map(l => koSpecies(l.mon.species)).join("/")}`).join(", "));
    console.log("news", st.inbox.filter(m => m.title.startsWith("[전설 영입]")).map(m => m.title).join(" | "));
    expect(all.some(n => n.legends.length)).toBe(true);
  }, 600000);
});
