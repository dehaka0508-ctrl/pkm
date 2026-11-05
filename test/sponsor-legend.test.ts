import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { advanceWithRegistration as advance } from "./registered-advance";
import { recordPlayerGame, type Simulator } from "../src/game/season";
import { allTrainers } from "../src/game/lineups";
import { dateLabel, dateOf, nthWeekday, seasonStart } from "../src/game/calendar";
import { makeOffers, respond, signOffer, sponsorOf, sponsorScore, SPONSORS } from "../src/game/sponsor";
import { legendPools, ticketsOf, useTicket } from "../src/game/legend";
import { Rng } from "../src/game/rng";
import { koSpecies, dex } from "../src/data/dex";

const fake = (seed: string, alwaysP1 = false) => {
  const rng = new Rng(seed);
  const w = alwaysP1 ? 0 : rng.chance(0.5) ? 0 : 1;
  const rem = [0, 0];
  rem[w] = rng.int(1, 3);
  return { winner: w, remaining: rem, picks: [[0, 1, 2], [0, 1, 2]], kos: [[0, 0, 0], [0, 0, 0]], turns: 10, log: [] } as any;
};
// AI-vs-AI games are random; the player wins everything
const sim: Simulator = async jobs => jobs.map(j => fake(j.seed));

describe("sponsors and legend tickets", () => {
  it("data: 101 companies + villain organisations", () => {
    expect(SPONSORS.filter(s => !s.villain).length).toBeGreaterThanOrEqual(100);
    expect(SPONSORS.filter(s => s.villain).map(s => s.name)).toContain("로켓단");
    const p = legendPools();
    for (const k of ["legend", "myth"] as const) console.log(k, Object.entries(p[k]).map(([r, l]) => `${r}:${l.length}`).join(" "));
    expect(p.legend.kanto.length).toBeGreaterThanOrEqual(3);
    expect(p.myth.sinnoh.length).toBeGreaterThanOrEqual(3);
  });

  it("game starts on Aug 1 preseason, offers on the first Monday, villain boss is backed by the org", async () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.name === "그린")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    expect(dateLabel(st.day)).toBe("8월 1일 (금)");
    const monday = nthWeekday(1, 8, 0, 1);
    for (let i = 0; i < 20 && st.day <= monday; i++) await advance(st, sim);
    const sp = sponsorOf(st);
    console.log("score", sponsorScore(st), sp.offers.map(o => `${o.name}(${o.size}) ${o.monthly}/${o.bonus}/${o.len} [${o.objectives.map(x => x.label)}]`));
    expect(sp.offers.length).toBeGreaterThanOrEqual(2);
    // greedy ask: counter, then withdraw after patience runs out
    const o = sp.offers[0];
    const r1 = respond(o, { monthly: o.monthly * 3, bonus: o.bonus * 3, len: 3 });
    expect(r1.kind).toBe("counter");
    console.log(r1.message);
    const r2 = respond(o, { monthly: o.monthly, bonus: o.bonus, len: o.len });
    expect(r2.kind).toBe("accept");
    expect(signOffer(st, 0, { monthly: o.monthly, bonus: o.bonus, len: o.len })).toBeNull();
    expect(sp.offers.length).toBe(0);

    const boss = allTrainers().find(x => x.name === "비주기")!;
    const g2 = createGame({ mode: "trainer", slotId: boss.id, name: "비주기" });
    expect(sponsorOf(g2).contract?.name).toBe("로켓단");
    expect(sponsorOf(g2).contract?.fixed).toBe(true);
    for (let i = 0; i < 20 && g2.day <= monday; i++) await advance(g2, sim);
    expect(sponsorOf(g2).offers.length).toBe(0);
    // 아폴로 is a regular trainer now
    expect(allTrainers().find(x => x.name === "아폴로")!.role).toBe("트레이너");
  });

  it("full season: monthly pay, objectives, trophy tickets, loans", async () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.name === "레드")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    let paid = 0;
    let signed = false;
    for (let i = 0; i < 4000 && st.season < 2; i++) {
      const before = st.player.money;
      const r = await advance(st, sim);
      if (r.type === "match") recordPlayerGame(st, fake(`p${i}`, true));
      const sp = sponsorOf(st);
      if (!signed && sp.offers.length) {
        expect(signOffer(st, 0)).toBeNull();
        signed = true;
      }
      if (r.type === "day" && r.summary.some(l => l.includes("월 지급"))) paid++;
      void before;
    }
    const c = sponsorOf(st).contract;
    console.log("contract", c?.name, c?.log, "paid months seen", paid, "total", c?.paidTotal);
    console.log("titles", st.player.titles);
    const tickets = ticketsOf(st);
    console.log("tickets", tickets.map(x => `${x.comp} ${x.kind} ${x.region}: ${x.choices.map(id => koSpecies(dex.species.get(id).name)).join(",")} until ${dateLabel(x.expires)}`));
    expect(c?.log.length).toBeGreaterThan(0);
    expect(tickets.length).toBeGreaterThan(0);
    expect(dateOf(st.day).month).toBe(8);
    // use one ticket in the August preseason
    while (st.player.squad.length >= 10) st.player.squad.pop();
    const tk = tickets[0];
    expect(useTicket(st, tk.id, tk.choices[0])).toBeNull();
    const mon = st.player.squad[st.player.squad.length - 1];
    expect(mon.loanUntil).toBe(4);
    // the other tickets expire on Sep 1
    for (let i = 0; i < 200 && st.day < seasonStart(2) + 32; i++) {
      const r = await advance(st, sim);
      if (r.type === "match") recordPlayerGame(st, fake(`q${i}`, true));
    }
    expect(ticketsOf(st).length).toBe(0);
    // after season 4 the loan ends
    st.season = 4;
    st.day = seasonStart(5) - 1;
    st.pending = null;
    st.dayStep = 99;
    await advance(st, sim);
    expect(st.season).toBe(5);
    expect(st.player.squad.some(m => m.uid === mon.uid)).toBe(false);
  }, 600000);

  it("old saves move to the August calendar", () => {
    const t = allTrainers().find(x => x.region === "johto")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" }) as any;
    delete st.cal;
    delete st.player.sponsor;
    st.day = 10; // old calendar: Sep 11
    const m = migrate(st);
    expect(dateLabel(m.day)).toBe("9월 11일 (목)");
    expect(sponsorOf(m).offers.length).toBeGreaterThan(0);
    expect(makeOffers(m).length).toBeGreaterThan(0);
  });
});
