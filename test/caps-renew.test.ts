// 동색병뚜껑 (all IVs +1) for each individual award at a competition's end; a trophy legend can be kept instead
// of signing a new one when the same competition is won again.
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { addItem, bagCount, useCap } from "../src/game/shop";
import { compEndAwards, recordsOf } from "../src/game/stats";
import { awardTicket, renewWithTicket, ticketsOf, useTicket, loanCompOf } from "../src/game/legend";
import { STATS } from "../src/game/types";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });

describe("동색병뚜껑", () => {
  it("raises every IV by one, up to 31", () => {
    const st = game();
    const m = st.player.squad[0];
    m.ivs = { hp: 31, atk: 30, def: 0, spa: 15, spd: 31, spe: 29 };
    addItem(st, "cap:bronze");
    expect(useCap(st, m, "bronze")).toBeNull();
    expect(m.ivs).toEqual({ hp: 31, atk: 31, def: 1, spa: 16, spd: 31, spe: 30 });
    expect(useCap(st, m, "bronze")).toBe("동색병뚜껑이 없습니다.");
    for (const k of STATS) m.ivs[k] = 31;
    addItem(st, "cap:bronze");
    expect(useCap(st, m, "bronze")).toBe("이미 모든 개체값이 최대입니다.");
  });
  it("cup / PWT / PCT awards go to the top of each table", () => {
    const st = game();
    const me = st.player.slotId;
    const uid = st.player.squad[0].uid;
    recordsOf(st).comps["pwt"] = { [`${me}|${uid}`]: { s: "Pikachu", a: 3, k: 9, d: 900, t: 100 }, ["x|y"]: { s: "Eevee", a: 3, k: 1, d: 100, t: 800 } };
    const aw = compEndAwards(st, "pwt", st.player.region);
    expect(aw.map(a => [a.kind, a.owner])).toEqual([["k", me], ["d", me], ["t", "x"]]);
    expect(aw.every(a => a.comp === "pwt")).toBe(true);
  });
});

describe("trophy legend renewal", () => {
  it("winning the same competition again offers the held legend with 연장", () => {
    const st = game();
    st.player.squad = st.player.squad.slice(0, 5);
    awardTicket(st, "both", st.player.region, "관동 리그");
    const t1 = ticketsOf(st)[0];
    expect(useTicket(st, t1.id, t1.choices[0])).toBeNull();
    const legend = st.player.squad[st.player.squad.length - 1];
    expect(legend.loanComp).toBe("관동 리그");
    expect(legend.loanUntil).toBe(st.season + 3);
    // another competition: no renewal
    awardTicket(st, "both", "all", "PWT");
    expect(ticketsOf(st)[0].renew).toBeUndefined();
    expect(ticketsOf(st)[0].choices.length).toBe(3);
    // the same one a season later
    st.season += 1;
    awardTicket(st, "both", st.player.region, "관동 리그");
    const t2 = ticketsOf(st).find(t => t.comp === "관동 리그")!;
    expect(t2.renew).toEqual([legend.uid]);
    expect(t2.choices.length).toBe(2);
    expect(renewWithTicket(st, t2.id, legend.uid)).toBeNull();
    expect(legend.loanUntil).toBe(st.season + 3);
    expect(ticketsOf(st).some(t => t.id === t2.id)).toBe(false);
  });
  it("older saves: the competition is read from the signing message", () => {
    const st = game();
    awardTicket(st, "both", "all", "PWT");
    const t = ticketsOf(st)[0];
    useTicket(st, t.id, t.choices[0]);
    const legend = st.player.squad[st.player.squad.length - 1];
    delete legend.loanComp;
    expect(loanCompOf(st, legend)).toBe("PWT");
    void bagCount;
  });
});
