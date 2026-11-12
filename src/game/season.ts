import { registeredEntry, WINTER_COMPS, isWinterConfirmDay, pendingCompetition, registrationOf, type Competition } from "./registration";
import { CONF_KO, PSB_ROUND_KO, confOf, psbConfFinals, psbFinal, psbKeys, psbLabel, psbSemis, startPsb } from "./psb";
import { MATCH_SIZE, type MatchRules } from "./match-rules";
import { leagueLineupToAvoid, recordLeagueLineup } from "./rotation";
// Day-by-day game loop: league Sundays, PWT / cup Wednesdays, draws on Mondays,
// weekly training · scouting · finances on Sundays, season rollover on Aug 1 (August = preseason).
import type { MatchResult, SideConfig } from "../battle/engine";
import { pushMsgMerged } from "./state";
import { REGIONS, josa, koSpecies, regionById } from "../data/dex";
import { evolutionOptions } from "./moves";
import { CUP_ROUND_NAMES, KO_ROUND_NAMES, LEAGUE_ROUNDS, dateLabel, dateOf, dayOf, eventsOn, seasonEvents, seasonStart, weekdayOf, type CalEvent } from "./calendar";
import { applyResult, rankOf, standings, type Fixture } from "./league";
import { resolveTeam, roleSkill, trainerById } from "./lineups";
import {
  buildQual,
  pctEntrants,
  startEct,
  drawKoPlayoff,
  takesPart,
  TIER_NAME,
  TIER_LONG,
  type Tier,
  drawPwtKnockout,
  groupStageDone,
  ensureThird,
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
import { CUP_STAGE_NAME, ROUND_KEYS, autoRegistration, cupAlive, cupPath, cupResult, ensureCupFinal, ensureCupThird, ensureCupRound, isSwissCup, makeCup } from "./cup";
import { GROUP_NAMES, type DrawData } from "./draw";
import { cupHost, finalStadium, psbHost, settleVenueGate, tieVenue, venueGate, venueName, type MatchVenue } from "./venues";
import { leagueGateAfterLineup, leagueGateImportance, tieGateImportance } from "./gate-importance";
import { addGame, needsGame, newTie, nextHome, tieText, type Tie } from "./tie";
import { financeWeek, foodDay, homeGate, LEAGUE_PRIZE, onMatchResult } from "./finance";
import { afterBattle, treatDaily, treatLines, type TreatResult } from "./clinic";
import { addFame, addSat, SAT_START, moodWeek, onGameResult, onHurtFielded, onStage, seasonFame } from "./fans";
import { loanDay, moneyBlocked } from "./loan";
import { rescueCheck } from "./rescue";
import { scoutWeek } from "./scouting";
import { npcAiWeek } from "./ai/controller";
import { friendliesOf, friendlyEndDay, friendlyToday, settleFriendly } from "./friendly";
import { type PrepPair, prepareMatches, rememberMeeting } from "./ai/prep";
import { AWARD_KO, compEndAwards, compOf, leagueEndRecords, leagueRecords, leagueRun, recordGame, type Award } from "./stats";
import { GOLDEN_MASTER_BALL, GOLDEN_MASTER_BALL_PUBLISHER, awardGoldenMasterBall } from "./golden-master-ball";
import { podiumRanks, queueGoldenCeremony, queueIndividualCeremonies, queueTeamCeremony } from "./ceremony";
import { addPressStory, capturePressRosters, cupFinalePress, finishPlayerPressMatch, leagueFinalePress, maybePressRumor, recordNpcPressGame, rememberPlayerPressGame } from "./press";
import { judgeObjectives, offersLapsingToday, sponsorDay, sponsorOffersEvent, sponsorSeasonEnd, sponsorSeasonStart } from "./sponsor";
import { awardTicket, endLoans, expireTickets } from "./legend";
import { npcGimmick, aboveExpectation, expectedRanks, npcDay, npcFame, npcFoodDay, npcGame, npcJudge, npcLeagueEnd, npcOf, note as npcNote, npcPrize, npcRecruit, npcSeasonStart, npcTeam, npcWeek } from "./npc";
import { gainExp, trainWeek } from "./training";
import type { GameState, PendingMatch, TieRef } from "./state";
import type { OwnedMon, TeamMember } from "./types";
import { displayName, entryTeam, makeLeagues, pushMsg, rngFor, virtualPrev } from "./state";

export interface SimJob {
  p1: SideConfig;
  p2: SideConfig;
  seed: string;
  /** regional cup: doubles with all six */
  doubles?: boolean;
}
export type Simulator = (jobs: SimJob[], onProgress?: (done: number, total: number) => void) => Promise<MatchResult[]>;

export type AdvanceResult =
  | { type: "registration"; competition: Competition }
  | { type: "match"; pending: PendingMatch }
  | { type: "day"; summary: string[]; day: number }
  | { type: "draw"; draws: DrawData[]; summary: string[] };

/**
 * The national tournament's entrants for a season, decided once. Season 1 has no previous tables: its
 * strength ranking is taken again now, just before the entrants are decided, rather than at the game's start
 * (teams change over the preseason, above all on a 새출발 start).
 */
function ensureQual(state: GameState, season: number): asserts state is GameState & { qual: NonNullable<GameState["qual"]> } {
  if (state.qual && state.qual.season === season) return;
  state.prev = livePrev(state, season);
  state.qual = buildQual(state.prev, season, rngFor(state, "po"));
}
/** Last season's tables; for season 1 the strength ranking as it stands now. */
const livePrev = (state: GameState, season: number) => (state.prev.virtual && season === 1 ? { ...state.prev, tables: virtualPrev(state).tables } : state.prev);

export function sideFor(state: GameState, id: string, doubles = false, league = !doubles && pendingCompetition(state.pending) === "league", opponent = state.player.slotId, matchSets = true): SideConfig {
  const rules: MatchRules = doubles ? "doubles" : league ? "league" : "singles";
  const avoidLeagueLineup = league ? leagueLineupToAvoid(state, id) : undefined;
  if (id === state.player.slotId) {
    return { name: state.player.name, team: doubles ? playerCupTeam(state).team : league && registrationOf(state, "league") ? registeredEntry(state, "league") : entryTeam(state), gimmick: state.player.gimmick, skill: 0.85, rules, avoidLeagueLineup };
  }
  const t = trainerById(id);
  if (!t) throw new Error(`unknown trainer id: ${id}`);
  const plan = npcOf(state, id).matchPlan;
  const planned0 = plan?.day === state.day && plan.opponent === opponent && plan.rules === rules ? plan : undefined;
  // what it got ready for this match (moves, held items) applies to this match only; `matchSets: false` shows the
  // team as its club info does
  const sets = (matchSets && planned0?.sets) || {};
  const team = npcTeam(state, id, league);
  const eligible = (doubles ? autoRegistration(team).team : team).map(m => (sets[m.uid] ? { ...m, moves: sets[m.uid].moves ?? m.moves, item: sets[m.uid].item ?? m.item } : m));
  const picks = planned0 ? planned0.uids.map(uid => eligible.findIndex(m => m.uid === uid)) : [];
  const planned = picks.length === Math.min(MATCH_SIZE[rules], eligible.length) && picks.every(i => i >= 0) ? picks : undefined;
  return { name: t.name, team: eligible, picks: planned, gimmick: npcGimmick(state, id), skill: roleSkill(t.role), rules, avoidLeagueLineup };
}

/** All league paths settle the selected lineup once, including Pokémon that never took the field. */
function recordLeaguePicks(state: GameState, id: string, team: TeamMember[], picks: number[]) {
  const { streak, penalty } = recordLeagueLineup(state, id, picks.map(i => team[i]?.uid).filter((u): u is string => !!u), team.length);
  if (!penalty) return;
  const text = `리그 동일 선발 ${streak}경기 연속`;
  if (id === state.player.slotId) {
    addSat(state, -penalty, text);
    pushMsg(state, "info", `반복 선발로 팬 만족도 −${penalty}`, `${text}. 순서를 바꿔도 같은 포켓몬들이면 연속 사용으로 계산합니다.`);
  } else {
    const n = npcOf(state, id);
    n.sat = Math.max(0, Math.min(100, (n.sat ?? SAT_START) - penalty));
    npcNote(n, state, `${text}: 팬 만족도 −${penalty}`);
  }
}

/** The player's registered cup team (chosen before the match, or picked automatically). */
export function playerCupTeam(state: GameState): { idx: number[]; team: OwnedMon[] } {
  const entry = entryTeam(state);
  const reg = state.pending?.doubles ? state.pending.reg : undefined;
  if (reg && reg.length >= 4) return { idx: reg, team: reg.map(i => entry[i]).filter(Boolean) };
  const auto = autoRegistration(entry);
  return { idx: auto.idx, team: auto.team as OwnedMon[] };
}

// ---------- match slots ----------

/** Regional cup matches of a round (0–3: rounds 1–3 and the wing finals, 4: the final): doubles, single games. */
function cupSlots(state: GameState, round: number): Slot[] {
  const out: Slot[] = [];
  for (const r of REGIONS) {
    const cup = state.cups?.[r.id];
    if (!cup || isSwissCup(cup)) continue;
    if (round < ROUND_KEYS.length) {
      ensureCupRound(cup, round);
      for (const w of [0, 1])
        for (const key of ROUND_KEYS[round]) {
          const k = `${w}${key}`;
          const t = cup.ties[k];
          if (!t) continue;
          t.host ??= cupHost(state, t);
          out.push({ kind: "tie", t, leg: 0, tag: `C${r.id}:${k}`, label: `${r.name} 컵 ${CUP_ROUND_NAMES[round]} (더블배틀)`, ref: { kind: "cup", region: r.id, key: k, leg: 0 }, doubles: true });
        }
    } else {
      const t = ensureCupFinal(cup);
      if (!t) continue;
      t.host ??= cupHost(state, t);
      out.push({ kind: "tie", t, leg: 0, tag: `CF${r.id}`, label: `${r.name} 컵 결승 (더블배틀)`, ref: { kind: "cup", region: r.id, key: "F", leg: 0 }, doubles: true });
    }
  }
  return out;
}

type Slot =
  | { kind: "fx"; f: Fixture; tag: string; label: string; doubles?: boolean }
  | { kind: "tie"; t: Tie; leg: number; tag: string; label: string; ref: TieRef; doubles?: boolean };

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
    case "ectKo":
      return state.ect?.ko[ref.round]?.[ref.idx];
    case "ectFinal":
      return state.ect?.final;
    case "kpo":
      return tour(state, ref.tier)?.kpo?.[ref.idx];
    case "super":
      return state.supers?.regional[ref.region];
    case "worldSemi":
      return state.supers?.semi ?? undefined;
    case "psb":
      return state.psb?.ties[ref.key];
    case "third":
      return tour(state, ref.tier)?.third;
    case "world":
      return state.supers?.world ?? undefined;
  }
}

const tourOf = (state: GameState, pct: boolean) => (pct ? state.pct : state.pwt);
/** The tournament of a tier: PWT, PST ("pct") or PCT ("ect"). */
const tour = (state: GameState, tier: Tier): PwtState | null => (tier === "pct" ? state.pct : tier === "ect" ? state.ect ?? null : state.pwt);
/** Placement prizes: [우승, 준우승, 3위]. */
const PLACE_PRIZE = {
  cup: [70000, 50000, 30000],
  pwt: [100000, 70000, 50000],
  pct: [70000, 50000, 30000],
  ect: [50000, 30000, 10000],
  psb: [50000, 30000, 0],
  super: [30000, 10000, 0],
} as const;
/** 중계권료: every game a club plays in the competition (playoffs and 3rd-place matches included). */
const BROADCAST_FEE: Record<string, number> = { cup: 5000, pwt: 7000, pct: 5000, ect: 3000, psb: 5000 };
const PLACE_KO = ["우승", "준우승", "3위"];
const loserOf = (t: Tie | null | undefined) => (t?.winner ? (t.winner === t.a ? t.b : t.a) : undefined);

/** The broadcast fee of a game in this slot's competition (none for the league or the super cups). */
function feeOf(s: Slot): number {
  const comp = slotComp(s) || "";
  return BROADCAST_FEE[comp.startsWith("cup:") ? "cup" : comp] ?? 0;
}

/** Pays one club (the player, with a line in the day's report, or an NPC). */
function payClub(state: GameState, id: string | undefined, amount: number, text = "", logs?: string[]) {
  if (!id || !amount) return;
  if (id === state.player.slotId) {
    state.player.money += amount;
    logs?.push(`${text} ₽${amount.toLocaleString()}`);
  } else npcPrize(state, id, amount);
}

/** Placement prizes once a competition is over: final winner, final loser, 3rd-place match winner. */
function payPlaces(state: GameState, kind: keyof typeof PLACE_PRIZE, name: string, final: Tie | null | undefined, third: Tie | null | undefined, logs?: string[]) {
  if (!final?.winner) return;
  [final.winner, loserOf(final), third?.winner].forEach((id, i) => payClub(state, id, PLACE_PRIZE[kind][i], `${name} ${PLACE_KO[i]} 상금`, logs));
}
/** Still in the PSB for round `round` (rounds already played lost by nobody else). */
function psbAlive(psb: import("./psb").PsbState, me: string, round: number): boolean {
  const conf = confOf(me, psb);
  if (!conf) return false;
  for (let r = 0; r < round; r++)
    for (const k of psbKeys(r)) {
      const t = psb.ties[k];
      if (t && (t.a === me || t.b === me) && t.winner && t.winner !== me) return false;
    }
  return true;
}
/** The tier of a group / knockout / final event. */
const tierOfEvent = (kind: string): Tier => (kind.startsWith("pct") ? "pct" : kind.startsWith("ect") ? "ect" : "pwt");
/** Tags of group games: "PWTG", "PCTG" (PST), "ECTG" (PCT). */
const GROUP_TAG: Record<Tier, string> = { pwt: "PWT", pct: "PCT", ect: "ECT" };

const legName = (leg: number) => `${leg + 1}차전`;

function eventSlots(state: GameState, ev: CalEvent): Slot[] {
  const out: Slot[] = [];
  switch (ev.kind) {
    case "league":
      for (const r of REGIONS)
        (state.leagues[r.id].rounds[ev.round] || []).forEach((f, i) => out.push({ kind: "fx", f, tag: `L${ev.round}:${r.id}:${i}`, label: `${r.name} 리그 ${ev.round + 1}라운드` }));
      break;
    case "group":
    case "pctGroup":
    case "ectGroup": {
      const tier = tierOfEvent(ev.kind);
      const T = tour(state, tier);
      if (T) T.fixtures[ev.md].forEach((f, i) => out.push({ kind: "fx", f, tag: `${GROUP_TAG[tier]}G${ev.md}:${i}`, label: `${TIER_NAME[tier]} 조별리그 ${ev.md + 1}차전 (${GROUP_NAMES[groupIndex(T, f.home)]}조)` }));
      break;
    }
    case "kpo":
      for (const tier of ["pct", "ect"] as const)
        (tour(state, tier)?.kpo || []).forEach((t, idx) =>
          out.push({ kind: "tie", t, leg: ev.leg, tag: `KPO${tier}:${idx}`, label: `${TIER_NAME[tier]} 녹아웃 플레이오프 ${legName(ev.leg)}`, ref: { kind: "kpo", tier, idx, leg: ev.leg } }),
        );
      break;
    case "cupThird":
      for (const r of REGIONS) {
        const cup = state.cups?.[r.id];
        if (!cup || isSwissCup(cup)) continue;
        const t = ensureCupThird(cup);
        if (!t) continue;
        t.host ??= cupHost(state, t);
        out.push({ kind: "tie", t, leg: 0, tag: `CT${r.id}`, label: `${r.name} 컵 3·4위전 (더블배틀)`, ref: { kind: "cup", region: r.id, key: "T", leg: 0 }, doubles: true });
      }
      break;
    case "koThird": {
      const T = tour(state, ev.tier);
      const t = T && ensureThird(T);
      if (t) out.push({ kind: "tie", t, leg: 0, tag: `TH${ev.tier}`, label: `${TIER_NAME[ev.tier]} 3·4위전`, ref: { kind: "third", tier: ev.tier, leg: 0 } });
      break;
    }
    case "psb": {
      const psb = state.psb;
      if (psb && psb.season === state.season)
        for (const key of psbKeys(ev.round)) {
          const t = psb.ties[key];
          if (t) {
            t.host ??= psbHost(state, key, t);
            out.push({ kind: "tie", t, leg: 0, tag: `PSB${key}`, label: psbLabel(key), ref: { kind: "psb", key, leg: 0 }, doubles: true });
          }
        }
      break;
    }
    case "worldSemi": {
      const t = state.supers?.semi;
      if (t) out.push({ kind: "tie", t, leg: 0, tag: "WSS", label: "전국 슈퍼컵 준결승", ref: { kind: "worldSemi", leg: 0 } });
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
      if (t) out.push({ kind: "tie", t, leg: 0, tag: "WSC", label: "전국 슈퍼컵 결승", ref: { kind: "world", leg: 0 } });
      break;
    }
    case "po":
      state.qual?.po.ties.forEach((t, idx) => out.push({ kind: "tie", t, leg: 0, tag: `PO${state.qual!.season}:${idx}`, label: "PWT 플레이오프", ref: { kind: "po", idx, leg: 0 } }));
      break;
    case "cup":
    case "cupFinal":
      out.push(...cupSlots(state, ev.kind === "cupFinal" ? ROUND_KEYS.length : ev.round));
      break;
    case "ko":
    case "pctKo":
    case "ectKo": {
      const tier = tierOfEvent(ev.kind);
      const T = tour(state, tier);
      const ties = T && ensureKoRound(T, ev.round);
      const prefix = tier === "pwt" ? "" : tier === "pct" ? "PCT" : "ECT";
      (ties || []).forEach((t, idx) =>
        out.push({ kind: "tie", t, leg: ev.leg, tag: `${prefix}K${ev.round}:${idx}`, label: `${TIER_NAME[tier]} ${KO_ROUND_NAMES[ev.round]} ${legName(ev.leg)}`, ref: { kind: tier === "pwt" ? "ko" : tier === "pct" ? "pctKo" : "ectKo", round: ev.round, idx, leg: ev.leg } }),
      );
      break;
    }
    case "pwtFinal":
    case "pctFinal":
    case "ectFinal": {
      const tier = tierOfEvent(ev.kind);
      const T = tour(state, tier);
      const t = T && ensureFinal(T);
      if (t) out.push({ kind: "tie", t, leg: 0, tag: tier === "pwt" ? "PF" : tier === "pct" ? "CF" : "EF", label: `${TIER_NAME[tier]} 결승 (3판 2선승)`, ref: { kind: tier === "pwt" ? "pwtFinal" : tier === "pct" ? "pctFinal" : "ectFinal", leg: 0 } });
      break;
    }
  }
  return out;
}

const slotPair = (state: GameState, s: Slot): PrepPair => {
  const [a, b] = s.kind === "fx" ? [s.f.home, s.f.away] : [s.t.a, s.t.b];
  const comp = pendingCompetition(makePending(state, s)) ?? undefined;
  return [a, b, s.doubles ? "doubles" : comp === "league" ? "league" : "singles", comp];
};

/** The night before: every club with a match on the coming day gets ready for its opponent. */
function prepareForDay(state: GameState) {
  const pairs: PrepPair[] = [];
  for (const ev of eventsOn(state.day)) for (const s of eventSlots(state, ev)) {
    if (!slotOpen(s)) continue;
    const pair = slotPair(state, s);
    const comp = pair[3];
    if (involves(s, state.player.slotId) && comp && !registrationOf(state, comp)) continue;
    pairs.push(pair);
  }
  const fr = friendlyToday(state);
  if (fr) pairs.push([fr.home, fr.away]);
  if (pairs.length) prepareMatches(state, pairs);
}

const involves = (s: Slot, id: string) => (s.kind === "fx" ? s.f.home === id || s.f.away === id : s.t.a === id || s.t.b === id);
const slotOpen = (s: Slot) => (s.kind === "fx" ? !s.f.result : needsGame(s.t, s.leg));

function makePending(state: GameState, s: Slot): PendingMatch {
  const me = state.player.slotId;
  if (s.kind === "fx") {
    const home = s.f.home === me;
    return { comp: "fx", label: s.label, opponent: home ? s.f.away : s.f.home, home, games: [], doubles: s.doubles };
  }
  const isA = s.t.a === me;
  const h = nextHome(s.t);
  return { comp: "tie", tie: s.ref, label: s.label, opponent: isA ? s.t.b : s.t.a, home: h === (isA ? 0 : 1), games: [], doubles: s.doubles };
}

export function pendingDecided(state: GameState): boolean {
  const p = state.pending;
  if (!p) return false;
  if (p.comp === "fx") return p.games.length >= 1;
  const t = findTie(state, p.tie!);
  return !t || !needsGame(t, p.tie!.leg);
}

export function pendingVenueName(state: GameState): string | undefined {
  const ref = state.pending?.tie;
  const t = ref && findTie(state, ref);
  if (!ref || !t) return;
  const venue = tieVenue(state, ref.kind, t, ref.kind === "psb" ? ref.key : undefined);
  return venue && venueName(state, venue);
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
export function recordPlayerGame(state: GameState, r: MatchResult, logs: string[] = []): TreatResult | null {
  const p = state.pending;
  if (!p || (p.comp === "fx" && p.games.length > 0)) return null;
  p.games.push({ w: r.winner, my: r.remaining[0], opp: r.remaining[1] });
  if (p.comp === "tie") {
    const t = findTie(state, p.tie!);
    if (t) {
      if (p.tie?.kind === "cup") t.host ??= cupHost(state, t);
      if (p.tie?.kind === "psb") t.host ??= psbHost(state, p.tie.key, t);
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
  // cup games: pick indices point into the registered team
  const team = p.doubles ? playerCupTeam(state).idx.map(i => entryTeam(state)[i]) : entryTeam(state);
  if (pendingCompetition(p) === "league") {
    recordLeaguePicks(state, state.player.slotId, team, r.picks[0]);
    recordLeaguePicks(state, p.opponent, sideFor(state, p.opponent).team, r.picks[1]);
  }
  const oppTeam = sideFor(state, p.opponent, !!p.doubles).team;
  const comp = p.tie ? tieComp(p.tie) : compOf(pendingCompetition(p), state.player.region);
  rememberPlayerPressGame(state, p, [team, oppTeam], r, p.tie ? findTie(state, p.tie) : undefined);
  recordGame(state, comp, [state.player.slotId, p.opponent], [team, oppTeam], r);
  rememberMeeting(state, [state.player.slotId, p.opponent], [team, oppTeam], r);
  r.picks[0].forEach(i => {
    const m = team[i];
    if (!m) return;
    m.record.played++;
    if (r.winner === 0) m.record.wins++;
    m.record.kos += r.kos[0][i] || 0;
    gainExp(m, r.winner === 0 ? 130 : 80, logs);
  });
  onHurtFielded(state, r.picks[0].map(i => team[i]).filter(Boolean) as OwnedMon[], koSpecies);
  const treat = afterBattle(state, r.after?.[0]);
  logs.push(...treatLines(state, treat));
  // routine reports (levels, treatment) go into one message per week; a club that could not pay is told apart
  if (logs.length) {
    const week = Math.floor((state.day + 3) / 7);
    const opp = displayName(state, p.opponent);
    pushMsgMerged(state, "train", `games:${week}`, c => (c > 1 ? `이번 주 경기 기록 (${c}경기)` : `경기 기록: ${p.label} vs ${opp}`), `[${p.label} vs ${opp}]\n${logs.join("\n")}`);
  }
  if (treat.left.length) pushMsg(state, "money", "치료비 부족", treatLines(state, treat).join("\n"));
  return treat;
}

async function simSlots(state: GameState, slots: Slot[], sim: Simulator, onProgress?: (d: number, t: number) => void) {
  const leagueRanks = new Map<string, Map<string, number>>();
  for (let iter = 0; iter < 12; iter++) {
    const todo = slots.filter(slotOpen);
    if (!todo.length) return;
    // clubs that have not got ready yet today (a save loaded mid-day, a pairing settled only today) do it now
    prepareMatches(state, todo.map(s => slotPair(state, s)));
    const jobs: SimJob[] = todo.map(s => {
      if (s.kind === "fx") {
        const league = s.tag.startsWith("L");
        return { p1: sideFor(state, s.f.home, s.doubles, league, s.f.away), p2: sideFor(state, s.f.away, s.doubles, league, s.f.home), seed: `${state.seed}:${state.day}:${s.tag}`, doubles: s.doubles };
      }
      const h = nextHome(s.t);
      const [x, y] = h === 1 ? [s.t.b, s.t.a] : [s.t.a, s.t.b];
      return { p1: sideFor(state, x, s.doubles, false, y), p2: sideFor(state, y, s.doubles, false, x), seed: `${state.seed}:${state.day}:${s.tag}:${s.t.games.length}`, doubles: s.doubles };
    });
    const res = await sim(jobs, iter === 0 ? onProgress : undefined);
    todo.forEach((s, i) => {
      const r = res[i];
      if (s.kind === "fx" && s.tag.startsWith("L")) {
        recordLeaguePicks(state, s.f.home, jobs[i].p1.team, r.picks[0]);
        recordLeaguePicks(state, s.f.away, jobs[i].p2.team, r.picks[1]);
      }
      // records: who played (the job's p1 is the home side of this game)
      const owners: [string, string] = s.kind === "fx" ? [s.f.home, s.f.away] : nextHome(s.t) === 1 ? [s.t.b, s.t.a] : [s.t.a, s.t.b];
      recordGame(state, slotComp(s), owners, [jobs[i].p1.team, jobs[i].p2.team], r);
      rememberMeeting(state, owners, [jobs[i].p1.team, jobs[i].p2.team], r);
      const region = s.kind === "fx" && s.tag.startsWith("L") ? s.tag.split(":")[1] : undefined;
      const league = region ? state.leagues[region] : undefined;
      if (region && league?.nextRound && !leagueRanks.has(region)) {
        leagueRanks.set(region, new Map(standings(league).map((row, index) => [row.id, index + 1])));
      }
      const ranks = region ? leagueRanks.get(region) : undefined;
      recordNpcPressGame(state, owners, s.label, r, ranks ? [ranks.get(owners[0]) ?? 0, ranks.get(owners[1]) ?? 0] : undefined);
      if (s.kind === "fx") s.f.result = { h: r.remaining[0], a: r.remaining[1], w: r.winner };
      else if (nextHome(s.t) === 1) addGame(s.t, { w: r.winner === -1 ? -1 : r.winner === 0 ? 1 : 0, ra: r.remaining[1], rb: r.remaining[0] });
      else addGame(s.t, { w: r.winner, ra: r.remaining[0], rb: r.remaining[1] });
    });
  }
}

/** Competition key for Pokémon statistics and annual awards. */
function slotComp(s: Slot): string | null {
  if (s.kind === "fx") {
    if (s.tag.startsWith("L")) return `league:${s.tag.split(":")[1]}`;
    if (s.tag.startsWith("PWTG")) return "pwt";
    if (s.tag.startsWith("PCTG")) return "pct";
    if (s.tag.startsWith("ECTG")) return "ect";
    return null;
  }
  return tieComp(s.ref);
}

function tieComp(ref: TieRef): string {
  switch (ref.kind) {
    case "po":
    case "ko":
    case "pwtFinal":
      return "pwt";
    case "pctKo":
    case "pctFinal":
      return "pct";
    case "ectKo":
    case "ectFinal":
      return "ect";
    case "kpo":
    case "third":
      return ref.tier;
    case "cup":
      return `cup:${ref.region}`;
    case "psb":
      return "psb";
    case "super":
      return `super:${ref.region}`;
    case "world":
    case "worldSemi":
      return "worldSuper";
  }
}

interface Ctx {
  logs: string[];
  played: boolean;
  onProgress?: (d: number, t: number) => void;
}

/** Plays every game of an event. Returns a stop when the player has to play first. */
function fixtureGateImportance(state: GameState, slot: Slot & { kind: "fx" }) {
  if (!slot.tag.startsWith("L")) return 0;
  const { home, away } = slot.f;
  return leagueGateAfterLineup(state, home, leagueGateImportance(state, slot.tag.split(":")[1], home, away));
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
      npcGame(state, s.f.home, true, r.w === -1 ? -1 : r.w === 0 ? 0 : 1, fixtureGateImportance(state, s));
      npcGame(state, s.f.away, false, r.w === -1 ? -1 : r.w === 1 ? 0 : 1);
      npcPrize(state, s.f.home, feeOf(s));
      npcPrize(state, s.f.away, feeOf(s));
      return;
    }
    const venue = tieVenue(state, s.ref.kind, s.t, s.ref.kind === "psb" ? s.ref.key : undefined);
    const importance = tieGateImportance(s.ref);
    for (const g of s.t.games.slice(b.games)) {
      if (venue) settleVenueGate(state, venue, s.t.a, s.t.b, undefined, importance);
      npcGame(state, s.t.a, !venue && g.home === 0, g.w === -1 ? -1 : g.w === 0 ? 0 : 1, importance);
      npcGame(state, s.t.b, !venue && g.home === 1, g.w === -1 ? -1 : g.w === 1 ? 0 : 1, importance);
      npcPrize(state, s.t.a, feeOf(s));
      npcPrize(state, s.t.b, feeOf(s));
    }
  });
}

async function runMatches(state: GameState, slots: Slot[], sim: Simulator, ctx: Ctx): Promise<AdvanceResult | null> {
  const me = state.player.slotId;
  const mine = slots.find(s => involves(s, me));
  const before = slots.map(s => (s.kind === "fx" ? { done: !!s.f.result, games: 0 } : { done: false, games: s.t.games.length, winner: s.t.winner }));
  if (mine) {
    if (slotOpen(mine)) {
      state.pending ??= makePending(state, mine);
      if (!state.pending.games.length) prepareMatches(state, [slotPair(state, mine)]);
      if (!pendingDecided(state)) return { type: "match", pending: state.pending };
      if (mine.kind === "fx") {
        const g = state.pending.games[0];
        const home = mine.f.home === me;
        mine.f.result = home ? { h: g.my, a: g.opp, w: g.w } : { h: g.opp, a: g.my, w: g.w === -1 ? -1 : g.w === 0 ? 1 : 0 };
      }
    }
    const p = state.pending;
    if (p) {
      const venue = mine.kind === "tie"
        ? tieVenue(state, mine.ref.kind, mine.t, mine.ref.kind === "psb" ? mine.ref.key : undefined)
        : undefined;
      const neutral = mine.kind === "tie" && mine.t.format === "bo3";
      const league = mine.kind === "fx" && mine.tag.startsWith("L");
      const importance = mine.kind === "tie" ? tieGateImportance(mine.ref) : fixtureGateImportance(state, mine);
      for (const g of p.games) {
        if (venue && mine.kind === "tie") settleVenueGate(state, venue, mine.t.a, mine.t.b, ctx.logs, importance);
        onMatchResult(state, !venue && p.home, g.w, ctx.logs, importance);
        onGameResult(state, g.w, league, () => aboveExpectation(state, me));
        npcGame(state, p.opponent, !venue && !p.home && !neutral, g.w === -1 ? -1 : g.w === 0 ? 1 : 0, importance);
        payClub(state, me, feeOf(mine), "중계권료", ctx.logs);
        payClub(state, p.opponent, feeOf(mine));
      }
      finishPlayerPressMatch(state, { streakAfter: state.player.streak });
      state.pending = null;
    }
    ctx.played = true;
  }
  await simSlots(state, slots, sim, ctx.onProgress);
  npcAfter(state, slots, before);
  return null;
}

function tieLog(state: GameState, s: Slot & { kind: "tie" }, ctx: Ctx, final = false) {
  const me = state.player.slotId;
  const t = s.t;
  const opp = displayName(state, t.a === me ? t.b : t.a);
  if (!t.winner) {
    ctx.logs.unshift(`${s.label} vs ${opp} — ${tieText(t, me)}`);
    return;
  }
  const won = t.winner === me;
  ctx.logs.unshift(`${s.label} vs ${opp} — ${tieText(t, me)} · ${won ? (final ? "우승!" : "다음 라운드 진출") : final ? "준우승" : "탈락"}`);
  const comp = s.label.replace(/\s*\(더블배틀\)$/, "");
  onStage(state, comp, won ? (final ? "title" : "advance") : final ? "runnerUp" : "out");
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

/**
 * Will the player play this competition this season? League and regional cup: always.
 * PWT: a direct place or a playoff spot. PCT: on the PCT list (before the PWT field is final, counted
 * as if the playoffs left the player out, so a playoff club sees both). "maybe" = depends on the playoff.
 */
export function entersCompetition(state: GameState, comp: Competition): boolean | "maybe" {
  if (comp === "league" || comp === "cup") return true;
  const me = state.player.slotId;
  const qual = state.qual && state.qual.season === state.season ? state.qual : buildQual(livePrev(state, state.season), state.season, rngFor(state, "po"));
  const inPo = qual.po.entrants.includes(me) && !state.pwt;
  if (comp === "pwt") return state.pwt ? state.pwt.entrants.includes(me) : qual.direct.includes(me) || qual.po.entrants.includes(me);
  const pwtField = state.pwt ? state.pwt.entrants : qual.direct;
  if (comp === "pct") {
    if (state.pct) return takesPart(state.pct, me);
    if (!pctEntrants(state.prev, state.season, pwtField).order.includes(me)) return false;
    return inPo ? "maybe" : true;
  }
  // PCT (3rd tier)
  if (state.ect) return takesPart(state.ect, me);
  const pstField = state.pct ? state.pct.entrants : pctEntrants(state.prev, state.season, pwtField).order;
  if (!pctEntrants(state.prev, state.season, [...pwtField, ...pstField], "ect").order.includes(me)) return false;
  return inPo ? "maybe" : true;
}

// ---------- events ----------

async function processEvent(state: GameState, ev: CalEvent, sim: Simulator, ctx: Ctx): Promise<AdvanceResult | null> {
  const me = state.player.slotId;
  const p = state.player;
  const requireRegistration = (comp: Competition): AdvanceResult | null => {
    if (registrationOf(state, comp)) return null;
    state.registrationDue = comp;
    return { type: "registration", competition: comp };
  };
  // Gate the opening/draw before revealing opponents. The same gate covers old saves mid-season.
  if (ev.kind === "league") { const stop = requireRegistration("league"); if (stop) return stop; }
  if (ev.kind === "cupDraw" || ev.kind === "cup" || ev.kind === "cupFinal" || ev.kind === "cupThird") { const stop = requireRegistration("cup"); if (stop) return stop; }
  if (ev.kind === "koThird" && takesPart(tour(state, ev.tier), me)) { const stop = requireRegistration(ev.kind === "koThird" ? ev.tier : "pwt"); if (stop) return stop; }
  if (ev.kind === "groupDraw" || ev.kind === "po") {
    ensureQual(state, state.season);
    if (state.qual.direct.includes(me) || state.qual.po.entrants.includes(me)) { const stop = requireRegistration("pwt"); if (stop) return stop; }
  }
  if (ev.kind === "pctDraw" && state.pwt) {
    const preview = startPct(state.prev, state.season, state.pwt.entrants, rngFor(state, "pct"));
    if (preview.entrants.includes(me)) { const stop = requireRegistration("pct"); if (stop) return stop; }
  }
  if (ev.kind === "ectDraw" && state.pwt && state.pct) {
    const preview = startEct(state.prev, state.season, [...state.pwt.entrants, ...state.pct.entrants], rngFor(state, "ect"));
    if (preview.entrants.includes(me)) { const stop = requireRegistration("ect"); if (stop) return stop; }
  }
  if (["group", "pctGroup", "ectGroup", "ko", "pctKo", "ectKo", "pwtFinal", "pctFinal", "ectFinal"].includes(ev.kind)) {
    const comp: Competition = tierOfEvent(ev.kind);
    if (takesPart(tour(state, comp as Tier), me)) { const stop = requireRegistration(comp); if (stop) return stop; }
  }
  if (ev.kind === "kpo") {
    for (const tier of ["pct", "ect"] as const) if (takesPart(tour(state, tier), me) && (tour(state, tier)?.kpo || []).some(t => t.a === me || t.b === me)) {
      // dropped in from the tier above: that roster carries over
      const regs = (state.player.registrations ||= {});
      const above = tier === "pct" ? "pwt" : "pct";
      if (!regs[tier] && regs[above]) regs[tier] = { ...regs[above]!, uids: regs[above]!.uids.slice() };
      const stop = requireRegistration(tier);
      if (stop) return stop;
    }
  }
  switch (ev.kind) {
    case "goldenMasterBall": {
      const winner = awardGoldenMasterBall(state);
      if (winner) {
        const title = `${winner.pokemonName}, ${GOLDEN_MASTER_BALL} 수상`;
        const trophies = winner.trophies.length ? ` 주요 우승 기록은 ${winner.trophies.join("·")}.` : "";
        const body = `${winner.trainerName} 소속으로 ${winner.appearances}경기에서 ${winner.kos}KO를 기록했다.${trophies}`;
        addPressStory(state, "award", "golden-master-ball", title, body, undefined, GOLDEN_MASTER_BALL_PUBLISHER);
        news(state, title, body);
        queueGoldenCeremony(state, GOLDEN_MASTER_BALL_PUBLISHER, GOLDEN_MASTER_BALL, winner);
      }
      return null;
    }
    case "sponsorOffers":
      sponsorOffersEvent(state);
      (state as any).regNotice = state.season; // first Monday of August: the season's registration notice
      return null;
    case "po": {
      // August preseason playoff for this season's PWT, from last season's tables
      const target = state.season;
      ensureQual(state, target);
      if (!state.qual.announced) {
        state.qual.announced = true;
        const q = state.qual;
        const myPo = q.po.ties.find(t => t.a === me || t.b === me);
        if (q.direct.includes(me)) pushMsg(state, "pwt", `시즌 ${target} PWT 진출 확정`, `${q.seeds[me]} 자격으로 PWT 조별리그에 나갑니다.`);
        else if (q.po.byes.includes(me)) pushMsg(state, "pwt", "PWT 플레이오프 부전승", "4위 중 전 시즌 승점이 가장 높아 부전승으로 PWT에 나갑니다.");
        else if (myPo) pushMsg(state, "pwt", "PWT 플레이오프 대진", `${displayName(state, myPo.a === me ? myPo.b : myPo.a)}와(과) 단판 승부. 이기면 PWT 조별리그에 나갑니다.`);
        if (q.po.entrants.includes(me)) return { type: "draw", draws: [q.po.draw], summary: [] };
      }
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "tie") tieLog(state, mine, ctx);
      return null;
    }
    case "groupDraw": {
      if (state.pwt && state.pwt.season === state.season) return null;
      ensureQual(state, state.season);
      if (!qualDone(state.qual)) {
        const slots = state.qual.po.ties.map((t, idx) => ({ kind: "tie" as const, t, leg: 0, tag: `PO${idx}`, label: "PWT 플레이오프", ref: { kind: "po" as const, idx, leg: 0 } }));
        await simSlots(state, slots, sim);
      }
      state.pwt = startPwt(state.qual, state.prev, rngFor(state, "groups"));
      const gi = groupIndex(state.pwt, me);
      if (gi >= 0) {
        const others = state.pwt.groups[gi].filter(x => x !== me).map(x => displayName(state, x));
        pushMsg(state, "pwt", `PWT 조 추첨: ${GROUP_NAMES[gi]}조`, `같은 조: ${others.join(", ")}\n조 2위 안에 들면 1월 토너먼트에 나갑니다.`);
        groupDrawPress(state, "PWT", gi, others);
      } else pushMsg(state, "pwt", "PWT 조 추첨 완료", "이번 시즌 PWT에는 나가지 못합니다.");
      return { type: "draw", draws: [state.pwt.groupDraw], summary: [] };
    }
    case "cupDraw": {
      if (state.cups && Object.values(state.cups)[0]?.season === state.season && !isSwissCup(Object.values(state.cups)[0])) return null;
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
        const opponent = displayName(state, t.a === me ? t.b : t.a);
        const title = `${regionById(p.region).name} 컵 대진 추첨`;
        pushMsg(state, "info", title, `${key.startsWith("0") ? "A" : "B"}윙 ${key.slice(1)} 자리 · 첫 상대: ${opponent} (${when})\n컵 경기는 모두 단판 더블배틀입니다 (6마리 중 4마리 선택).`);
        addPressStory(state, "draw", "cup", `${title} · ${p.name}의 첫 상대는 ${opponent}`, `${when}에 첫 경기가 열린다. 모든 라운드는 단판 더블배틀이다.`, p.region);
      }
      return { type: "draw", draws: [mine.draw], summary: [] };
    }
    case "koDraw":
    case "pctKoDraw":
    case "ectKoDraw": {
      const tier = tierOfEvent(ev.kind);
      const T = tour(state, tier);
      if (!T || T.koDraw) return null;
      drawPwtKnockout(T, rngFor(state, tier === "pwt" ? "ko" : tier === "pct" ? "pctko" : "ectko"));
      const t = T.ko[0].find(x => x.a === me || x.b === me);
      if (t) {
        const opponent = displayName(state, t.a === me ? t.b : t.a);
        const home = t.a === me ? "1차전" : "2차전";
        pushMsg(state, "pwt", `${T.name} 16강 추첨`, `상대: ${opponent} (1월 ${home} 홈)`);
        addPressStory(state, "draw", `${tier}:ko`, `${TIER_NAME[tier]} 16강 대진 확정 · ${p.name}–${opponent}`, `${p.name} 측은 ${home}을 홈에서 치른다.`, p.region);
      }
      if (tier !== "pwt" && !takesPart(T, me)) return null;
      return { type: "draw", draws: [T.koDraw!], summary: [] };
    }
    case "pctDraw": {
      if (state.pct && state.pct.season === state.season) return null;
      if (!state.pwt) return null;
      state.pct = startPct(state.prev, state.season, state.pwt.entrants, rngFor(state, "pct"));
      const gi = groupIndex(state.pct, me);
      if (gi < 0) return null;
      const others = state.pct.groups[gi].filter(x => x !== me).map(x => displayName(state, x));
      pushMsg(state, "pwt", `PST 조 추첨: ${GROUP_NAMES[gi]}조`, `${state.pct.seeds[me]} 자격으로 포켓몬 스타 토너먼트(PST)에 나갑니다.\n같은 조: ${others.join(", ")}\n조 1위는 16강, 조 2위는 PWT 조 3위와 녹아웃 플레이오프를 치릅니다.`);
      groupDrawPress(state, "PST", gi, others);
      return { type: "draw", draws: [state.pct.groupDraw], summary: [] };
    }
    case "ectDraw": {
      if (state.ect && state.ect.season === state.season) return null;
      if (!state.pwt || !state.pct) return null;
      state.ect = startEct(state.prev, state.season, [...state.pwt.entrants, ...state.pct.entrants], rngFor(state, "ect"));
      const gi = groupIndex(state.ect, me);
      if (gi < 0) return null;
      const others = state.ect.groups[gi].filter(x => x !== me).map(x => displayName(state, x));
      pushMsg(state, "pwt", `PCT 조 추첨: ${GROUP_NAMES[gi]}조`, `${state.ect.seeds[me]} 자격으로 포켓몬 챌린저스 토너먼트(PCT)에 나갑니다.\n같은 조: ${others.join(", ")}\n조 1위는 16강, 조 2위는 PST 조 3위와 녹아웃 플레이오프를 치릅니다.`);
      groupDrawPress(state, "PCT", gi, others);
      return { type: "draw", draws: [state.ect.groupDraw], summary: [] };
    }
    case "kpoDraw": {
      const draws: DrawData[] = [];
      for (const [lower, upper] of [["pct", "pwt"], ["ect", "pct"]] as const) {
        const L = tour(state, lower);
        const U = tour(state, upper);
        if (!L || !U || L.kpo || !groupStageDone(L) || !groupStageDone(U)) continue;
        drawKoPlayoff(L, U, rngFor(state, `kpo:${lower}`));
        const t = L.kpo!.find(x => x.a === me || x.b === me);
        if (t) {
          pushMsg(state, "pwt", `${TIER_NAME[lower]} 녹아웃 플레이오프 추첨`, `상대: ${displayName(state, t.a === me ? t.b : t.a)} (${t.a === me ? "1차전 홈" : "2차전 홈"})\n이기면 16강에서 조 1위 팀을 만납니다.`);
          const opponent = displayName(state, t.a === me ? t.b : t.a);
          addPressStory(state, "draw", `${lower}:playoff`, `${TIER_NAME[lower]} 플레이오프에서 ${p.name}·${opponent} 맞대결`, "홈과 원정 두 경기로 16강 진출팀을 가린다.", p.region);
          draws.push(L.kpoDraw!);
        }
      }
      return draws.length ? { type: "draw", draws, summary: [] } : null;
    }
    case "kpo": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx);
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "pwt", `${mine.label.split(" ")[0]} 녹아웃 플레이오프 탈락`, tieText(mine.t, me));
      }
      return null;
    }
    case "cupThird":
    case "koThird": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "tie" && mine.t.winner) {
        const won = mine.t.winner === me;
        ctx.logs.unshift(`${mine.label.replace(/ \(더블배틀\)$/, "")} vs ${displayName(state, mine.t.a === me ? mine.t.b : mine.t.a)} — ${tieText(mine.t, me)} · ${won ? "3위" : "4위"}`);
        pushMsg(state, ev.kind === "cupThird" ? "info" : "pwt", `${mine.label.replace(/ \(더블배틀\)$/, "")} ${won ? "승리: 3위" : "패배: 4위"}`, tieText(mine.t, me));
      }
      return null;
    }
    case "psb": {
      const psb = (state.psb && state.psb.season === state.season ? state.psb : (state.psb = startPsb(state)));
      if (psb.champion) return null; // a save may already have settled the final under an earlier calendar
      if (ev.round === 1) psbSemis(psb, rngFor(state, "psb"));
      if (ev.round === 2) psbConfFinals(psb);
      if (ev.round === 3) psbFinal(psb);
      const conf = confOf(me, psb);
      if (ev.round === 0 && conf && (state as any).psbNotice !== state.season) {
        (state as any).psbNotice = state.season;
        const r1 = psb.ties[`${conf}:1`];
        const inR1 = r1 && (r1.a === me || r1.b === me);
        pushMsg(state, "pwt", `PSB(포켓몬 슈퍼볼) ${CONF_KO[conf]} 진출`, `리그 우승팀끼리 겨루는 PSB에 나갑니다. 모든 경기는 단판 더블배틀(지방 컵 등록 명단)입니다.\n${inR1 ? `${CONF_KO[conf]} 리그 우승팀 중 승점이 가장 낮아 1라운드부터 치릅니다. 상대: ${displayName(state, r1.a === me ? r1.b : r1.a)}` : "1라운드는 쉬고 4강부터 나갑니다."}`);
      }
      if (ev.round === 1 && conf) {
        const semi = psbKeys(1).map(k => psb.ties[k]).find(t => t && (t.a === me || t.b === me));
        if (semi) pushMsg(state, "pwt", `PSB ${CONF_KO[conf]} 4강 추첨`, `상대: ${displayName(state, semi.a === me ? semi.b : semi.a)}`);
      }
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx, ev.round === 3);
        if (mine.t.winner && mine.t.winner !== me && ev.round < 3) pushMsg(state, "pwt", `${mine.label.replace(/ \(더블배틀\)$/, "")} 탈락`, tieText(mine.t, me));
      }
      if (ev.round === 3 && psb.ties.final?.winner) {
        payPlaces(state, "psb", "PSB", psb.ties.final, null, ctx.logs);
        const champ = (psb.champion = psb.ties.final.winner);
        const f = psb.ties.final;
        news(state, `PSB 우승: ${displayName(state, champ)}`, `동부 ${displayName(state, f.a)} vs 서부 ${displayName(state, f.b)} — ${tieText(f)}\n시즌 ${state.season}의 마지막 경기에서 ${displayName(state, champ)}이(가) 포켓몬 슈퍼볼 정상에 올랐습니다.`);
        npcFame(state, champ, 8);
        if (champ === me) {
          p.titles.push(`시즌 ${state.season} PSB 우승`);
          addFame(state, 8, "PSB 우승", false);
          award(state, "cap:silver", "PSB");
        }
        if (mine) finishPlayerPressMatch(state, { finale: cupFinalePress(state, "PSB", champ === me) });
        const entered = !!conf && !registrationOf(state, "cup")?.withdrawn;
        queueTeamCeremony(state, "PSB", [champ], entered, "cup");
        compAwards(state, "psb", entered);
      }
      return null;
    }
    case "superCup":
    case "worldSemi":
    case "worldSuper": {
      prepareSupers(state);
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const label = ev.kind === "superCup" ? `${regionById(p.region).name} 슈퍼컵` : ev.kind === "worldSemi" ? "전국 슈퍼컵 준결승" : "전국 슈퍼컵";
      if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx, ev.kind !== "worldSemi");
        if (mine.t.winner === me && ev.kind !== "worldSemi") {
          p.titles.push(`시즌 ${state.season} ${label} 우승`);
          award(state, "cap:bronze", label);
        }
        if (mine.t.winner && ev.kind !== "worldSemi") finishPlayerPressMatch(state, { finale: cupFinalePress(state, label, mine.t.winner === me) });
      }
      if (ev.kind === "superCup") {
        for (const r of REGIONS) payPlaces(state, "super", `${r.name} 슈퍼컵`, state.supers?.regional[r.id], null, ctx.logs);
        queueTeamCeremony(state, label, [state.supers?.regional[p.region]?.winner], !!mine);
        news(state, `시즌 ${state.season} 지방 슈퍼컵 결과`, REGIONS.map(r => {
          const t = state.supers!.regional[r.id];
          return t ? `${r.name}: ${displayName(state, t.winner!)} 우승 (${displayName(state, t.a)} vs ${displayName(state, t.b)}, ${tieText(t)})` : "";
        }).filter(Boolean).join("\n"));
      } else if (ev.kind === "worldSemi" && state.supers?.semi?.winner) {
        const t = state.supers.semi;
        news(state, `전국 슈퍼컵 준결승: ${displayName(state, t.winner!)} 승리`, `PST 챔피언 ${displayName(state, t.a)} vs PCT 챔피언 ${displayName(state, t.b)} — ${tieText(t)}\n결승에서 PWT 챔피언과 맞붙습니다.`);
      } else if (ev.kind === "worldSuper" && state.supers?.world?.winner) {
        const t = state.supers.world;
        payPlaces(state, "super", "전국 슈퍼컵", t, null, ctx.logs);
        news(state, `전국 슈퍼컵: ${displayName(state, t.winner!)} 우승`, `PWT 챔피언 ${displayName(state, t.a)} vs ${displayName(state, t.b)} — ${tieText(t)}`);
        const semi = state.supers.semi;
        queueTeamCeremony(state, label, [t.winner], !!mine || semi?.a === me || semi?.b === me);
      }
      return null;
    }
    case "league": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      for (const r of REGIONS) {
        const lg = state.leagues[r.id];
        for (const f of lg.rounds[ev.round] || []) {
          applyResult(lg.table, f);
          if (!f.result) continue;
          const w = f.result.w;
          const records = leagueRecords(state, r.id);
          const previousWins = Math.max(0, ...Object.values(records.bestW).map(run => run.len));
          const previousLosses = Math.max(0, ...Object.values(records.bestL).map(run => run.len));
          leagueRun(state, r.id, f.home, w === -1 ? "d" : w === 0 ? "w" : "l");
          leagueRun(state, r.id, f.away, w === -1 ? "d" : w === 1 ? "w" : "l");
          for (const id of [f.home, f.away]) {
            const streak = records.run[id];
            const count = Math.abs(streak);
            const run = `${count}연${streak > 0 ? "승" : "패"}`;
            const who = displayName(state, id);
            if (count >= 4 && count > (streak > 0 ? previousWins : previousLosses)) {
              const record = `${run}으로 ${r.name} 리그 최장 ${streak > 0 ? "연승" : "연패"} 기록을 경신했다.`;
              if (id === me) finishPlayerPressMatch(state, { record });
              else addPressStory(state, "record", id, `${who}, ${r.name} 리그 신기록`, `${who} 측이 ${record}`, r.id);
            } else if (id !== me && count >= 3 && (count <= 5 || count % 3 === 0)) {
              addPressStory(state, "run", id, `${who}, ${r.name} 리그 ${run}`, `${r.name} 리그 ${ev.round + 1}라운드까지 ${count}경기 연속 ${streak > 0 ? "승리" : "패배"}를 기록했다.`, r.id);
            }
          }
        }
        lg.nextRound = ev.round + 1;
      }
      const mine = slots.find(s => involves(s, me));
      const rank = rankOf(state.leagues[p.region], me);
      if (mine && mine.kind === "fx") {
        fxLog(state, mine, ctx, `, 현재 ${rank}위`);
        finishPlayerPressMatch(state, { rankAfter: rank });
      }
      if (ev.round + 1 === LEAGUE_ROUNDS / 2) {
        const leader = standings(state.leagues[p.region])[0];
        addPressStory(state, "result", "midseason", `${regionById(p.region).name} 리그 반환점, 선두는 ${displayName(state, leader.id)}`, `전반기를 승점 ${leader.pts}점으로 마쳤다. ${p.name} 측은 현재 ${rank}위다.`, p.region);
      }
      if (ev.round === LEAGUE_ROUNDS - 1) {
        leagueEnd(state, ctx.logs);
        if (mine) finishPlayerPressMatch(state, { finale: leagueFinalePress(state, rank) });
      }
      return null;
    }
    case "group":
    case "pctGroup":
    case "ectGroup": {
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const tier = tierOfEvent(ev.kind);
      const pwt = tour(state, tier)!;
      const N = TIER_NAME[tier];
      if (mine && mine.kind === "fx") {
        const gi = groupIndex(pwt, me);
        const rank = groupTable(pwt, gi).findIndex(r => r.id === me) + 1;
        fxLog(state, mine, ctx, `, ${GROUP_NAMES[gi]}조 ${rank}위`);
        const f = mine.f;
        if (ev.md === 5) {
          // PWT: top 2 to the round of 16, 3rd to the PST playoff. PST / PCT: 1st to the round of 16, 2nd to the playoff, PST 3rd to the PCT playoff
          const top = tier === "pwt" ? 2 : 1;
          const drop = tier !== "ect" && rank === 3;
          const playoff = tier !== "pwt" && rank === 2;
          const adv = rank <= top;
          const next = tier === "pwt" ? "PST" : "PCT";
          pushMsg(
            state,
            "pwt",
            adv ? `${N} 조별리그 통과 (${GROUP_NAMES[gi]}조 ${rank}위)` : playoff ? `${N} 녹아웃 플레이오프 진출 (${GROUP_NAMES[gi]}조 2위)` : drop ? `${N} 조 3위: ${next} 플레이오프로 (${GROUP_NAMES[gi]}조)` : `${N} 조별리그 탈락 (${GROUP_NAMES[gi]}조 ${rank}위)`,
            adv ? "1월 첫 월요일에 토너먼트 대진을 추첨합니다." : playoff || drop ? "12월 첫 월요일에 녹아웃 플레이오프 대진을 추첨합니다. 홈·원정 2경기를 치르고, 이기면 16강에 나갑니다." : "",
          );
          onStage(state, `${N} 조별리그`, adv || playoff || drop ? "advance" : "out");
          finishPlayerPressMatch(state, { phase: `${GROUP_NAMES[gi]}조 ${rank}위로 조별리그를 마쳤다. ${adv ? "16강에 진출했다." : playoff ? "녹아웃 플레이오프에 나선다." : drop ? `${next} 플레이오프로 이동한다.` : "조별리그에서 탈락했다."}` });
        } else {
          finishPlayerPressMatch(state, { phase: `경기 후 ${GROUP_NAMES[gi]}조 ${rank}위에 자리했다.` });
        }
      }
      return null;
    }
    case "cup":
    case "cupFinal": {
      await catchUpCup(state, ev.kind === "cupFinal" ? ROUND_KEYS.length : ev.round, sim);
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const cupName = `${regionById(p.region).name} 컵`;
      if (ev.kind === "cupFinal") {
        for (const r of REGIONS) {
          const c = state.cups?.[r.id];
          if (c?.ties.F?.winner) c.champion = c.ties.F.winner;
        }
        for (const r of REGIONS) npcFame(state, state.cups?.[r.id]?.champion, 6);
        for (const r of REGIONS) payPlaces(state, "cup", `${r.name} 컵`, state.cups?.[r.id]?.ties.F, state.cups?.[r.id]?.ties.T, ctx.logs);
        npcJudge(state, "cup");
        const champ = state.cups?.[p.region]?.champion;
        news(state, `시즌 ${state.season} 지방 컵 우승자`, REGIONS.map(r => `${r.name} 컵: ${state.cups?.[r.id]?.champion ? displayName(state, state.cups[r.id].champion!) : "-"}`).join("\n"));
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, true);
        if (champ === me) {
          p.titles.push(`시즌 ${state.season} ${cupName} 우승`);
          addFame(state, 6, `${cupName} 우승`, false);
          award(state, "cap:silver", cupName);
        }
        if (mine) finishPlayerPressMatch(state, { finale: cupFinalePress(state, cupName, champ === me, "cup") });
        const cup = state.cups?.[p.region];
        const entered = !!cup && cupPath(cup, me).length > 0 && !registrationOf(state, "cup")?.withdrawn;
        queueTeamCeremony(state, cupName, podiumRanks(cup?.ties.F, cup?.ties.T), entered, "cup");
        compAwards(state, "cup", entered);
        judgeObjectives(state, "cup", ctx.logs);
      } else if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx);
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "info", `${cupName} ${CUP_ROUND_NAMES[ev.round]} 탈락`, tieText(mine.t, me));
      }
      return null;
    }
    case "ko":
    case "pctKo":
    case "ectKo":
    case "pwtFinal":
    case "pctFinal":
    case "ectFinal": {
      const tier = tierOfEvent(ev.kind);
      const T = tour(state, tier);
      const final = ev.kind === "pwtFinal" || ev.kind === "pctFinal" || ev.kind === "ectFinal";
      if (final && T?.champion) return null;
      const slots = eventSlots(state, ev);
      const stop = await runMatches(state, slots, sim, ctx);
      if (stop) return stop;
      const mine = slots.find(s => involves(s, me));
      const N = TIER_NAME[tier];
      if (final) {
        if (T?.final?.winner) {
          T.champion = T.final.winner;
          news(state, `${N} 우승: ${displayName(state, T.champion)}`, `${T.seeds[T.champion] || ""} 자격으로 나선 ${displayName(state, T.champion)}이(가) ${TIER_LONG[tier]} 정상에 올랐습니다. 결승 ${displayName(state, T.final.a)} vs ${displayName(state, T.final.b)} ${tieText(T.final)}.`);
        }
        if (mine && mine.kind === "tie") tieLog(state, mine, ctx, true);
        payPlaces(state, tier, N, T?.final, T?.third, ctx.logs);
        const entered = takesPart(T, me) && !registrationOf(state, tier)?.withdrawn;
        queueTeamCeremony(state, N, podiumRanks(T?.final, T?.third), entered, tier);
        compAwards(state, tier, entered);
        npcFame(state, T?.champion, tier === "pwt" ? 15 : tier === "pct" ? 8 : 5);
        if (tier === "pwt" && T?.champion && T.champion !== me) npcRecruit(state, T.champion, "all", "PWT", "legend");
        if (tier === "pwt") npcJudge(state, "europe");
        if (T?.champion === me) {
          p.titles.push(`시즌 ${state.season} ${N} 우승`);
          addFame(state, tier === "pwt" ? 15 : tier === "pct" ? 8 : 5, `${N} 우승`, false);
          award(state, tier === "pwt" ? "cap:gold" : "cap:silver", N);
          if (tier === "pwt") awardTicket(state, "legend", "all", N); // PWT: every legendary in the nation, no mythicals
        }
        if (mine && T?.champion) finishPlayerPressMatch(state, { finale: cupFinalePress(state, N, T.champion === me, tier) });
        if (tier === "pwt") {
          judgeObjectives(state, "europe", ctx.logs);
          multiTitleNews(state);
          seasonRecord(state);
        }
      } else if (mine && mine.kind === "tie") {
        tieLog(state, mine, ctx);
        if (mine.t.winner && mine.t.winner !== me) pushMsg(state, "pwt", `${N} ${KO_ROUND_NAMES["round" in ev ? ev.round : 0]} 탈락`, tieText(mine.t, me));
      }
      return null;
    }
  }
}

/** Plays any earlier cup round that has not been played yet (saves converted from the old cup format). */
async function catchUpCup(state: GameState, upto: number, sim: Simulator) {
  for (let r = 0; r < upto; r++) {
    const open = cupSlots(state, r).filter(slotOpen);
    if (open.length) await simSlots(state, open, sim);
  }
}

function leagueEnd(state: GameState, logs: string[]) {
  const p = state.player;
  const lg = state.leagues[p.region];
  const rank = rankOf(lg, p.slotId);
  const prize = LEAGUE_PRIZE(rank);
  p.money += prize;
  const champ = standings(lg)[0];
  const leagueName = `${regionById(p.region).name} 리그`;
  const entered = !registrationOf(state, "league")?.withdrawn;
  queueTeamCeremony(state, leagueName, standings(lg).slice(0, 3).map(row => row.id), entered, "league");
  const next = rank <= 3 ? "다음 시즌 PWT 진출" : "다음 시즌 PWT 출전권 없음";
  pushMsg(state, "info", `${regionById(p.region).name} 리그 종료: ${rank}위`, `상금 ₽${prize.toLocaleString()}을 받았습니다. 우승: ${displayName(state, champ.id)}\n${next}`);
  if (rank === 1) {
    p.titles.push(`시즌 ${state.season} ${regionById(p.region).name} 리그 우승`);
    addFame(state, 10, `${regionById(p.region).name} 리그 우승`, false);
    onStage(state, `${regionById(p.region).name} 리그`, "title");
    award(state, "cap:silver", `${regionById(p.region).name} 리그`);
    awardTicket(state, "both", p.region, `${regionById(p.region).name} 리그`);
  }
  seasonFame(state, expectedRanks(state, p.region)[p.slotId] || rank, rank);
  judgeObjectives(state, "league", logs);
  npcLeagueEnd(state);
  news(state, `시즌 ${state.season} 지방 리그 우승자`, REGIONS.map(r => {
    const top = standings(state.leagues[r.id])[0];
    return `${r.name}: ${displayName(state, top.id)} (승점 ${top.pts})`;
  }).join("\n"));
  // individual awards of every league, like a golden boot
  const awards = REGIONS.flatMap(r => {
    const top = standings(state.leagues[r.id])[0];
    return top ? leagueEndRecords(state, r.id, { id: top.id, pts: top.pts }) : [];
  });
  individualPress(state, `${regionById(p.region).name} 리그`, awards.filter(a => a.region === p.region));
  news(state, `시즌 ${state.season} 리그 개인상`, REGIONS.map(r => {
    const list = awards.filter(a => a.region === r.id);
    return list.length ? `[${r.name}] ${awardLine(state, list)}` : "";
  }).filter(Boolean).join("\n"));
  honourAwards(state, awards, a => `${regionById(a.region).name} 리그`);
  if (entered) queueIndividualCeremonies(state, leagueName, awards.filter(a => a.region === p.region));
  logs.unshift(`리그 최종 ${rank}위 · 상금 ₽${prize.toLocaleString()} · ${next}`);
}

/** An award winner's name: the nickname the player gave it, or its species name. */
const awardMon = (state: GameState, a: Award) => (a.owner === state.player.slotId && state.player.squad.find(m => m.uid === a.uid)?.nickname) || koSpecies(a.species);
const awardUnit = (a: Award) => (a.kind === "k" ? `${a.value} KO` : `${a.value.toLocaleString()} HP`);
const awardLine = (state: GameState, list: Award[]) => list.map(a => `${AWARD_KO[a.kind]} ${displayName(state, a.owner)}의 ${awardMon(state, a)} (${awardUnit(a)})`).join(" · ");

/** The player's individual awards: noted on the Pokémon, told in the news, and one 동색병뚜껑 each. */
function honourAwards(state: GameState, awards: Award[], compName: (a: Award) => string) {
  const p = state.player;
  for (const a of awards.filter(x => x.owner === p.slotId)) {
    const m = p.squad.find(x => x.uid === a.uid);
    const text = `시즌 ${a.season} ${compName(a)} ${AWARD_KO[a.kind]} (${awardUnit(a)})`;
    if (m) (m.awards ||= []).push(text);
    addItem(state, "cap:bronze");
    pushMsg(state, "info", `개인상 수상: ${awardMon(state, a)}`, `${text}을 받았습니다!\n부상으로 동색병뚜껑 1개를 받았습니다 (모든 개체값 +1, 스쿼드 → 능력치 보기).`);
  }
}

/** A cup / PWT / PCT is over: its individual awards. */
function compAwards(state: GameState, comp: "cup" | "pwt" | "pct" | "ect" | "psb", entered: boolean) {
  if (comp === "cup") {
    const all = REGIONS.flatMap(r => (state.cups?.[r.id]?.champion ? compEndAwards(state, "cup", r.id) : []));
    if (all.length) news(state, `시즌 ${state.season} 지방 컵 개인상`, REGIONS.map(r => {
      const list = all.filter(a => a.region === r.id);
      return list.length ? `[${r.name} 컵] ${awardLine(state, list)}` : "";
    }).filter(Boolean).join("\n"));
    honourAwards(state, all, a => `${regionById(a.region).name} 컵`);
    const name = `${regionById(state.player.region).name} 컵`;
    const local = all.filter(a => a.region === state.player.region);
    individualPress(state, name, local);
    if (entered) queueIndividualCeremonies(state, name, local);
    return;
  }
  const N = comp === "psb" ? "PSB" : TIER_NAME[comp];
  const list = compEndAwards(state, comp, state.player.region);
  if (list.length) news(state, `시즌 ${state.season} ${N} 개인상`, awardLine(state, list));
  if (entered) {
    individualPress(state, N, list);
    queueIndividualCeremonies(state, N, list);
  }
  honourAwards(state, list, () => N);
}

function groupDrawPress(state: GameState, name: string, group: number, opponents: string[]) {
  addPressStory(state, "draw", name, `${name} 조 추첨 · ${state.player.name}, ${GROUP_NAMES[group]}조`, `같은 조에서 ${josa(opponents.join("·"), "과와")} 만난다.`, state.player.region);
}

function individualPress(state: GameState, name: string, awards: Award[]) {
  const leading = awards[0];
  if (!leading) return;
  const who = `${displayName(state, leading.owner)}의 ${awardMon(state, leading)}`;
  const details = awards.slice(1).map(a => `${AWARD_KO[a.kind]}: ${displayName(state, a.owner)}의 ${awardMon(state, a)}`).join(" · ");
  addPressStory(state, "award", name, `${name} ${AWARD_KO[leading.kind]}, ${who}`, `${josa(who, "이가")} ${awardUnit(leading)}로 수상했다.${details ? ` ${details}.` : ""}`, state.player.region);
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
    pct: takesPart(state.pct, p.slotId) ? pwtResult(state.pct, null, p.slotId) : "-",
    ect: takesPart(state.ect, p.slotId) ? pwtResult(state.ect ?? null, null, p.slotId) : "-",
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
  add(state.pct?.champion, "PST");
  add(state.ect?.champion, "PCT");
  add(state.pwt?.champion, "PWT");
  for (const [id, list] of got) {
    if (list.length < 2) continue;
    const intl = list.find(x => x === "PWT" || x === "PST" || x === "PCT");
    const kind = list.length >= 3 ? (intl === "PWT" ? "트레블" : intl ? `트레블 (${intl})` : "트레블") : intl ? "더블" : "도메스틱 더블";
    const who = displayName(state, id);
    const mine = id === state.player.slotId;
    news(
      state,
      `[${kind}] ${who}, ${list.join("·")} 석권!`,
      `${who}이(가) 시즌 ${state.season}에 ${list.join(", ")} 우승을 모두 차지하며 ${kind}를 달성했습니다.${list.length >= 3 ? " 한 시즌 세 개의 트로피는 리그 역사에 남을 대기록입니다." : ""}${mine ? "\n팬들이 거리로 쏟아져 나와 우승 퍼레이드를 즐겼습니다!" : ""}`,
    );
    if (mine) {
      addFame(state, list.length >= 3 ? 10 : 4, kind, false);
      state.player.fans += list.length >= 3 ? 2000 : 600;
    }
  }
}

/** Fill the super cup pairings from the qualifying season, keeping played ties. */
export function fillSuperPairings(sp: NonNullable<GameState["supers"]>, prev: PrevSeason, projected = false) {
  if (prev.virtual) return;
  for (const r of REGIONS) {
    if (sp.regional[r.id]) continue;
    const table = prev.tables[r.id] || [];
    const league = table[0]?.id;
    const cup = prev.cupWinners?.[r.id];
    if (!league || (projected && !cup)) continue;
    const opp = cup && cup !== league ? cup : table[1]?.id;
    if (opp) sp.regional[r.id] = newTie(league, opp, "single");
  }
  // 전국 슈퍼컵: last season's PST winner vs PCT winner, the winner then plays the PWT winner
  const bothQualifiersKnown = !!prev.pctChampion && !!prev.ectChampion;
  if (sp.semi === undefined && (!projected || bothQualifiersKnown)) {
    sp.semi = bothQualifiersKnown && prev.pctChampion !== prev.ectChampion ? newTie(prev.pctChampion!, prev.ectChampion!, "single") : null;
  }
  if (!sp.world && prev.champion && (!projected || bothQualifiersKnown)) {
    const challenger = sp.semi ? sp.semi.winner : prev.pctChampion || prev.ectChampion;
    if (challenger && challenger !== prev.champion) sp.world = newTie(prev.champion, challenger, "single");
  }
}

function prepareSupers(state: GameState) {
  const target = state.season;
  if (!state.supers || state.supers.season !== target) state.supers = { season: target, regional: {}, world: null };
  fillSuperPairings(state.supers, state.prev);
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
  return { season: state.season, virtual: false, tables, champion: state.pwt?.champion, pctChampion: state.pct?.champion, ectChampion: state.ect?.champion ?? undefined, cupWinners };
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
  moodWeek(state);
  npcWeek(state);
  npcAiWeek(state);
}

export function endDay(state: GameState, logs: string[]) {
  friendlyEndDay(state);
  if (weekdayOf(state.day) === 0) {
    // Monday (never a match day): food for every Pokémon
    foodDay(state, logs);
    rescueCheck(state);
    npcFoodDay(state);
  }
  if (weekdayOf(state.day) === 6) weekly(state, logs);
  capturePressRosters(state, weekdayOf(state.day) === 6);
  maybePressRumor(state);
  state.day++;
  state.dayStep = 0;
  if (state.day >= seasonStart(state.season + 1)) newSeason(state);
  // June 30 is the official end of the season: loans and sponsor contracts end, next season's offers arrive
  if (state.day === dayOf(state.season, 7, 1)) {
    endLoans(state, state.season + 1);
    sponsorSeasonEnd(state);
  }
  sponsorDay(state, logs);
  loanDay(state, logs);
  treatDaily(state);
  npcDay(state);
  expireTickets(state);
  prepareForDay(state);
}

function newSeason(state: GameState) {
  if (state.pwt) seasonRecord(state);
  state.prev = prevFromState(state);
  state.season++;
  state.leagueLineups = {};
  state.player.registrations = {};
  delete state.registrationDue;
  state.friendlies = [];
  state.leagues = makeLeagues(state.season, state.seed);
  state.pwt = null;
  state.pct = null;
  state.ect = null;
  state.psb = null;
  state.cups = null;
  sponsorSeasonStart(state);
  endLoans(state);
  npcSeasonStart(state);
  pushMsg(state, "info", `시즌 ${state.season} 프리시즌`, "8월 첫 월요일 스폰서 제의, 셋째 주 수요일 PWT 진출권 발표, 마지막 주 슈퍼컵. 9월 첫 월요일 PWT 조 추첨, 첫 일요일 리그 개막입니다.");
}

/** Feb 1: a league / cup roster still in use that January could have changed is confirmed again (popup). */
export function winterConfirmDue(state: GameState): Competition | null {
  if (!isWinterConfirmDay(state)) return null;
  for (const comp of WINTER_COMPS) {
    const reg = registrationOf(state, comp);
    if (!reg || reg.withdrawn || reg.winterConfirmed) continue;
    if (comp === "cup") {
      const cup = state.cups?.[state.player.region];
      if (!cup || !cupAlive(cup, state.player.slotId)) continue;
    }
    return comp;
  }
  return null;
}

/** Jan 1: tell the player the league / cup rosters can be changed this month. */
function winterWindowOpens(state: GameState) {
  const d = dateOf(state.day);
  if (d.month !== 1 || d.date !== 1 || (state as any).winterNotice === state.season) return;
  (state as any).winterNotice = state.season;
  if (!WINTER_COMPS.some(c => registrationOf(state, c) && !registrationOf(state, c)!.withdrawn)) return;
  (state as any).regNotice = state.season;
  pushMsg(
    state,
    "info",
    "1월 등록 명단 변경 기간",
    "1월 31일까지 리그·지방 컵에 등록한 포켓몬 명단을 바꿀 수 있습니다 (대회 탭 → 대회 포켓몬 등록).\n2월 1일로 넘어갈 때 명단을 확정하면 시즌이 끝날 때까지 바꿀 수 없습니다.",
  );
}

/** Summary lines that start with this are shown in bold (Hub). */
export const EVO_NOTICE = "진화 가능";

/**
 * Squad Pokémon that can now evolve without an item (a level reached): said once at the top of the day summary
 * and in the news. Evolving itself is the manager's choice ([진화] in the squad).
 */
export function evolutionNotices(state: GameState, logs: string[]) {
  const fresh: string[] = [];
  for (const m of state.player.squad) {
    if (m.noEvolve) continue;
    const ready = evolutionOptions(m.species, m.level, !!m.hisuian, m.target).filter(e => e.ready && !e.item);
    const key = ready.map(e => e.id).join("/");
    if (!ready.length || m.evoNoted === key) continue;
    m.evoNoted = key;
    fresh.push(`${EVO_NOTICE}: ${m.nickname || koSpecies(m.species)} → ${ready.map(e => koSpecies(e.id)).join(" / ")}`);
  }
  if (!fresh.length) return;
  logs.unshift(...fresh);
  pushMsg(state, "train", fresh.length > 1 ? `${EVO_NOTICE} ${fresh.length}마리` : fresh[0], `${fresh.join("\n")}\n스쿼드에서 포켓몬을 고른 뒤 [능력치 보기]에서 [진화]를 누르면 진화합니다.`);
}

/** The longest stretch one "to my next match" press covers. */
export const TO_MY_NEXT_DAYS = 7;

/**
 * Advances day by day. Stops when the player has a match, a draw is held,
 * or (by default) after any day with fixtures or the weekly report on Sunday.
 * With `toMyNext`, keeps going until the player plays or a draw is held, but at most a week (so a mistaken
 * press can't skip the whole preseason).
 */
export async function advance(state: GameState, sim: Simulator, onProgress?: (d: number, t: number) => void, opts: { toMyNext?: boolean } = {}): Promise<AdvanceResult> {
  const ctx: Ctx = { logs: [], played: false, onProgress };
  const comp = pendingCompetition(state.pending);
  if (comp && !registrationOf(state, comp)) {
    state.registrationDue = comp;
    return { type: "registration", competition: comp };
  }
  // food unpaid two weeks running: the calendar waits until the club finds money (today's match is still played)
  if (moneyBlocked(state) && !state.pending) return { type: "day", summary: ["돈이 부족해 다음 날로 넘어갈 수 없습니다. 경영 탭에서 대출을 받거나 긴급 정리를 하세요."], day: state.day };
  const flush = () => {
    if (ctx.logs.length) state.lastWeekSummary = ctx.logs.slice(0, 40);
  };
  const firstDay = state.day;
  const queuedCeremonies = state.ceremonies?.length ?? 0;
  for (let guard = 0; guard < 130; guard++) {
    if (state.dayStep === 0) winterWindowOpens(state);
    // turning to Feb 1: confirm the rosters January allowed to change, like the season-start registration
    const winter = winterConfirmDue(state);
    if (winter) {
      state.registrationDue = winter;
      flush();
      return { type: "registration", competition: winter };
    }
    const evs = eventsOn(state.day);
    while (state.dayStep < evs.length) {
      const stop = await processEvent(state, evs[state.dayStep], sim, ctx);
      if (stop) {
        flush();
        return stop.type === "draw" ? { ...stop, summary: ctx.logs } : stop;
      }
      state.dayStep++;
    }
    // a preseason friendly the player agreed to: played after the day's official games
    const fr = friendlyToday(state);
    if (fr) {
      if (!state.pending) {
        const home = fr.home === state.player.slotId;
        state.pending = { comp: "fx", label: "친선경기", opponent: home ? fr.away : fr.home, home, games: [], friendly: true };
        flush();
        return { type: "match", pending: state.pending };
      }
      if (!state.pending.friendly || !pendingDecided(state)) {
        flush();
        return { type: "match", pending: state.pending };
      }
      const g = state.pending.games[0];
      settleFriendly(state, fr, { w: g.w, my: g.my, opp: g.opp }, ctx.logs);
      state.pending = null;
      ctx.played = true;
    }
    const day = state.day;
    const sunday = weekdayOf(day) === 6;
    const hadMatches = evs.length > 0 || !!fr;
    endDay(state, ctx.logs);
    // stop on the last day of sponsor offers so the player can still sign (or confirm going without)
    if ((state.ceremonies?.length ?? 0) > queuedCeremonies ||
        (opts.toMyNext ? ctx.played || day - firstDay >= TO_MY_NEXT_DAYS - 1 || offersLapsingToday(state) || moneyBlocked(state) : hadMatches || sunday || offersLapsingToday(state) || moneyBlocked(state))) {
      evolutionNotices(state, ctx.logs);
      flush();
      return { type: "day", summary: ctx.logs, day };
    }
  }
  evolutionNotices(state, ctx.logs);
  flush();
  return { type: "day", summary: ctx.logs, day: state.day - 1 };
}

// ---------- player schedule (for the UI) ----------

export interface ScheduleRow {
  day: number;
  comp: "league" | "pwt" | "pct" | "ect" | "cup" | "psb" | "friendly";
  label: string;
  opp: string | null; // null = not decided yet
  home: boolean | null;
  venue?: string;
  splitGate?: MatchVenue;
  importance?: number;
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

function scheduledTieGate(state: GameState, t: Tie, ref: TieRef) {
  const gate = tieVenue(state, ref.kind, t, ref.kind === "psb" ? ref.key : undefined);
  const importance = tieGateImportance(ref);
  if (!gate) return { home: (ref.leg === 0 ? t.a : t.b) === state.player.slotId, importance };
  const home = "host" in gate ? gate.host === state.player.slotId : null;
  return { home, venue: venueName(state, gate), splitGate: gate, importance };
}

export function playerSchedule(state: GameState): ScheduleRow[] {
  const me = state.player.slotId;
  const rows: ScheduleRow[] = [];
  for (const f of friendliesOf(state)) {
    if ((f.home !== me && f.away !== me) || (f.status !== "set" && f.status !== "played")) continue;
    const r = f.result;
    rows.push({
      day: f.day,
      comp: "friendly",
      label: "", // the "친선" badge says it all
      opp: f.home === me ? f.away : f.home,
      home: f.home === me,
      splitGate: { host: f.home, visitorShare: 0.3 },
      result: r ? `${r.w === -1 ? "무" : r.w === 0 ? "승" : "패"} ${r.my}:${r.opp}` : undefined,
      cls: r ? (r.w === -1 ? "" : r.w === 0 ? "good" : "bad") : undefined,
    });
  }
  const pwt = state.pwt;
  for (const ev of seasonEvents(state.season)) {
    switch (ev.kind) {
      case "league": {
        const f = state.leagues[state.player.region].rounds[ev.round]?.find(x => x.home === me || x.away === me);
        if (!f) break;
        const home = f.home === me;
        let importance = leagueGateImportance(state, state.player.region, f.home, f.away);
        if (ev.day === state.day && state.pending?.games.length && !state.pending.tie && !state.pending.friendly) {
          importance = leagueGateAfterLineup(state, f.home, importance);
        }
        const row: ScheduleRow = { day: ev.day, comp: "league", label: `리그 ${ev.round + 1}R`, opp: home ? f.away : f.home, home, importance };
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
        rows.push({ day: ev.day, comp: "pwt", label: "PWT 플레이오프", opp: t.a === me ? t.b : t.a, home: t.a === me, importance: tieGateImportance({ kind: "po", idx: 0, leg: 0 }), result: r?.text, cls: r?.cls });
        break;
      }
      case "cupThird": {
        const cup = state.cups?.[state.player.region];
        if (!cup || isSwissCup(cup)) break;
        const t = cup.ties.T;
        const wf = cupPath(cup, me).find(k => k.endsWith("WF"));
        const lostWf = wf && cup.ties[wf]?.winner && cup.ties[wf].winner !== me;
        if (t && (t.a === me || t.b === me)) {
          const r = legResult(t, 0, me);
          const gate = scheduledTieGate(state, t, { kind: "cup", region: cup.region, key: "T", leg: 0 });
          rows.push({ day: ev.day, comp: "cup", label: "컵 3·4위전 (더블)", opp: t.a === me ? t.b : t.a, ...gate, result: r?.text, cls: r?.cls });
        } else if (!t && lostWf) rows.push({ day: ev.day, comp: "cup", label: "컵 3·4위전 (더블)", opp: null, home: null });
        break;
      }
      case "koThird": {
        const T = tour(state, ev.tier);
        if (!T) break;
        const t = T.third;
        const sf = T.ko[2]?.find(x => x.a === me || x.b === me);
        const label = `${TIER_NAME[ev.tier]} 3·4위전`;
        if (t && (t.a === me || t.b === me)) {
          const r = legResult(t, 0, me);
          rows.push({ day: ev.day, comp: ev.tier, label, opp: t.a === me ? t.b : t.a, home: null, result: r?.text, cls: r?.cls });
        } else if (!t && sf?.winner && sf.winner !== me) rows.push({ day: ev.day, comp: ev.tier, label, opp: null, home: null });
        break;
      }
      case "psb": {
        const psb = state.psb && state.psb.season === state.season ? state.psb : null;
        const champ = standings(state.leagues[state.player.region])[0]?.id === me && state.leagues[state.player.region].nextRound >= LEAGUE_ROUNDS;
        const label = `PSB ${PSB_ROUND_KO[ev.round]} (더블)`;
        const key = psb && psbKeys(ev.round).find(k => {
          const t = psb.ties[k];
          return t && (t.a === me || t.b === me);
        });
        if (psb && key) {
          const t = psb.ties[key];
          const r = legResult(t, 0, me);
          const gate = scheduledTieGate(state, t, { kind: "psb", key, leg: 0 });
          rows.push({ day: ev.day, comp: "psb", label, opp: t.a === me ? t.b : t.a, ...gate, result: r?.text, cls: r?.cls });
        } else if (champ && (!psb || (ev.round > 0 && psbAlive(psb, me, ev.round)))) rows.push({ day: ev.day, comp: "psb", label, opp: null, home: null });
        break;
      }
      case "kpo": {
        for (const tier of ["pct", "ect"] as const) {
          const T = tour(state, tier);
          const t = T?.kpo?.find(x => x.a === me || x.b === me);
          if (t) {
            const r = legResult(t, ev.leg, me);
            rows.push({ day: ev.day, comp: tier, label: `${TIER_NAME[tier]} 플레이오프 ${legName(ev.leg)}`, opp: t.a === me ? t.b : t.a, home: ev.leg === 0 ? t.a === me : t.b === me, importance: tieGateImportance({ kind: "kpo", tier, idx: 0, leg: ev.leg }), result: r?.text, cls: r?.cls });
          } else if (T && !T.kpo && groupStageDone(T)) {
            // after the groups, before the draw: a runner-up (or the tier above's 3rd) waits for an opponent
            const U = tier === "pct" ? state.pwt : state.pct;
            const second = T.entrants.includes(me) && groupTable(T, groupIndex(T, me))[1]?.id === me;
            const third = !!U && U.entrants.includes(me) && groupStageDone(U) && groupTable(U, groupIndex(U, me))[2]?.id === me;
            if (second || third) rows.push({ day: ev.day, comp: tier, label: `${TIER_NAME[tier]} 플레이오프 ${legName(ev.leg)}`, opp: null, home: null });
          }
        }
        break;
      }
      case "group":
      case "pctGroup":
      case "ectGroup": {
        const tier = tierOfEvent(ev.kind);
        const T = tour(state, tier);
        if (!T || !T.entrants.includes(me)) break;
        const f = T.fixtures[ev.md].find(x => x.home === me || x.away === me)!;
        const home = f.home === me;
        const row: ScheduleRow = { day: ev.day, comp: tier, label: `${TIER_NAME[tier]} 조별 ${ev.md + 1}차전`, opp: home ? f.away : f.home, home };
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
        if (!cup || isSwissCup(cup)) break;
        const path = cupPath(cup, me);
        const keys = ev.kind === "cupFinal" ? ["F"] : ROUND_KEYS[ev.round].flatMap(k => ["0" + k, "1" + k]);
        const key = path.find(k => keys.includes(k));
        if (!key) break;
        const label = `컵 ${CUP_STAGE_NAME[key.replace(/^\d/, "")]} (더블)`;
        const t = cup.ties[key];
        if (t && (t.a === me || t.b === me)) {
          const r = legResult(t, 0, me);
          const gate = scheduledTieGate(state, t, { kind: "cup", region: cup.region, key, leg: 0 });
          rows.push({ day: ev.day, comp: "cup", label, opp: t.a === me ? t.b : t.a, ...gate, result: r?.text, cls: r?.cls });
        } else if (!t && cupAlive(cup, me)) rows.push({ day: ev.day, comp: "cup", label, opp: null, home: null });
        break;
      }
      case "superCup":
      case "worldSemi":
      case "worldSuper": {
        const t = ev.kind === "superCup" ? state.supers?.regional[state.player.region] : ev.kind === "worldSemi" ? state.supers?.semi : state.supers?.world;
        if (!t || (t.a !== me && t.b !== me) || state.supers!.season !== state.season) break;
        const r = legResult(t, 0, me);
        const ref: TieRef = ev.kind === "superCup" ? { kind: "super", region: state.player.region, leg: 0 }
          : { kind: ev.kind === "worldSemi" ? "worldSemi" : "world", leg: 0 };
        const gate = scheduledTieGate(state, t, ref);
        rows.push({ day: ev.day, comp: ev.kind === "superCup" ? "cup" : "pwt", label: ev.kind === "superCup" ? "슈퍼컵" : ev.kind === "worldSemi" ? "전국 슈퍼컵 준결승" : "전국 슈퍼컵", opp: t.a === me ? t.b : t.a, ...gate, result: r?.text, cls: r?.cls });
        break;
      }
      case "ko":
      case "pctKo":
      case "ectKo":
      case "pwtFinal":
      case "pctFinal":
      case "ectFinal": {
        const tier = tierOfEvent(ev.kind);
        const pwt = tour(state, tier);
        if (!pwt || !takesPart(pwt, me)) break;
        const N = TIER_NAME[tier];
        const isFinal = ev.kind === "pwtFinal" || ev.kind === "pctFinal" || ev.kind === "ectFinal";
        const round = "round" in ev ? ev.round : 3;
        const evLeg = "leg" in ev ? ev.leg : 0;
        const label = isFinal ? `${N} 결승` : `${N} ${KO_ROUND_NAMES[round]} ${legName(evLeg)}`;
        const t = isFinal ? pwt.final : pwt.ko[round]?.find(x => x.a === me || x.b === me);
        if (t && (t.a === me || t.b === me)) {
          const leg = evLeg;
          const r = legResult(t, leg, me);
          const stadium = finalStadium(ev.kind);
          rows.push({ day: ev.day, comp: tier, label, opp: t.a === me ? t.b : t.a, home: t.format === "bo3" ? null : leg === 0 ? t.a === me : t.b === me, venue: stadium, splitGate: stadium ? { stadium } : undefined, importance: isFinal ? 10 : round === 2 ? 7 : 4, result: r?.text, cls: r?.cls });
        } else if (!t && pwtAlive(pwt, me) && (isFinal || !pwt.ko[round])) rows.push({ day: ev.day, comp: tier, label, opp: null, home: null, venue: finalStadium(ev.kind) });
        break;
      }
    }
  }
  return rows;
}

export function nextTicketForecast(state: GameState, price: number) {
  const row = playerSchedule(state)
    .filter(r => r.day >= state.day && !r.result && r.opp && (r.home || r.splitGate))
    .sort((a, b) => a.day - b.day)[0];
  const importance = row?.importance ?? 0;
  const split = row?.splitGate && row.opp
    ? venueGate(state, row.splitGate, state.player.slotId, row.opp, importance, price)
    : null;
  const gate = split ?? homeGate(state, price, importance);
  const mayRepeat = row?.comp === "league" && !state.pending?.games.length && !!leagueLineupToAvoid(state, state.player.slotId);
  return { row, importance, mayRepeat, attendance: gate.attendance, income: split?.shareA ?? gate.income };
}

export function speciesLine(ids: string[]): string {
  return ids.map(koSpecies).join(", ");
}
