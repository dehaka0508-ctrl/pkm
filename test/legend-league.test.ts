import { it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { buildQual, pctEntrants, qualified } from "../src/game/pwt";
import { REGIONS } from "../src/data/dex";
import { Rng } from "../src/game/rng";
import { advanceWithRegistration as advance } from "./registered-advance";
import type { Simulator } from "../src/game/season";
import { recordPlayerGame } from "../src/game/season";
import { candidateToOwned } from "../src/game/state";
import { rollCandidate } from "../src/game/scouting";
import { evolutionOptions } from "../src/game/moves";
it("qualification", () => {
  const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "x" });
  const prev = JSON.parse(JSON.stringify(st.prev));
  const sinnoh = prev.tables.sinnoh, kalos = prev.tables.kalos;
  prev.champion = sinnoh[0].id; // in 신오 top 3 → 신오 4th goes
  prev.pctChampion = kalos[5].id; // outside top 3
  prev.cupWinners = Object.fromEntries(REGIONS.map(r => [r.id, prev.tables[r.id][7].id]));
  const q = buildQual(prev, 2, new Rng("x"));
  expect(qualified(q).length).toBe(32);
  expect(new Set(qualified(q)).size).toBe(32);
  expect(q.direct).toContain(sinnoh[3].id);
  expect(q.direct).toContain(kalos[5].id);
  expect(q.po.ties.length).toBe(0);
  const p = pctEntrants(prev, 2, qualified(q));
  expect(p.order.length).toBe(32);
  expect(new Set(p.order).size).toBe(32);
  expect(p.order.some(id => qualified(q).includes(id))).toBe(false);
  for (const r of REGIONS) expect(p.order).toContain(prev.cupWinners[r.id]);
  console.log("PWT seeds", Object.values(q.seeds).slice(0, 6).join(" | "), "… PCT", p.order.slice(0, 4).map(id => p.seeds[id]).join(" | "));
});
const fake: Simulator = async jobs => jobs.map(j => { const r = new Rng(j.seed); const w = r.chance(0.5) ? 0 : 1; const rem = [0, 0]; rem[w] = r.int(1, 3); return { winner: w, remaining: rem, turns: 5, picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as any; });
it("old save without 레전드 keeps running and the league joins", async () => {
  const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "x" });
  for (let i = 0; i < 60 && (st.leagues.kanto.nextRound || 0) < 3; i++) { const r = await advance(st, fake); if (r.type === "match") recordPlayerGame(st, (await fake([{ seed: "o" + i } as any]))[0]); }
  const old = JSON.parse(JSON.stringify(st));
  delete old.leagues.legend; delete old.prev.tables.legend;
  for (const k of Object.keys(old.npcs || {})) if (k.startsWith("legend-")) delete old.npcs[k];
  const s = migrate(old);
  expect(s.leagues.legend.teams.length).toBe(20);
  const start = s.season;
  for (let i = 0; i < 4000 && s.season === start; i++) { const r = await advance(s, fake); if (r.type === "match") recordPlayerGame(s, (await fake([{ seed: "p" + i } as any]))[0]); }
  expect(s.season).toBe(start + 1);
  expect(s.prev.tables.legend.length).toBe(20);
  expect(qualified(s.qual ?? buildQual(s.prev, s.season, new Rng("q"))).length).toBe(32);
}, 600000);

it("레전드 starters grow into Hisui forms; others never do", () => {
  const c = rollCandidate(new Rng("h"), "legend", { level: 5, facility: 3, expires: 0, species: "Cyndaquil" });
  const m = candidateToOwned(c, 1);
  expect(m.hisuian).toBe(true);
  expect(evolutionOptions("quilava", 40, true).map(e => e.id)).toEqual(["typhlosionhisui"]);
  expect(evolutionOptions("quilava", 40, false).map(e => e.id)).toEqual(["typhlosion"]);
  expect(evolutionOptions("petilil", 40, false).map(e => e.id)).toEqual(["lilligant"]);
  const other = candidateToOwned(rollCandidate(new Rng("j"), "johto", { level: 5, facility: 3, expires: 0, species: "Cyndaquil" }), 1);
  expect(other.hisuian).toBeFalsy();
});

it("a trainer that starts with seven brings six and keeps the seventh", async () => {
  const { npcRoster, npcTeam } = await import("../src/game/npc");
  const lav = allTrainers().find(t => t.name === "라벤박사")!;
  expect(lav.team.length).toBe(7);
  const st = createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "그린")!.id, name: "x" });
  expect(npcRoster(st, lav.id).length).toBeGreaterThanOrEqual(7);
  expect(npcTeam(st, lav.id).length).toBe(6);
  const me = createGame({ mode: "trainer", slotId: lav.id, name: "x" });
  expect(me.player.squad.length).toBe(7);
  expect(me.player.entry.length).toBe(6);
});
