// Day-by-day game loop: league Sundays, PWT / cup Wednesdays, draws on Mondays,
// weekly training · scouting · finances on Sundays, season rollover on Sep 1.
import type { MatchResult, SideConfig } from "../battle/engine";
import { REGIONS, koSpecies, regionById } from "../data/dex";
import { CUP_ROUND_NAMES, KO_ROUND_NAMES, LEAGUE_ROUNDS, dateLabel, eventsOn, seasonEvents, seasonStart, weekdayOf, type CalEvent } from "./calendar";
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
  startPwt,
  type PrevSeason,
} from "./pwt";
import { CUP_STAGE_NAME, ROUND_KEYS, cupAlive, cupPath, cupResult, ensureCupFinal, ensureCupRound, makeCup } from "./cup";
import { GROUP_NAMES, type DrawData } from "./draw";
import { addGame, needsGame, nextHome, tieText, type Tie } from "./tie";
import { financeWeek, LEAGUE_PRIZE, onMatchResult } from "./finance";
import { scoutWeek } from "./scouting";
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
  const t = trainerById(id)!;
  return { name: t.name, team: resolveTeam(t), gimmick: t.gimmick, skill: roleSkill(t.role) };
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
  }
}

const legName = (leg: number) => `${leg + 1}차전`;

function eventSlots(state: GameState, ev: CalEvent): Slot[] {
  const out: Slot[] = [];
  switch (ev.kind) {
    case "league":
      for (const r of REGIONS)
        (state.leagues[r.id].rounds[ev.round] || []).forEach((f, i) => out.push({ kind: "fx", f, tag: `L${ev.round}:${r.id}:${i}`, label: `${r.name} 리그 ${ev.round + 1}라운드` }));
      break;
    case "group": {
      const pwt = state.pwt;
      if (pwt) pwt.fixtures[ev.md].forEach((f, i) => out.push({ kind: "fx", f, tag: `G${ev.md}:${i}`, label: `PWT 조별리그 ${ev.md + 1}차전 (${GROUP_NAMES[groupIndex(pwt, f.home)]}조)` }));
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
    case "ko": {
      const ties = state.pwt && ensureKoRound(state.pwt, ev.round);
      (ties || []).forEach((t, idx) => out.push({ kind: "tie", t, leg: ev.leg, tag: `K${ev.round}:${idx}`, label: `PWT ${KO_ROUND_NAMES[ev.round]} ${legName(ev.leg)}`, ref: { kind: "ko", round: ev.round, idx, leg: ev.leg } }));
      break;
    }
    case "pwtFinal": {
      const t = state.pwt && ensureFinal(state.pwt);
      if (t) out.push({ kind: "tie", t, leg: 0, tag: "PF", label: "PWT 결승 (3판 2선승)", ref: { kind: "pwtFinal", leg: 0 } });
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
async function runMatches(state: GameState, slots: Slot[], sim: Simulator, ctx: Ctx): Promise<AdvanceResult | null> {
  const me = state.player.slotId;
  const mine = slots.find(s => involves(s, me));
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
      for (const g of p.games) onMatchResult(state, p.home, g.w, ctx.logs);
      state.pending = null;
    }
    ctx.played = true;
  }
  await simSlots(state, slots, sim, ctx.onProgress);
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
    case "po": {
      const target = ev.day === seasonStart(state.season) ? state.season : state.season + 1;
      if (!state.qual || state.qual.season !== target) {
        const prev = target === state.season ? state.prev : prevFromState(state);
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
    case "koDraw": {
      const pwt = state.pwt;
      if (!pwt || pwt.koDraw) return null;
      drawPwtKnockout(pwt, rngFor(state, "ko"));
      const t = pwt.ko[0].find(x => x.a === me || x.b === me);
      if (t) pushMsg(state, "pwt", "PWT 16강 추첨", `상대: ${displayName(state, t.a === me ? t.b : t.a)} (1월 ${t.a === me ? "1차전 홈" : "2차전 홈"})`);
      return { type: "draw", draws: [pwt.koDraw!], summary: [] };
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
    case "group": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const pwt = state.pwt!;
      if (mine && mine.kind === "fx") {
        const gi = groupIndex(pwt, me);
        const rank = groupTable(pwt, gi).findIndex(r => r.id === me) + 1;
        fxLog(state, mine, ctx, `, ${GROUP_NAMES[gi]}조 ${rank}위`);
        const f = mine.f;
        if (f.result && f.result.w !== -1 && (f.result.w === 0) === (f.home === me)) {
          p.money += 8000;
          ctx.logs.push("PWT 승리 수당 ₽8,000");
        }
        if (ev.md === 5) {
          const adv = rank <= 2;
          pushMsg(state, "pwt", adv ? `PWT 조별리그 통과 (${GROUP_NAMES[gi]}조 ${rank}위)` : `PWT 조별리그 탈락 (${GROUP_NAMES[gi]}조 ${rank}위)`, adv ? "1월 첫 월요일에 토너먼트 대진을 추첨합니다." : "");
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
        const champ = state.cups?.[p.region]?.champion;
        if (champ) pushMsg(state, "info", `${regionById(p.region).name} 컵 우승: ${displayName(state, champ)}`, "");
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 80000, true);
        if (champ === me) {
          p.titles.push(`시즌 ${state.season} ${regionById(p.region).name} 컵 우승`);
          p.reputation = Math.min(100, p.reputation + 6);
        }
      } else if (mine && mine.kind === "tie" && (ev.leg === 1 || mine.t.winner)) {
        tieLog(state, mine, ctx, 10000 * (ev.round + 1));
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "info", `${regionById(p.region).name} 컵 ${CUP_ROUND_NAMES[ev.round]} 탈락`, tieText(mine.t, me));
      } else if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 0);
      return null;
    }
    case "ko":
    case "pwtFinal": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const pwt = state.pwt;
      if (ev.kind === "pwtFinal") {
        if (pwt?.final?.winner) {
          pwt.champion = pwt.final.winner;
          pushMsg(state, "pwt", `PWT 우승: ${displayName(state, pwt.champion)}`, `${pwt.seeds[pwt.champion] || ""} 출신 ${displayName(state, pwt.champion)}이(가) 세계 정상에 올랐습니다.`);
        }
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, 200000, true);
        if (pwt?.champion === me) {
          p.titles.push(`시즌 ${state.season} PWT 우승`);
          p.reputation = Math.min(100, p.reputation + 15);
        }
        seasonRecord(state);
      } else if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx, ev.leg === 1 || mine.t.winner ? 20000 * (ev.round + 1) : 0);
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "pwt", `PWT ${KO_ROUND_NAMES[ev.round]} 탈락`, tieText(mine.t, me));
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
  }
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
  });
}

/** This season's final tables as seeding data for the next one. */
export function prevFromState(state: GameState): PrevSeason {
  const tables: PrevSeason["tables"] = {};
  for (const r of REGIONS) tables[r.id] = standings(state.leagues[r.id]).map((x, i) => ({ id: x.id, rank: i + 1, pts: x.pts, diff: x.diff, gf: x.gf ?? 0 }));
  return { season: state.season, virtual: false, tables, champion: state.pwt?.champion };
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
}

function endDay(state: GameState, logs: string[]) {
  if (weekdayOf(state.day) === 6) weekly(state, logs);
  state.day++;
  state.dayStep = 0;
  if (state.day >= seasonStart(state.season + 1)) newSeason(state);
}

function newSeason(state: GameState) {
  if (state.pwt) seasonRecord(state);
  state.prev = prevFromState(state);
  state.season++;
  state.leagues = makeLeagues(state.season, state.seed);
  state.pwt = null;
  state.cups = null;
  pushMsg(state, "info", `시즌 ${state.season} 개막`, "9월 첫 월요일 PWT 조 추첨, 첫 일요일 리그 개막, 10월 첫 월요일 지방 컵 추첨이 있습니다.");
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
  comp: "league" | "pwt" | "cup";
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
        const target = ev.day === seasonStart(state.season) ? state.season : state.season + 1;
        if (!q || q.season !== target) break;
        const t = q.po.ties.find(x => x.a === me || x.b === me);
        if (!t) break;
        const r = legResult(t, 0, me);
        rows.push({ day: ev.day, comp: "pwt", label: "PWT 플레이오프", opp: t.a === me ? t.b : t.a, home: t.a === me, result: r?.text, cls: r?.cls });
        break;
      }
      case "group": {
        if (!pwt || !pwt.entrants.includes(me)) break;
        const f = pwt.fixtures[ev.md].find(x => x.home === me || x.away === me)!;
        const home = f.home === me;
        const row: ScheduleRow = { day: ev.day, comp: "pwt", label: `PWT 조별 ${ev.md + 1}차전`, opp: home ? f.away : f.home, home };
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
      case "ko":
      case "pwtFinal": {
        if (!pwt || !pwt.entrants.includes(me)) break;
        const label = ev.kind === "pwtFinal" ? "PWT 결승" : `PWT ${KO_ROUND_NAMES[ev.round]} ${legName(ev.leg)}`;
        const t = ev.kind === "pwtFinal" ? pwt.final : pwt.ko[ev.round]?.find(x => x.a === me || x.b === me);
        if (t && (t.a === me || t.b === me)) {
          const leg = ev.kind === "pwtFinal" ? 0 : ev.leg;
          const r = legResult(t, leg, me);
          rows.push({ day: ev.day, comp: "pwt", label, opp: t.a === me ? t.b : t.a, home: t.format === "bo3" ? null : leg === 0 ? t.a === me : t.b === me, result: r?.text, cls: r?.cls });
        } else if (!t && pwtAlive(pwt, me) && (ev.kind === "pwtFinal" || !pwt.ko[ev.round])) rows.push({ day: ev.day, comp: "pwt", label, opp: null, home: null });
        break;
      }
    }
  }
  return rows;
}

export function speciesLine(ids: string[]): string {
  return ids.map(koSpecies).join(", ");
}
