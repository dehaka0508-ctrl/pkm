// Day-by-day game loop: league Sundays, PWT / cup Wednesdays, draws on Mondays,
// weekly training · scouting · finances on Sundays, season rollover on Aug 1 (August = preseason).
import type { MatchResult, SideConfig } from "../battle/engine";
import { REGIONS, koSpecies, regionById } from "../data/dex";
import { CUP_ROUND_NAMES, KO_ROUND_NAMES, LEAGUE_ROUNDS, dateLabel, dateOf, eventsOn, seasonEvents, seasonStart, weekdayOf, type CalEvent } from "./calendar";
import { applyResult, rankOf, standings, type Fixture } from "./league";
import { resolveTeam, roleSkill, trainerById } from "./lineups";
import {
  buildQual,
  drawPwtKnockout,
  ensureFinal,
  ensureKoRound,
  groupIndex,
  groupTable,
  pwtAlive,
  pwtResult,
  qualDone,
  startPct,
  startPwt,
  type PrevSeason,
  type PwtState,
} from "./pwt";
import { addItem, itemName } from "./shop";
import { CUP_STAGE_NAME, ROUND_KEYS, cupAlive, cupPath, cupResult, ensureCupFinal, ensureCupRound, makeCup } from "./cup";
import { GROUP_NAMES, type DrawData } from "./draw";
import { addGame, needsGame, newTie, nextHome, tieText, type Tie } from "./tie";
import { financeWeek, LEAGUE_PRIZE, onMatchResult } from "./finance";
import { scoutWeek } from "./scouting";
import { judgeObjectives, sponsorDay, sponsorOffersEvent, sponsorSeasonStart } from "./sponsor";
import { awardTicket, endLoans, expireTickets } from "./legend";
import { npcDay, npcFame, npcGame, npcJudge, npcLeagueEnd, npcPrize, npcRecruit, npcSeasonStart, npcTeam, npcWeek } from "./npc";
import { roundOfKey } from "./cup";
import { gainExp, trainWeek } from "./training";
import type { GameState, PendingMatch, TieRef } from "./state";
import { displayName, entryTeam, makeLeagues, pushMsg, rngFor } from "./state";

export interface SimJob {
  p1: SideConfig;
  p2: SideConfig;
  seed: string;
}
export type Simulator = (jobs: SimJob[], onProgress?: (done: number, total: number) => void) => Promise<MatchResult[]>;

export type AdvanceResult =
  | { type: "match"; pending: PendingMatch }
  | { type: "day"; summary: string[]; day: number }
  | { type: "draw"; draws: DrawData[]; summary: string[] };

export function sideFor(state: GameState, id: string): SideConfig {
  if (id === state.player.slotId) {
    return { name: state.player.name, team: entryTeam(state), gimmick: state.player.gimmick, skill: 0.85 };
  }
  const t = trainerById(id);
  if (!t) throw new Error(`unknown trainer id: ${id}`);
  return { name: t.name, team: npcTeam(state, id), gimmick: t.gimmick, skill: roleSkill(t.role) };
}

// ---------- match slots ----------

type Slot =
  | { kind: "fx"; f: Fixture; tag: string; label: string }
  | { kind: "tie"; t: Tie; leg: number; tag: string; label: string; ref: TieRef };

export function findTie(state: GameState, ref: TieRef): Tie | undefined {
  switch (ref.kind) {
    case "po":
      return state.qual?.po.ties[ref.idx];
    case "ko":
      return state.pwt?.ko[ref.round]?.[ref.idx];
    case "pwtFinal":
      return state.pwt?.final;
    case "cup":
      return state.cups?.[ref.region]?.ties[ref.key];
    case "pctKo":
      return state.pct?.ko[ref.round]?.[ref.idx];
    case "pctFinal":
      return state.pct?.final;
    case "super":
      return state.supers?.regional[ref.region];
    case "world":
      return state.supers?.world ?? undefined;
  }
}

const tourOf = (state: GameState, pct: boolean) => (pct ? state.pct : state.pwt);

const legName = (leg: number) => `${leg + 1}차전`;

function eventSlots(state: GameState, ev: CalEvent): Slot[] {
  const out: Slot[] = [];
  switch (ev.kind) {
    case "league":
      for (const r of REGIONS)
        (state.leagues[r.id].rounds[ev.round] || []).forEach((f, i) => out.push({ kind: "fx", f, tag: `L${ev.round}:${r.id}:${i}`, label: `${r.name} 리그 ${ev.round + 1}라운드` }));
      break;
    case "group":
    case "pctGroup": {
      const T = tourOf(state, ev.kind === "pctGroup");
      const name = ev.kind === "pctGroup" ? "PCT" : "PWT";
      if (T) T.fixtures[ev.md].forEach((f, i) => out.push({ kind: "fx", f, tag: `${name}G${ev.md}:${i}`, label: `${name} 조별리그 ${ev.md + 1}차전 (${GROUP_NAMES[groupIndex(T, f.home)]}조)` }));
      break;
    }
    case "superCup":
      for (const r of REGIONS) {
        const t = state.supers?.regional[r.id];
        if (t) out.push({ kind: "tie", t, leg: 0, tag: `SC${r.id}`, label: `${r.name} 슈퍼컵`, ref: { kind: "super", region: r.id, leg: 0 } });
      }
      break;
    case "worldSuper": {
      const t = state.supers?.world;
      if (t) out.push({ kind: "tie", t, leg: 0, tag: "WSC", label: "월드 슈퍼컵", ref: { kind: "world", leg: 0 } });
      break;
    }
    case "po":
      state.qual?.po.ties.forEach((t, idx) => out.push({ kind: "tie", t, leg: 0, tag: `PO${state.qual!.season}:${idx}`, label: "PWT 플레이오프", ref: { kind: "po", idx, leg: 0 } }));
      break;
    case "cup":
      for (const r of REGIONS) {
        const cup = state.cups?.[r.id];
        if (!cup) continue;
        ensureCupRound(cup, ev.round);
        for (const w of [0, 1])
          for (const key of ROUND_KEYS[ev.round]) {
            const k = `${w}${key}`;
            const t = cup.ties[k];
            if (t) out.push({ kind: "tie", t, leg: ev.leg, tag: `C${r.id}:${k}`, label: `${r.name} 컵 ${CUP_ROUND_NAMES[ev.round]} ${legName(ev.leg)}`, ref: { kind: "cup", region: r.id, key: k, leg: ev.leg } });
          }
      }
      break;
    case "cupFinal":
      for (const r of REGIONS) {
        const cup = state.cups?.[r.id];
        const t = cup && ensureCupFinal(cup);
        if (t) out.push({ kind: "tie", t, leg: 0, tag: `CF${r.id}`, label: `${r.name} 컵 결승 (3판 2선승)`, ref: { kind: "cup", region: r.id, key: "F", leg: 0 } });
      }
      break;
    case "ko":
    case "pctKo": {
      const pct = ev.kind === "pctKo";
      const T = tourOf(state, pct);
      const ties = T && ensureKoRound(T, ev.round);
      (ties || []).forEach((t, idx) =>
        out.push({ kind: "tie", t, leg: ev.leg, tag: `${pct ? "PCT" : ""}K${ev.round}:${idx}`, label: `${pct ? "PCT" : "PWT"} ${KO_ROUND_NAMES[ev.round]} ${legName(ev.leg)}`, ref: pct ? { kind: "pctKo", round: ev.round, idx, leg: ev.leg } : { kind: "ko", round: ev.round, idx, leg: ev.leg } }),
      );
      break;
    }
    case "pwtFinal":
    case "pctFinal": {
      const pct = ev.kind === "pctFinal";
      const T = tourOf(state, pct);
      const t = T && ensureFinal(T);
      if (t) out.push({ kind: "tie", t, leg: 0, tag: pct ? "CF" : "PF", label: `${pct ? "PCT" : "PWT"} 결승 (3판 2선승)`, ref: pct ? { kind: "pctFinal", leg: 0 } : { kind: "pwtFinal", leg: 0 } });
      break;
    }
  }
  return out;
}

const involves = (s: Slot, id: string) => (s.kind === "fx" ? s.f.home === id || s.f.away === id : s.t.a === id || s.t.b === id);
const slotOpen = (s: Slot) => (s.kind === "fx" ? !s.f.result : needsGame(s.t, s.leg));

function makePending(state: GameState, s: Slot): PendingMatch {
  const me = state.player.slotId;
  if (s.kind === "fx") {
    const home = s.f.home === me;
    return { comp: "fx", label: s.label, opponent: home ? s.f.away : s.f.home, home, games: [] };
  }
  const isA = s.t.a === me;
  const h = nextHome(s.t);
  return { comp: "tie", tie: s.ref, label: s.label, opponent: isA ? s.t.b : s.t.a, home: h === (isA ? 0 : 1), games: [] };
}

export function pendingDecided(state: GameState): boolean {
  const p = state.pending;
  if (!p) return false;
  if (p.comp === "fx") return p.games.length >= 1;
  const t = findTie(state, p.tie!);
  return !t || !needsGame(t, p.tie!.leg);
}

/** Score line of the player's current tie (for the match screen). */
export function pendingInfo(state: GameState): string {
  const p = state.pending;
  if (!p || p.comp !== "tie") return "";
  const t = findTie(state, p.tie!);
  if (!t || !t.games.length) return "";
  const me = state.player.slotId;
  if (t.format === "bo3") return `현재 ${tieText(t, me)}`;
  if (t.format === "two-leg") return `${t.games.length >= 2 ? "1·2차전" : "1차전"} ${tieText(t, me)}`;
  return "";
}

/** Records one game of the player's match (player is always side 0 in the result). */
export function recordPlayerGame(state: GameState, r: MatchResult, logs: string[] = []) {
  const p = state.pending;
  if (!p) return;
  p.games.push({ w: r.winner, my: r.remaining[0], opp: r.remaining[1] });
  if (p.comp === "tie") {
    const t = findTie(state, p.tie!);
    if (t) {
      const isA = t.a === state.player.slotId;
      addGame(t, {
        w: r.winner === -1 ? -1 : (r.winner === 0) === isA ? 0 : 1,
        ra: isA ? r.remaining[0] : r.remaining[1],
        rb: isA ? r.remaining[1] : r.remaining[0],
      });
      const h = nextHome(t);
      p.home = h === (isA ? 0 : 1);
    }
  }
  const team = entryTeam(state);
  r.picks[0].forEach(i => {
    const m = team[i];
    if (!m) return;
    m.record.played++;
    if (r.winner === 0) m.record.wins++;
    m.record.kos += r.kos[0][i] || 0;
    gainExp(m, r.winner === 0 ? 130 : 80, logs);
  });
  if (logs.length) pushMsg(state, "train", "경기 경험치", logs.join("\n"));
}

async function simSlots(state: GameState, slots: Slot[], sim: Simulator, onProgress?: (d: number, t: number) => void) {
  for (let iter = 0; iter < 12; iter++) {
    const todo = slots.filter(slotOpen);
    if (!todo.length) return;
    const jobs: SimJob[] = todo.map(s => {
      if (s.kind === "fx") return { p1: sideFor(state, s.f.home), p2: sideFor(state, s.f.away), seed: `${state.seed}:${state.day}:${s.tag}` };
      const h = nextHome(s.t);
      const [x, y] = h === 1 ? [s.t.b, s.t.a] : [s.t.a, s.t.b];
      return { p1: sideFor(state, x), p2: sideFor(state, y), seed: `${state.seed}:${state.day}:${s.tag}:${s.t.games.length}` };
    });
    const res = await sim(jobs, iter === 0 ? onProgress : undefined);
    todo.forEach((s, i) => {
      const r = res[i];
      if (s.kind === "fx") s.f.result = { h: r.remaining[0], a: r.remaining[1], w: r.winner };
      else if (nextHome(s.t) === 1) addGame(s.t, { w: r.winner === -1 ? -1 : r.winner === 0 ? 1 : 0, ra: r.remaining[1], rb: r.remaining[0] });
      else addGame(s.t, { w: r.winner, ra: r.remaining[0], rb: r.remaining[1] });
    });
  }
}

interface Ctx {
  logs: string[];
  played: boolean;
  onProgress?: (d: number, t: number) => void;
}

/** Plays every game of an event. Returns a stop when the player has to play first. */
/** Prize money for winning a tie (same amounts the player gets). */
function tiePrize(ref: TieRef): number {
  switch (ref.kind) {
    case "po":
      return 10000;
    case "ko":
      return 20000 * (ref.round + 1);
    case "pwtFinal":
      return 200000;
    case "cup":
      return ref.key === "F" ? 80000 : 10000 * (roundOfKey(ref.key.slice(1)) + 1);
    case "pctKo":
      return 10000 * (ref.round + 1);
    case "pctFinal":
      return 100000;
    case "super":
      return 30000;
    case "world":
      return 60000;
  }
}

/** NPC side of the games just played: gate money, fans, fame, win bonuses, tie prizes. */
function npcAfter(state: GameState, slots: Slot[], before: { done: boolean; games: number; winner?: string }[]) {
  const me = state.player.slotId;
  slots.forEach((s, i) => {
    if (involves(s, me)) return; // the player's games are settled with the player's own result
    const b = before[i];
    if (s.kind === "fx") {
      const r = s.f.result;
      if (b.done || !r) return;
      npcGame(state, s.f.home, true, r.w === -1 ? -1 : r.w === 0 ? 0 : 1);
      npcGame(state, s.f.away, false, r.w === -1 ? -1 : r.w === 1 ? 0 : 1);
      const bonus = s.tag.startsWith("PWTG") ? 8000 : s.tag.startsWith("PCTG") ? 4000 : 0;
      if (bonus && r.w !== -1) npcPrize(state, r.w === 0 ? s.f.home : s.f.away, bonus);
      return;
    }
    for (const g of s.t.games.slice(b.games)) {
      npcGame(state, s.t.a, g.home === 0, g.w === -1 ? -1 : g.w === 0 ? 0 : 1);
      npcGame(state, s.t.b, g.home === 1, g.w === -1 ? -1 : g.w === 1 ? 0 : 1);
    }
    if (!b.winner && s.t.winner) npcPrize(state, s.t.winner, tiePrize(s.ref));
  });
}

async function runMatches(state: GameState, slots: Slot[], sim: Simulator, ctx: Ctx): Promise<AdvanceResult | null> {
  const me = state.player.slotId;
  const mine = slots.find(s => involves(s, me));
  const before = slots.map(s => (s.kind === "fx" ? { done: !!s.f.result, games: 0 } : { done: false, games: s.t.games.length, winner: s.t.winner }));
  if (mine) {
    if (slotOpen(mine)) {
      if (!state.pending) {
        state.pending = makePending(state, mine);
        return { type: "match", pending: state.pending };
      }
      if (!pendingDecided(state)) return { type: "match", pending: state.pending };
      if (mine.kind === "fx") {
        const g = state.pending.games[0];
        const home = mine.f.home === me;
        mine.f.result = home ? { h: g.my, a: g.opp, w: g.w } : { h: g.opp, a: g.my, w: g.w === -1 ? -1 : g.w === 0 ? 1 : 0 };
      }
    }
    const p = state.pending;
    if (p) {
      const neutral = mine.kind === "tie" && mine.t.format === "bo3";
      for (const g of p.games) {
        onMatchResult(state, p.home, g.w, ctx.logs);
        npcGame(state, p.opponent, !p.home && !neutral, g.w === -1 ? -1 : g.w === 0 ? 1 : 0);
      }
      if (mine.kind === "tie" && mine.t.winner && mine.t.winner !== me) npcPrize(state, mine.t.winner, tiePrize(mine.ref));
      if (mine.kind === "fx" && mine.f.result && mine.f.result.w !== -1) {
        const oppWon = (mine.f.result.w === 0) !== (mine.f.home === me);
        const bonus = mine.tag.startsWith("PWTG") ? 8000 : mine.tag.startsWith("PCTG") ? 4000 : 0;
        if (oppWon) npcPrize(state, p.opponent, bonus);
      }
      state.pending = null;
    }
    ctx.played = true;
  }
  await simSlots(state, slots, sim, ctx.onProgress);
  npcAfter(state, slots, before);
  return null;
}

function tieLog(state: GameState, s: Slot & { kind: "tie" }, ctx: Ctx, prize: number, final = false) {
  const me = state.player.slotId;
  const t = s.t;
  const opp = displayName(state, t.a === me ? t.b : t.a);
  if (!t.winner) {
    ctx.logs.unshift(`${s.label} vs ${opp} — ${tieText(t, me)}`);
    return;
  }
  const won = t.winner === me;
  ctx.logs.unshift(`${s.label} vs ${opp} — ${tieText(t, me)} · ${won ? (final ? "우승!" : "다음 라운드 진출") : final ? "준우승" : "탈락"}`);
  if (won && prize) {
    state.player.money += prize;
    ctx.logs.push(`상금 ₽${prize.toLocaleString()}`);
  }
}

function fxLog(state: GameState, s: Slot & { kind: "fx" }, ctx: Ctx, extra = "") {
  const me = state.player.slotId;
  const f = s.f;
  if (!f.result) return;
  const home = f.home === me;
  const my = home ? f.result.h : f.result.a;
  const op = home ? f.result.a : f.result.h;
  const w = f.result.w === -1 ? "무승부" : (f.result.w === 0) === home ? "승리" : "패배";
  ctx.logs.unshift(`${s.label} vs ${displayName(state, home ? f.away : f.home)} — ${w} (${my}:${op})${extra}`);
}

// ---------- events ----------

async function processEvent(state: GameState, ev: CalEvent, sim: Simulator, ctx: Ctx): Promise<AdvanceResult | null> {
  const me = state.player.slotId;
  const p = state.player;
  switch (ev.kind) {
    case "sponsorOffers":
      sponsorOffersEvent(state);
      return null;
    case "po": {
      // August preseason playoff for this season's PWT, from last season's tables
      const target = state.season;
      if (!state.qual || state.qual.season !== target) {
        const prev = state.prev;
        state.qual = buildQual(prev, target, rngFor(state, "po"));
        const q = state.qual;
        const myPo = q.po.ties.find(t => t.a === me || t.b === me);
        if (q.direct.includes(me)) pushMsg(state, "pwt", `시즌 ${target} PWT 직행 확정`, `${q.seeds[me]} 자격으로 다음 PWT 조별리그에 나갑니다.`);
        else if (q.po.byes.includes(me)) pushMsg(state, "pwt", "PWT 플레이오프 부전승", "4위 중 전 시즌 승점이 가장 높아 부전승으로 PWT에 나갑니다.");
        else if (myPo) pushMsg(state, "pwt", "PWT 플레이오프 대진", `${displayName(state, myPo.a === me ? myPo.b : myPo.a)}와(과) 단판 승부. 이기면 PWT 조별리그에 나갑니다.`);
        if (q.po.entrants.includes(me)) return { type: "draw", draws: [q.po.draw], summary: [] };
      }
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 10000);
      return null;
    }
    case "groupDraw": {
      if (state.pwt && state.pwt.season === state.season) return null;
      if (!state.qual || state.qual.season !== state.season) state.qual = buildQual(state.prev, state.season, rngFor(state, "po"));
      if (!qualDone(state.qual)) {
        const slots = state.qual.po.ties.map((t, idx) => ({ kind: "tie" as const, t, leg: 0, tag: `PO${idx}`, label: "PWT 플레이오프", ref: { kind: "po" as const, idx, leg: 0 } }));
        await simSlots(state, slots, sim);
      }
      state.pwt = startPwt(state.qual, state.prev, rngFor(state, "groups"));
      const gi = groupIndex(state.pwt, me);
      if (gi >= 0) {
        const others = state.pwt.groups[gi].filter(x => x !== me).map(x => displayName(state, x));
        pushMsg(state, "pwt", `PWT 조 추첨: ${GROUP_NAMES[gi]}조`, `같은 조: ${others.join(", ")}\n조 2위 안에 들면 1월 토너먼트에 나갑니다.`);
      } else pushMsg(state, "pwt", "PWT 조 추첨 완료", "이번 시즌 PWT에는 나가지 못합니다.");
      return { type: "draw", draws: [state.pwt.groupDraw], summary: [] };
    }
    case "cupDraw": {
      if (state.cups && Object.values(state.cups)[0]?.season === state.season) return null;
      const cups: GameState["cups"] = {};
      for (const r of REGIONS) {
        const lg = state.leagues[r.id];
        cups[r.id] = makeCup(r.id, state.season, lg.teams, state.prev.tables[r.id], state.season === 1, rngFor(state, `cup:${r.id}`));
      }
      state.cups = cups;
      const mine = cups[p.region];
      const slot = Object.entries(mine.ties).find(([, t]) => t.a === me || t.b === me);
      if (slot) {
        const [key, t] = slot;
        const when = key.endsWith("E") ? "12월" : "10월";
        pushMsg(state, "info", `${regionById(p.region).name} 컵 대진 추첨`, `${key.startsWith("0") ? "A" : "B"}윙 ${key.slice(1)} 자리 · 첫 상대: ${displayName(state, t.a === me ? t.b : t.a)} (${when})`);
      }
      return { type: "draw", draws: [mine.draw], summary: [] };
    }
    case "koDraw":
    case "pctKoDraw": {
      const pct = ev.kind === "pctKoDraw";
      const T = tourOf(state, pct);
      if (!T || T.koDraw) return null;
      drawPwtKnockout(T, rngFor(state, pct ? "pctko" : "ko"));
      const t = T.ko[0].find(x => x.a === me || x.b === me);
      if (t) pushMsg(state, "pwt", `${T.name} 16강 추첨`, `상대: ${displayName(state, t.a === me ? t.b : t.a)} (1월 ${t.a === me ? "1차전 홈" : "2차전 홈"})`);
      if (pct && !T.entrants.includes(me)) return null;
      return { type: "draw", draws: [T.koDraw!], summary: [] };
    }
    case "pctDraw": {
      if (state.pct && state.pct.season === state.season) return null;
      if (!state.pwt) return null;
      state.pct = startPct(state.prev, state.season, state.pwt.entrants, rngFor(state, "pct"));
      const gi = groupIndex(state.pct, me);
      if (gi < 0) return null;
      const others = state.pct.groups[gi].filter(x => x !== me).map(x => displayName(state, x));
      pushMsg(state, "pwt", `PCT 조 추첨: ${GROUP_NAMES[gi]}조`, `${state.pct.seeds[me]} 자격으로 포켓몬 챌린지 토너먼트(PCT)에 나갑니다.\n같은 조: ${others.join(", ")}`);
      return { type: "draw", draws: [state.pct.groupDraw], summary: [] };
    }
    case "superCup":
    case "worldSuper": {
      prepareSupers(state);
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const label = ev.kind === "superCup" ? `${regionById(p.region).name} 슈퍼컵` : "월드 슈퍼컵";
      if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx, ev.kind === "superCup" ? 30000 : 60000, true);
        if (mine.t.winner === me) p.titles.push(`시즌 ${state.season} ${label} 우승`);
      }
      if (ev.kind === "superCup") {
        news(state, `시즌 ${state.season} 지방 슈퍼컵 결과`, REGIONS.map(r => {
          const t = state.supers!.regional[r.id];
          return t ? `${r.name}: ${displayName(state, t.winner!)} 우승 (${displayName(state, t.a)} vs ${displayName(state, t.b)}, ${tieText(t)})` : "";
        }).filter(Boolean).join("\n"));
      } else if (state.supers?.world?.winner) {
        const t = state.supers.world;
        news(state, `월드 슈퍼컵: ${displayName(state, t.winner!)} 우승`, `PWT 챔피언 ${displayName(state, t.a)} vs PCT 챔피언 ${displayName(state, t.b)} — ${tieText(t)}`);
      }
      return null;
    }
    case "league": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      for (const r of REGIONS) {
        const lg = state.leagues[r.id];
        for (const f of lg.rounds[ev.round] || []) applyResult(lg.table, f);
        lg.nextRound = ev.round + 1;
      }
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "fx") fxLog(state, mine, ctx, `, 현재 ${rankOf(state.leagues[p.region], me)}위`);
      if (ev.round === LEAGUE_ROUNDS - 1) leagueEnd(state, ctx.logs);
      return null;
    }
    case "group":
    case "pctGroup": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const pwt = tourOf(state, ev.kind === "pctGroup")!;
      const N = pwt.name || "PWT";
      const bonus = N === "PCT" ? 4000 : 8000;
      if (mine && mine.kind === "fx") {
        const gi = groupIndex(pwt, me);
        const rank = groupTable(pwt, gi).findIndex(r => r.id === me) + 1;
        fxLog(state, mine, ctx, `, ${GROUP_NAMES[gi]}조 ${rank}위`);
        const f = mine.f;
        if (f.result && f.result.w !== -1 && (f.result.w === 0) === (f.home === me)) {
          p.money += bonus;
          ctx.logs.push(`${N} 승리 수당 ₽${bonus.toLocaleString()}`);
        }
        if (ev.md === 5) {
          const adv = rank <= 2;
          pushMsg(state, "pwt", adv ? `${N} 조별리그 통과 (${GROUP_NAMES[gi]}조 ${rank}위)` : `${N} 조별리그 탈락 (${GROUP_NAMES[gi]}조 ${rank}위)`, adv ? "1월 첫 월요일에 토너먼트 대진을 추첨합니다." : "");
          if (adv) p.reputation = Math.min(100, p.reputation + 3);
        }
      }
      return null;
    }
    case "cup":
    case "cupFinal": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (ev.kind === "cupFinal") {
        for (const r of REGIONS) {
          const cup = state.cups?.[r.id];
          if (cup?.ties.F?.winner) cup.champion = cup.ties.F.winner;
        }
        for (const r of REGIONS) npcFame(state, state.cups?.[r.id]?.champion, 6);
        npcJudge(state, "cup");
        const champ = state.cups?.[p.region]?.champion;
        news(state, `시즌 ${state.season} 지방 컵 우승자`, REGIONS.map(r => `${r.name} 컵: ${state.cups?.[r.id]?.champion ? displayName(state, state.cups[r.id].champion!) : "-"}`).join("\n"));
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 80000, true);
        if (champ === me) {
          p.titles.push(`시즌 ${state.season} ${regionById(p.region).name} 컵 우승`);
          p.reputation = Math.min(100, p.reputation + 6);
          award(state, "cap:silver", `${regionById(p.region).name} 컵`);
        }
        judgeObjectives(state, "cup", ctx.logs);
      } else if (mine && mine.kind === "tie" && (ev.leg === 1 || mine.t.winner)) {
        tieLog(state, mine, ctx, 10000 * (ev.round + 1));
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "info", `${regionById(p.region).name} 컵 ${CUP_ROUND_NAMES[ev.round]} 탈락`, tieText(mine.t, me));
      } else if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 0);
      return null;
    }
    case "ko":
    case "pctKo":
    case "pwtFinal":
    case "pctFinal": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const pct = ev.kind === "pctKo" || ev.kind === "pctFinal";
      const T = tourOf(state, pct);
      const N = pct ? "PCT" : "PWT";
      if (ev.kind === "pwtFinal" || ev.kind === "pctFinal") {
        if (T?.final?.winner) {
          T.champion = T.final.winner;
          news(state, `${N} 우승: ${displayName(state, T.champion)}`, `${T.seeds[T.champion] || ""} 자격으로 나선 ${displayName(state, T.champion)}이(가) ${pct ? "포켓몬 챌린지 토너먼트" : "포켓몬 월드 토너먼트"} 정상에 올랐습니다. 결승 ${displayName(state, T.final.a)} vs ${displayName(state, T.final.b)} ${tieText(T.final)}.`);
        }
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, pct ? 100000 : 200000, true);
        npcFame(state, T?.champion, pct ? 8 : 15);
        if (!pct && T?.champion && T.champion !== me) npcRecruit(state, T.champion, "all", "PWT");
        if (!pct) npcJudge(state, "europe");
        if (T?.champion === me) {
          p.titles.push(`시즌 ${state.season} ${N} 우승`);
          p.reputation = Math.min(100, p.reputation + (pct ? 8 : 15));
          award(state, pct ? "cap:silver" : "cap:gold", N);
          if (!pct) awardTicket(state, "both", "all", N);
        }
        if (!pct) judgeObjectives(state, "europe", ctx.logs);
        if (!pct) {
          multiTitleNews(state);
          seasonRecord(state);
        }
      } else if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx, ev.leg === 1 || mine.t.winner ? (pct ? 10000 : 20000) * (ev.round + 1) : 0);
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "pwt", `${N} ${KO_ROUND_NAMES[ev.round]} 탈락`, tieText(mine.t, me));
      }
      return null;
    }
  }
}

function leagueEnd(state: GameState, logs: string[]) {
  const p = state.player;
  const lg = state.leagues[p.region];
  const rank = rankOf(lg, p.slotId);
  const prize = LEAGUE_PRIZE(rank);
  p.money += prize;
  const champ = standings(lg)[0];
  const next = rank <= 3 ? "다음 시즌 PWT 조별리그 직행" : rank === 4 ? "8월 PWT 플레이오프 출전" : "다음 시즌 PWT 출전권 없음";
  pushMsg(state, "info", `${regionById(p.region).name} 리그 종료: ${rank}위`, `상금 ₽${prize.toLocaleString()}을 받았습니다. 우승: ${displayName(state, champ.id)}\n${next}`);
  if (rank === 1) {
    p.titles.push(`시즌 ${state.season} ${regionById(p.region).name} 리그 우승`);
    p.reputation = Math.min(100, p.reputation + 10);
    award(state, "cap:silver", `${regionById(p.region).name} 리그`);
    awardTicket(state, "both", p.region, `${regionById(p.region).name} 리그`);
  }
  judgeObjectives(state, "league", logs);
  npcLeagueEnd(state);
  news(state, `시즌 ${state.season} 지방 리그 우승자`, REGIONS.map(r => {
    const top = standings(state.leagues[r.id])[0];
    return `${r.name}: ${displayName(state, top.id)} (승점 ${top.pts})`;
  }).join("\n"));
  logs.unshift(`리그 최종 ${rank}위 · 상금 ₽${prize.toLocaleString()} · ${next}`);
}

function seasonRecord(state: GameState) {
  const p = state.player;
  if (p.history.some(h => h.season === state.season)) return;
  const lg = state.leagues[p.region];
  const row = standings(lg).find(r => r.id === p.slotId)!;
  const q = state.qual && state.qual.season === state.season ? state.qual : null;
  p.history.push({
    season: state.season,
    region: p.region,
    rank: rankOf(lg, p.slotId),
    pts: row.pts,
    w: row.w,
    d: row.d,
    l: row.l,
    pwt: pwtResult(state.pwt, q, p.slotId),
    cup: cupResult(state.cups?.[p.region], p.slotId),
    pct: state.pct?.entrants.includes(p.slotId) ? pwtResult(state.pct, null, p.slotId) : "-",
  });
}

function news(state: GameState, title: string, body = "") {
  pushMsg(state, "news", title, body);
}

/** Trophies are given to the player only (the rulebook says "to the winner"). */
function award(state: GameState, key: string, comp: string) {
  addItem(state, key);
  pushMsg(state, "info", `${comp} 우승 부상: ${itemName(key)}`, `${itemName(key)}을(를) 받았습니다. 스쿼드의 포켓몬 정보에서 사용할 수 있습니다.`);
}

/** Double / treble articles at the end of the season. */
function multiTitleNews(state: GameState) {
  const got = new Map<string, string[]>();
  const add = (id: string | undefined, t: string) => {
    if (!id) return;
    if (!got.has(id)) got.set(id, []);
    got.get(id)!.push(t);
  };
  for (const r of REGIONS) {
    add(standings(state.leagues[r.id])[0]?.id, `${r.name} 리그`);
    add(state.cups?.[r.id]?.champion, `${r.name} 컵`);
  }
  add(state.pct?.champion, "PCT");
  add(state.pwt?.champion, "PWT");
  for (const [id, list] of got) {
    if (list.length < 2) continue;
    const kind = list.length >= 3 ? (list.includes("PWT") ? "트레블" : "트레블 (PCT)") : list.includes("PWT") || list.includes("PCT") ? "더블" : "도메스틱 더블";
    const who = displayName(state, id);
    const mine = id === state.player.slotId;
    news(
      state,
      `[${kind}] ${who}, ${list.join("·")} 석권!`,
      `${who}이(가) 시즌 ${state.season}에 ${list.join(", ")} 우승을 모두 차지하며 ${kind}를 달성했습니다.${list.length >= 3 ? " 한 시즌 세 개의 트로피는 리그 역사에 남을 대기록입니다." : ""}${mine ? "\n팬들이 거리로 쏟아져 나와 우승 퍼레이드를 즐겼습니다!" : ""}`,
    );
    if (mine) {
      state.player.reputation = Math.min(100, state.player.reputation + (list.length >= 3 ? 10 : 4));
      state.player.fans += list.length >= 3 ? 2000 : 600;
    }
  }
}

/** Builds the super cup ties (late August) for the coming season. */
/** Builds this season's super cup ties (August preseason) from last season's winners. */
function prepareSupers(state: GameState) {
  const target = state.season;
  if (!state.supers || state.supers.season !== target) state.supers = { season: target, regional: {}, world: null };
  const sp = state.supers;
  const prev = state.prev;
  if (prev.virtual) return;
  for (const r of REGIONS) {
    if (sp.regional[r.id]) continue;
    const table = prev.tables[r.id] || [];
    const league = table[0]?.id;
    const cup = prev.cupWinners?.[r.id];
    if (!league) continue;
    const opp = cup && cup !== league ? cup : table[1]?.id;
    if (opp) sp.regional[r.id] = newTie(league, opp, "single");
  }
  if (!sp.world && prev.champion && prev.pctChampion) sp.world = newTie(prev.champion, prev.pctChampion, "single");
}

/** This season's final tables as seeding data for the next one. */
export function prevFromState(state: GameState): PrevSeason {
  const tables: PrevSeason["tables"] = {};
  for (const r of REGIONS) tables[r.id] = standings(state.leagues[r.id]).map((x, i) => ({ id: x.id, rank: i + 1, pts: x.pts, diff: x.diff, gf: x.gf ?? 0 }));
  const cupWinners: Record<string, string> = {};
  for (const r of REGIONS) {
    const c = state.cups?.[r.id]?.champion;
    if (c) cupWinners[r.id] = c;
  }
  return { season: state.season, virtual: false, tables, champion: state.pwt?.champion, pctChampion: state.pct?.champion, cupWinners };
}

function weekly(state: GameState, logs: string[]) {
  const p = state.player;
  const trainLogs: string[] = [];
  for (const m of p.squad) trainWeek(m, p.plan[m.uid] || "level", p.facilities.training, trainLogs);
  if (trainLogs.length) {
    logs.push(...trainLogs);
    pushMsg(state, "train", `${dateLabel(state.day, false)} 주간 훈련 결과`, trainLogs.join("\n"));
  }
  scoutWeek(state, rngFor(state, "scout"));
  financeWeek(state, logs);
  npcWeek(state);
}

function endDay(state: GameState, logs: string[]) {
  if (weekdayOf(state.day) === 6) weekly(state, logs);
  state.day++;
  state.dayStep = 0;
  if (state.day >= seasonStart(state.season + 1)) newSeason(state);
  sponsorDay(state, logs);
  npcDay(state);
  expireTickets(state);
}

function newSeason(state: GameState) {
  if (state.pwt) seasonRecord(state);
  state.prev = prevFromState(state);
  state.season++;
  state.leagues = makeLeagues(state.season, state.seed);
  state.pwt = null;
  state.pct = null;
  state.cups = null;
  sponsorSeasonStart(state);
  endLoans(state);
  npcSeasonStart(state);
  pushMsg(state, "info", `시즌 ${state.season} 프리시즌`, "8월 첫 월요일 스폰서 제의, 셋째 주 수요일 PWT 플레이오프, 마지막 주 슈퍼컵. 9월 첫 월요일 PWT 조 추첨, 첫 일요일 리그 개막입니다.");
}

/**
 * Advances day by day. Stops when the player has a match, a draw is held,
 * or (by default) after any day with fixtures or the weekly report on Sunday.
 * With `toMyNext`, keeps going until the player plays or a draw is held (max ~4 months).
 */
export async function advance(state: GameState, sim: Simulator, onProgress?: (d: number, t: number) => void, opts: { toMyNext?: boolean } = {}): Promise<AdvanceResult> {
  const ctx: Ctx = { logs: [], played: false, onProgress };
  const flush = () => {
    if (ctx.logs.length) state.lastWeekSummary = ctx.logs.slice(0, 40);
  };
  for (let guard = 0; guard < 130; guard++) {
    const evs = eventsOn(state.day);
    while (state.dayStep < evs.length) {
      const stop = await processEvent(state, evs[state.dayStep], sim, ctx);
      if (stop) {
        flush();
        return stop.type === "draw" ? { ...stop, summary: ctx.logs } : stop;
      }
      state.dayStep++;
    }
    const day = state.day;
    const sunday = weekdayOf(day) === 6;
    const hadMatches = evs.length > 0;
    endDay(state, ctx.logs);
    if (opts.toMyNext ? ctx.played : hadMatches || sunday) {
      flush();
      return { type: "day", summary: ctx.logs, day };
    }
  }
  flush();
  return { type: "day", summary: ctx.logs, day: state.day - 1 };
}

// ---------- player schedule (for the UI) ----------

export interface ScheduleRow {
  day: number;
  comp: "league" | "pwt" | "pct" | "cup";
  label: string;
  opp: string | null; // null = not decided yet
  home: boolean | null;
  result?: string;
  cls?: string;
}

function legResult(t: Tie, leg: number, me: string): { text: string; cls: string } | undefined {
  const legs = t.format === "two-leg" ? t.games.filter(g => !g.extra) : t.games;
  if (t.format !== "two-leg") {
    if (!t.winner) return undefined;
    return { text: `${t.winner === me ? "승" : "패"} ${tieText(t, me)}`, cls: t.winner === me ? "good" : "bad" };
  }
  const g = legs[leg];
  if (!g) return undefined;
  const isA = t.a === me;
  const my = isA ? g.ra : g.rb;
  const op = isA ? g.rb : g.ra;
  const won = g.w === -1 ? null : (g.w === 0) === isA;
  let text = `${won === null ? "무" : won ? "승" : "패"} ${my}:${op}`;
  if (leg === 1 && t.winner) text += t.winner === me ? " · 진출" : " · 탈락";
  return { text, cls: won === null ? "" : won ? "good" : "bad" };
}

export function playerSchedule(state: GameState): ScheduleRow[] {
  const me = state.player.slotId;
  const rows: ScheduleRow[] = [];
  const pwt = state.pwt;
  for (const ev of seasonEvents(state.season)) {
    switch (ev.kind) {
      case "league": {
        const f = state.leagues[state.player.region].rounds[ev.round]?.find(x => x.home === me || x.away === me);
        if (!f) break;
        const home = f.home === me;
        const row: ScheduleRow = { day: ev.day, comp: "league", label: `리그 ${ev.round + 1}R`, opp: home ? f.away : f.home, home };
        if (f.result) {
          const my = home ? f.result.h : f.result.a;
          const op = home ? f.result.a : f.result.h;
          const won = f.result.w === -1 ? null : (f.result.w === 0) === home;
          row.result = `${won === null ? "무" : won ? "승" : "패"} ${my}:${op}`;
          row.cls = won === null ? "" : won ? "good" : "bad";
        }
        rows.push(row);
        break;
      }
      case "po": {
        const q = state.qual;
        if (!q || q.season !== state.season) break;
        const t = q.po.ties.find(x => x.a === me || x.b === me);
        if (!t) break;
        const r = legResult(t, 0, me);
        rows.push({ day: ev.day, comp: "pwt", label: "PWT 플레이오프", opp: t.a === me ? t.b : t.a, home: t.a === me, result: r?.text, cls: r?.cls });
        break;
      }
      case "group":
      case "pctGroup": {
        const T = tourOf(state, ev.kind === "pctGroup");
        if (!T || !T.entrants.includes(me)) break;
        const f = T.fixtures[ev.md].find(x => x.home === me || x.away === me)!;
        const home = f.home === me;
        const row: ScheduleRow = { day: ev.day, comp: T.name === "PCT" ? "pct" : "pwt", label: `${T.name || "PWT"} 조별 ${ev.md + 1}차전`, opp: home ? f.away : f.home, home };
        if (f.result) {
          const my = home ? f.result.h : f.result.a;
          const op = home ? f.result.a : f.result.h;
          const won = f.result.w === -1 ? null : (f.result.w === 0) === home;
          row.result = `${won === null ? "무" : won ? "승" : "패"} ${my}:${op}`;
          row.cls = won === null ? "" : won ? "good" : "bad";
        }
        rows.push(row);
        break;
      }
      case "cup":
      case "cupFinal": {
        const cup = state.cups?.[state.player.region];
        if (!cup) break;
        const path = cupPath(cup, me);
        const keys = ev.kind === "cupFinal" ? ["F"] : ROUND_KEYS[ev.round].flatMap(k => ["0" + k, "1" + k]);
        const key = path.find(k => keys.includes(k));
        if (!key) break;
        const stage = CUP_STAGE_NAME[key.replace(/^\d/, "")];
        const label = ev.kind === "cupFinal" ? "컵 결승" : `컵 ${stage} ${legName(ev.leg)}`;
        const t = cup.ties[key];
        if (t && (t.a === me || t.b === me)) {
          const leg = ev.kind === "cupFinal" ? 0 : ev.leg;
          const r = legResult(t, leg, me);
          rows.push({ day: ev.day, comp: "cup", label, opp: t.a === me ? t.b : t.a, home: t.format === "bo3" ? null : leg === 0 ? t.a === me : t.b === me, result: r?.text, cls: r?.cls });
        } else if (!t && cupAlive(cup, me)) rows.push({ day: ev.day, comp: "cup", label, opp: null, home: null });
        break;
      }
      case "superCup":
      case "worldSuper": {
        const t = ev.kind === "superCup" ? state.supers?.regional[state.player.region] : state.supers?.world;
        if (!t || (t.a !== me && t.b !== me) || state.supers!.season !== state.season) break;
        const r = legResult(t, 0, me);
        rows.push({ day: ev.day, comp: ev.kind === "superCup" ? "cup" : "pwt", label: ev.kind === "superCup" ? "슈퍼컵" : "월드 슈퍼컵", opp: t.a === me ? t.b : t.a, home: null, result: r?.text, cls: r?.cls });
        break;
      }
      case "ko":
      case "pctKo":
      case "pwtFinal":
      case "pctFinal": {
        const pwt = tourOf(state, ev.kind === "pctKo" || ev.kind === "pctFinal");
        if (!pwt || !pwt.entrants.includes(me)) break;
        const N = pwt.name || "PWT";
        const isFinal = ev.kind === "pwtFinal" || ev.kind === "pctFinal";
        const round = "round" in ev ? ev.round : 3;
        const evLeg = "leg" in ev ? ev.leg : 0;
        const label = isFinal ? `${N} 결승` : `${N} ${KO_ROUND_NAMES[round]} ${legName(evLeg)}`;
        const t = isFinal ? pwt.final : pwt.ko[round]?.find(x => x.a === me || x.b === me);
        if (t && (t.a === me || t.b === me)) {
          const leg = evLeg;
          const r = legResult(t, leg, me);
          rows.push({ day: ev.day, comp: N === "PCT" ? "pct" : "pwt", label, opp: t.a === me ? t.b : t.a, home: t.format === "bo3" ? null : leg === 0 ? t.a === me : t.b === me, result: r?.text, cls: r?.cls });
        } else if (!t && pwtAlive(pwt, me) && (isFinal || !pwt.ko[round])) rows.push({ day: ev.day, comp: N === "PCT" ? "pct" : "pwt", label, opp: null, home: null });
        break;
      }
    }
  }
  return rows;
}

export function speciesLine(ids: string[]): string {
  return ids.map(koSpecies).join(", ");
}
