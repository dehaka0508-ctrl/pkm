// Weekly game loop: matchdays (league / PWT), training, scouting, finances, season rollover.
import type { MatchResult, SideConfig } from "../battle/engine";
import { REGIONS, koSpecies, regionById } from "../data/dex";
import { LEAGUE_LAST_WEEK, PWT_KO_WEEKS, PWT_SWISS_WEEKS, SEASON_REVIEW_WEEK, WEEKS_PER_SEASON, weekLabel } from "./calendar";
import { applyResult, rankOf, standings } from "./league";
import { resolveTeam, roleSkill, trainerById } from "./lineups";
import { applySwiss, nextKoRound, pairSwiss, playerPwtResult, qualify, seedKnockout, KO_NAMES } from "./pwt";
import { financeWeek, LEAGUE_PRIZE, onMatchResult } from "./finance";
import { scoutWeek } from "./scouting";
import { gainExp, trainWeek } from "./training";
import type { GameState, PendingMatch, PwtMatch } from "./state";
import { displayName, entryTeam, makeLeagues, pushMsg, rngFor } from "./state";

export interface SimJob {
  p1: SideConfig;
  p2: SideConfig;
  seed: string;
}
export type Simulator = (jobs: SimJob[], onProgress?: (done: number, total: number) => void) => Promise<MatchResult[]>;

export type Matchday = { kind: "league"; round: number } | { kind: "swiss"; round: number } | { kind: "ko"; round: number };

export function matchdaysThisWeek(state: GameState): Matchday[] {
  const out: Matchday[] = [];
  const league = state.leagues[state.player.region];
  league.roundWeeks.forEach((w, i) => {
    if (w === state.week) out.push({ kind: "league", round: i });
  });
  PWT_SWISS_WEEKS.forEach((w, i) => {
    if (w === state.week) out.push({ kind: "swiss", round: i });
  });
  PWT_KO_WEEKS.forEach((w, i) => {
    if (w === state.week) out.push({ kind: "ko", round: i });
  });
  return out;
}

export function currentMatchday(state: GameState): Matchday | null {
  return matchdaysThisWeek(state)[state.doneMatchdays] ?? null;
}

export function sideFor(state: GameState, id: string): SideConfig {
  if (id === state.player.slotId) {
    return { name: state.player.name, team: entryTeam(state), gimmick: state.player.gimmick, skill: 0.85 };
  }
  const t = trainerById(id)!;
  return { name: t.name, team: resolveTeam(t), gimmick: t.gimmick, skill: roleSkill(t.role) };
}

function prepare(state: GameState, md: Matchday) {
  if (md.kind === "swiss") {
    if (!state.pwt || state.pwt.season !== state.season) {
      state.pwt = qualify(state);
      const me = state.player.slotId;
      if (state.pwt.entrants.includes(me)) pushMsg(state, "pwt", "PWT 진출 확정!", `${state.pwt.seeds[me]} 자격으로 포켓몬 월드 토너먼트에 나갑니다.`);
      else pushMsg(state, "pwt", "PWT 진출 실패", "이번 시즌은 PWT 출전권을 얻지 못했습니다.");
    }
    const pwt = state.pwt!;
    while (pwt.swiss.length <= md.round) pwt.swiss.push(pairSwiss(pwt, rngFor(state, `swiss${pwt.swiss.length}`)));
  } else if (md.kind === "ko") {
    const pwt = state.pwt;
    if (!pwt) return;
    if (pwt.ko.length === 0) seedKnockout(pwt);
    while (pwt.ko.length <= md.round && !pwt.champion) nextKoRound(pwt);
  }
}

function playerMatchFor(state: GameState, md: Matchday): PendingMatch | null {
  const me = state.player.slotId;
  if (md.kind === "league") {
    const f = state.leagues[state.player.region].rounds[md.round].find(x => x.home === me || x.away === me);
    if (!f || f.result) return null;
    const home = f.home === me;
    return { kind: "league", label: `${regionById(state.player.region).name} 리그 ${md.round + 1}라운드`, opponent: home ? f.away : f.home, home, bestOf: 1, games: [], ref: { region: state.player.region, round: md.round } };
  }
  const pwt = state.pwt;
  if (!pwt) return null;
  const list = md.kind === "swiss" ? pwt.swiss[md.round] : pwt.ko[md.round];
  if (!list) return null;
  const idx = list.findIndex(m => (m.a === me || m.b === me) && !m.winner);
  if (idx < 0) return null;
  const m = list[idx];
  const label = md.kind === "swiss" ? `PWT 스위스 ${md.round + 1}라운드` : `PWT ${KO_NAMES[md.round]} (3판 2선승)`;
  return { kind: "pwt", label, opponent: m.a === me ? m.b : m.a, home: false, bestOf: m.bestOf, games: [], ref: { stage: md.kind, round2: md.round, index: idx } };
}

export function pendingDecided(p: PendingMatch): boolean {
  const need = Math.ceil(p.bestOf / 2);
  const w = p.games.filter(g => g.w === 0).length;
  const l = p.games.filter(g => g.w === 1).length;
  return w >= need || l >= need || (p.bestOf === 1 && p.games.length >= 1);
}

/** Records one game of the player's match (player is always side 0 in the result). */
export function recordPlayerGame(state: GameState, r: MatchResult, logs: string[] = []) {
  const p = state.pending;
  if (!p) return;
  p.games.push({ w: r.winner, my: r.remaining[0], opp: r.remaining[1] });
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

/** Simulates the remaining games of a Bo1/Bo3 in batches. */
async function simSeries(matches: PwtMatch[], state: GameState, sim: Simulator, tag: string) {
  for (let g = 0; g < 3; g++) {
    const todo = matches.filter(m => !m.winner);
    if (!todo.length) break;
    const jobs = todo.map(m => ({ p1: sideFor(state, m.a), p2: sideFor(state, m.b), seed: `${state.seed}:${state.season}:${tag}:${m.a}:${m.b}:${g}` }));
    const res = await sim(jobs);
    todo.forEach((m, i) => {
      const r = res[i];
      m.games.push({ w: r.winner, ra: r.remaining[0], rb: r.remaining[1] });
      decideSeries(m);
    });
  }
  for (const m of matches) if (!m.winner) m.winner = m.a; // safety (draw loops)
}

function decideSeries(m: PwtMatch) {
  const need = Math.ceil(m.bestOf / 2);
  const a = m.games.filter(g => g.w === 0).length;
  const b = m.games.filter(g => g.w === 1).length;
  if (a >= need) m.winner = m.a;
  else if (b >= need) m.winner = m.b;
  else if (m.games.length >= m.bestOf + 2) m.winner = a >= b ? m.a : m.b;
}

async function resolveMatchday(state: GameState, md: Matchday, sim: Simulator, logs: string[], onProgress?: (d: number, t: number) => void) {
  const me = state.player.slotId;
  const pending = state.pending;
  if (md.kind === "league") {
    const jobs: SimJob[] = [];
    const refs: { region: string; idx: number }[] = [];
    for (const r of REGIONS) {
      const lg = state.leagues[r.id];
      const round = lg.rounds[md.round];
      if (!round) continue;
      round.forEach((f, idx) => {
        if (f.result) return;
        if (f.home === me || f.away === me) {
          const g = pending?.games[0];
          if (g) {
            const home = f.home === me;
            f.result = home ? { h: g.my, a: g.opp, w: g.w } : { h: g.opp, a: g.my, w: g.w === -1 ? -1 : g.w === 0 ? 1 : 0 };
            onMatchResult(state, home, g.w, logs);
            return;
          }
        }
        jobs.push({ p1: sideFor(state, f.home), p2: sideFor(state, f.away), seed: `${state.seed}:${state.season}:L${md.round}:${f.home}:${f.away}` });
        refs.push({ region: r.id, idx });
      });
    }
    const res = await sim(jobs, onProgress);
    res.forEach((r, i) => {
      const f = state.leagues[refs[i].region].rounds[md.round][refs[i].idx];
      f.result = { h: r.remaining[0], a: r.remaining[1], w: r.winner };
      if (f.home === me || f.away === me) {
        const home = f.home === me;
        const my = home ? 0 : 1;
        onMatchResult(state, home, r.winner === -1 ? -1 : r.winner === my ? 0 : 1, logs);
      }
    });
    for (const r of REGIONS) {
      const lg = state.leagues[r.id];
      for (const f of lg.rounds[md.round] || []) applyResult(lg.table, f);
      lg.nextRound = md.round + 1;
    }
    const lg = state.leagues[state.player.region];
    const f = lg.rounds[md.round].find(x => x.home === me || x.away === me);
    if (f?.result) {
      const home = f.home === me;
      const my = home ? f.result.h : f.result.a;
      const op = home ? f.result.a : f.result.h;
      const w = f.result.w === -1 ? "무승부" : (f.result.w === 0) === home ? "승리" : "패배";
      logs.unshift(`${md.round + 1}R vs ${displayName(state, home ? f.away : f.home)} — ${w} (${my}:${op}), 현재 ${rankOf(lg, me)}위`);
    }
  } else if (md.kind === "swiss" || md.kind === "ko") {
    const pwt = state.pwt;
    if (!pwt) return;
    const list = md.kind === "swiss" ? pwt.swiss[md.round] : pwt.ko[md.round];
    if (!list) return;
    const mine = list.find(m => m.a === me || m.b === me);
    if (mine && pending && pending.kind === "pwt") {
      for (const g of pending.games) {
        const meIsA = mine.a === me;
        mine.games.push({ w: g.w === -1 ? -1 : (g.w === 0) === meIsA ? 0 : 1, ra: meIsA ? g.my : g.opp, rb: meIsA ? g.opp : g.my });
      }
      decideSeries(mine);
    }
    await simSeries(list.filter(m => !m.winner), state, sim, `${md.kind}${md.round}`);
    if (md.kind === "swiss") for (const m of list) applySwiss(pwt, m);
    if (mine) {
      const won = mine.winner === me;
      logs.unshift(`PWT ${md.kind === "swiss" ? `스위스 ${md.round + 1}R` : KO_NAMES[md.round]} vs ${displayName(state, mine.a === me ? mine.b : mine.a)} — ${won ? "승리" : "패배"}`);
      state.player.money += won ? (md.kind === "ko" ? 20000 * (md.round + 1) : 8000) : 0;
    }
    if (md.kind === "ko" && md.round === PWT_KO_WEEKS.length - 1) {
      nextKoRound(pwt);
      if (pwt.champion) {
        pushMsg(state, "pwt", `PWT 우승: ${displayName(state, pwt.champion)}`, `${pwt.seeds[pwt.champion]} 출신 ${displayName(state, pwt.champion)}이(가) 세계 정상에 올랐습니다.`);
        if (pwt.champion === me) {
          state.player.titles.push(`시즌 ${state.season} PWT 우승`);
          state.player.money += 200000;
          state.player.reputation = Math.min(100, state.player.reputation + 15);
        }
      }
    }
  }
}

export type AdvanceResult = { type: "match"; pending: PendingMatch } | { type: "week"; summary: string[] };

/** Advances until the player must play a match, or the week ends. */
export async function advance(state: GameState, sim: Simulator, onProgress?: (d: number, t: number) => void): Promise<AdvanceResult> {
  const logs: string[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const md = currentMatchday(state);
    if (!md) break;
    prepare(state, md);
    if (!state.pending) {
      const pm = playerMatchFor(state, md);
      if (pm) {
        state.pending = pm;
        return { type: "match", pending: pm };
      }
    } else if (!pendingDecided(state.pending)) {
      return { type: "match", pending: state.pending };
    }
    await resolveMatchday(state, md, sim, logs, onProgress);
    state.pending = null;
    state.doneMatchdays++;
  }
  endWeek(state, logs);
  return { type: "week", summary: logs };
}

function endWeek(state: GameState, logs: string[]) {
  const p = state.player;
  const trainLogs: string[] = [];
  for (const m of p.squad) trainWeek(m, p.plan[m.uid] || "level", p.facilities.training, trainLogs);
  if (trainLogs.length) {
    logs.push(...trainLogs);
    pushMsg(state, "train", `${weekLabel(state.week)} 훈련 결과`, trainLogs.join("\n"));
  }
  scoutWeek(state, rngFor(state, "scout"));
  financeWeek(state, logs);

  if (state.week === LEAGUE_LAST_WEEK) {
    const lg = state.leagues[p.region];
    const rank = rankOf(lg, p.slotId);
    const prize = LEAGUE_PRIZE(rank);
    p.money += prize;
    const champ = standings(lg)[0];
    pushMsg(state, "info", `${regionById(p.region).name} 리그 종료: ${rank}위`, `상금 ₽${prize.toLocaleString()}을 받았습니다. 우승: ${displayName(state, champ.id)}`);
    if (rank === 1) {
      p.titles.push(`시즌 ${state.season} ${regionById(p.region).name} 리그 우승`);
      p.reputation = Math.min(100, p.reputation + 10);
    }
    logs.unshift(`리그 최종 ${rank}위 · 상금 ₽${prize.toLocaleString()}`);
  }
  if (state.week === SEASON_REVIEW_WEEK) {
    const lg = state.leagues[p.region];
    const row = standings(lg).find(r => r.id === p.slotId)!;
    p.history.push({ season: state.season, region: p.region, rank: rankOf(lg, p.slotId), pts: row.pts, w: row.w, d: row.d, l: row.l, pwt: playerPwtResult(state.pwt, p.slotId) });
  }
  state.lastWeekSummary = logs;
  state.week++;
  state.doneMatchdays = 0;
  if (state.week > WEEKS_PER_SEASON) newSeason(state);
}

function newSeason(state: GameState) {
  // region coefficients: 70% previous + PWT performance
  const pwt = state.pwt;
  if (pwt) {
    const pts: Record<string, number> = {};
    for (const r of REGIONS) pts[r.id] = 0;
    for (const id of pwt.entrants) {
      const reg = id === state.player.slotId ? state.player.region : trainerById(id)?.region;
      if (!reg) continue;
      pts[reg] += pwt.records[id].w;
      pwt.ko.forEach(round => round.forEach(m => m.winner === id && (pts[reg] += 2)));
      if (pwt.champion === id) pts[reg] += 3;
    }
    for (const r of REGIONS) state.coefficients[r.id] = Math.round((state.coefficients[r.id] * 0.7 + pts[r.id] * 1.5) * 10) / 10;
  }
  state.season++;
  state.week = 1;
  state.doneMatchdays = 0;
  state.leagues = makeLeagues(state.season, state.seed);
  state.pwt = null;
  pushMsg(state, "info", `시즌 ${state.season} 개막 준비`, "프리시즌 4주 동안 훈련과 스카우팅으로 전력을 다지세요. 2월부터 리그가 시작됩니다.");
}

export function speciesLine(ids: string[]): string {
  return ids.map(koSpecies).join(", ");
}
