import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { advanceWithRegistration as advance } from "./registered-advance";
import { recordPlayerGame, type Simulator } from "../src/game/season";
import { allTrainers } from "../src/game/lineups";
import { dateLabel, seasonEvents } from "../src/game/calendar";
import { groupTable, regionOf } from "../src/game/pwt";
import { Rng } from "../src/game/rng";

const fake = (seed: string) => {
  const rng = new Rng(seed);
  const w = rng.chance(0.06) ? -1 : rng.chance(0.5) ? 0 : 1;
  const rem = [0, 0];
  if (w === 0) rem[0] = rng.int(1, 3);
  if (w === 1) rem[1] = rng.int(1, 3);
  return { winner: w, remaining: rem, picks: [[0, 1, 2], [0, 1, 2]], kos: [[0, 0, 0], [0, 0, 0]], turns: 10, log: [] } as any;
};
const sim: Simulator = async jobs => jobs.map(j => fake(j.seed));

describe("competitions", () => {
  it("calendar", () => {
    const ev = seasonEvents(1);
    const show = (k: string) => ev.filter(e => e.kind === k).map(e => dateLabel(e.day)).join(" / ");
    for (const k of ["po", "groupDraw", "group", "cupDraw", "cup", "koDraw", "ko", "cupFinal", "pwtFinal"]) console.log(k, show(k));
    const lg = ev.filter(e => e.kind === "league");
    console.log("league", dateLabel(lg[0].day), "→", dateLabel(lg[37].day));
    const s2 = seasonEvents(2);
    console.log("s2 groupDraw", dateLabel(s2.find(e => e.kind === "groupDraw")!.day), "first group", dateLabel(s2.find(e => e.kind === "group")!.day), "opener", dateLabel(s2.find(e => e.kind === "league")!.day));
    // no two match events on one day
    // (the PST and the PCT share their Thursdays, like the Europa and Conference Leagues)
    const days = ev.filter(e => !/Draw$/.test(e.kind) && !["po", "ectGroup", "ectKo", "koThird"].includes(e.kind)).map(e => e.day);
    expect(new Set(days).size).toBe(days.length);
  });

  it("two seasons with fake results", async () => {
    const t = allTrainers().find(x => x.region === "kanto" && x.role === "관장")!;
    const st = createGame({ mode: "trainer", slotId: t.id, name: "나" });
    let matches = 0;
    const cupChampions: string[] = [];
    let draws = 0;
    for (let i = 0; i < 3000 && st.season < 3; i++) {
      const r = await advance(st, sim);
      if (r.type === "match") {
        matches++;
        recordPlayerGame(st, fake(`p${i}`));
      } else if (r.type === "draw") draws++;
      if (st.season === 1 && st.pwt && st.pwt.koDraw && i % 50 === 0) {
        // region protection in groups
        for (const g of st.pwt.groups) expect(new Set(g.map(regionOf)).size).toBe(4);
      }
      if (st.cups) for (const c of Object.values(st.cups)) if (c.champion && !cupChampions.includes(`${c.season}:${c.region}`)) {
        cupChampions.push(`${c.season}:${c.region}`);
        // wing bracket, every tie a single game (the final too)
        expect(Object.values(c.ties).every(t => t.format === "single" && t.games.length >= 1 && !!t.winner)).toBe(true);
        expect(Object.keys(c.ties).length).toBe(20); // 19 + the 3rd-place match
        const T = c.ties.T, wf = [c.ties["0WF"], c.ties["1WF"]];
        expect([T.a, T.b].sort()).toEqual(wf.map((t: any) => (t.winner === t.a ? t.b : t.a)).sort());
      }
      // knockout playoffs: PST runners-up vs PWT 3rds, PCT runners-up vs PST 3rds; their winners join the round of 16
      for (const [lowerKey, upperKey] of [["pct", "pwt"], ["ect", "pct"]] as const) {
        const L = (st as any)[lowerKey], U = (st as any)[upperKey];
        if (!L?.ko?.[0] || (st as any)[`_ko${lowerKey}${st.season}`]) continue;
        (st as any)[`_ko${lowerKey}${st.season}`] = true;
        expect(L.kpo.length).toBe(8);
        const thirds = U.groups.map((_: any, gi: number) => groupTable(U, gi)[2].id);
        const runners = L.groups.map((_: any, gi: number) => groupTable(L, gi)[1].id);
        for (const t of L.kpo) {
          expect(thirds).toContain(t.a);
          expect(runners).toContain(t.b);
          expect(t.format).toBe("two-leg");
        }
        const r16 = L.ko[0].flatMap((t: any) => [t.a, t.b]);
        for (const t of L.kpo) expect(r16).toContain(t.winner);
        expect(L.ko[0].length).toBe(8);
      }
      // 3rd-place matches of the continental tournaments: the semifinal losers
      for (const key of ["pwt", "pct", "ect"]) {
        const T = (st as any)[key];
        if (!T?.third?.winner || (st as any)[`_third${key}${T.season}`]) continue;
        (st as any)[`_third${key}${T.season}`] = true;
        const losers = T.ko[2].map((t: any) => (t.winner === t.a ? t.b : t.a)).sort();
        expect([T.third.a, T.third.b].sort()).toEqual(losers);
      }
      // PSB: the ten league champions; round 1 = each conference's two lowest on points; East vs West in the final
      const psb = (st as any).psb;
      if (psb?.champion && !(st as any)[`_psb${psb.season}`]) {
        (st as any)[`_psb${psb.season}`] = true;
        expect(psb.champs.east.length + psb.champs.west.length).toBe(10);
        for (const conf of ["east", "west"]) {
          const pts = (id: string) => { const r = regionOf(id); return (st.leagues as any)[r].table[id].pts; };
          const r1 = psb.ties[`${conf}:1`];
          const others = psb.champs[conf].filter((id: string) => id !== r1.a && id !== r1.b);
          expect(Math.max(pts(r1.a), pts(r1.b))).toBeLessThanOrEqual(Math.min(...others.map(pts)));
          const semis = [psb.ties[`${conf}:2a`], psb.ties[`${conf}:2b`]].flatMap((t: any) => [t.a, t.b]).sort();
          expect(semis).toEqual([...others, r1.winner].sort());
          expect(psb.ties.final[conf === "east" ? "a" : "b"]).toBe(psb.ties[`${conf}:3`].winner);
        }
        for (const t of Object.values(psb.ties) as any[]) expect(t.format).toBe("single");
      }
      if (st.season === 2 && st.cups && !(st as any)._cupChecked) {
        (st as any)._cupChecked = true;
        const cup = st.cups.kanto;
        const ranks = st.prev.tables.kanto;
        console.log("s2 cup E slots", ["0E", "1E"].map(k => [cup.ties[k].a, cup.ties[k].b].map(id => ranks.find(r => r.id === id)!.rank)));
        expect(["0E", "1E"].flatMap(k => [cup.ties[k].a, cup.ties[k].b].map(id => ranks.find(r => r.id === id)!.rank)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
        console.log("s2 pots", st.pwt!.pots.map(p => p.map(id => st.pwt!.seeds[id]).join(", ")));
        const pc = (st as any).pct;
        console.log("s2 pct", pc.entrants.length, pc.pots.map((p: string[]) => p.map((id: string) => pc.seeds[id]).join(", ")));
        for (const g of pc.groups) expect(new Set(g.map(regionOf)).size).toBe(4);
        expect(pc.entrants.filter((id: string) => st.pwt!.entrants.includes(id)).length).toBe(0);
        // the third tier: 32 who are in neither the PWT nor the PST
        const ec = (st as any).ect;
        if (ec) {
          expect(ec.entrants.length).toBe(32);
          expect(ec.entrants.filter((id: string) => st.pwt!.entrants.includes(id) || pc.entrants.includes(id)).length).toBe(0);
        }
        console.log("s2 qual po", st.qual!.po.entrants.length, "byes", st.qual!.po.byes.length, "ties", st.qual!.po.ties.length, "champ", st.prev.champion);
      }
    }
    const pct = (st as any).pct;
    console.log("pct s3", pct?.entrants.length, pct && pct.pots.map((p: string[]) => p.map((id: string) => pct.seeds[id]).join(", ")));
    console.log("supers", st.supers?.season, Object.keys(st.supers?.regional || {}).length, !!st.supers?.world?.winner);
    // 전국 슈퍼컵: PST winner vs PCT winner, then the winner vs the PWT winner
    const sp = st.supers!;
    if (sp.semi) {
      expect(sp.semi.winner).toBeTruthy();
      expect(sp.world?.b).toBe(sp.semi.winner);
    }
    expect((st as any)._kopct2 && (st as any)._koect2).toBeTruthy();
    expect((st as any)._psb1 && (st as any)._psb2).toBeTruthy();
    expect((st as any)._thirdpwt1 && (st as any)._thirdpct1 && (st as any)._thirdect1).toBeTruthy();
    console.log("news", st.inbox.filter(m => m.kind === "news").map(m => m.title).slice(0, 14));
    console.log("bag", JSON.stringify(st.player.bag), "titles", st.player.titles);
    console.log("player matches", matches, "draws shown", draws, "season", st.season, dateLabel(st.day));
    console.log("history", JSON.stringify(st.player.history));
    expect(st.season).toBe(3);
    expect(cupChampions.length).toBeGreaterThanOrEqual(9);
    expect(st.player.history.length).toBe(2);
  }, 400000);
});
