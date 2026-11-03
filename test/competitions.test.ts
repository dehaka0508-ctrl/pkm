import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { advance, recordPlayerGame, type Simulator } from "../src/game/season";
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
    const days = ev.filter(e => !["groupDraw", "cupDraw", "koDraw", "po"].includes(e.kind)).map(e => e.day);
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
        expect(Object.keys(c.ties).length).toBe(19);
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
        console.log("s2 qual po", st.qual!.po.entrants.length, "byes", st.qual!.po.byes.length, "ties", st.qual!.po.ties.length, "champ", st.prev.champion);
      }
    }
    const pct = (st as any).pct;
    console.log("pct s3", pct?.entrants.length, pct && pct.pots.map((p: string[]) => p.map((id: string) => pct.seeds[id]).join(", ")));
    console.log("supers", st.supers?.season, Object.keys(st.supers?.regional || {}).length, !!st.supers?.world?.winner);
    console.log("news", st.inbox.filter(m => m.kind === "news").map(m => m.title).slice(0, 14));
    console.log("bag", JSON.stringify(st.player.bag), "titles", st.player.titles);
    console.log("player matches", matches, "draws shown", draws, "season", st.season, dateLabel(st.day));
    console.log("history", JSON.stringify(st.player.history));
    expect(st.season).toBe(3);
    expect(cupChampions.length).toBeGreaterThanOrEqual(9);
    expect(st.player.history.length).toBe(2);
  }, 120000);
});
