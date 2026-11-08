import { regionById } from "../data/dex";
import { LEAGUE_ROUNDS, seasonEvents } from "./calendar";
import { CUP_STAGE_NAME, cupPath, isSwissCup, type Cup } from "./cup";
import { GROUP_NAMES } from "./draw";
import { rankOf } from "./league";
import { PSB_ROUND_KO, confOf, psbKeys } from "./psb";
import { KO_NAMES, TIER_NAME, groupIndex, groupStageDone, groupTable, type PwtState, type Tier } from "./pwt";
import { registrationOf } from "./registration";
import { entersCompetition } from "./season";
import type { GameState } from "./state";
import type { Tie } from "./tie";

const BEFORE_DRAW = "대진 추첨 전";
const PLAYOFF = "녹아웃 플레이오프";
const ADVANCE = [...KO_NAMES, "결승"];

const involves = (tie: Tie | undefined | null, id: string): tie is Tie => tie?.a === id || tie?.b === id;

function groupPosition(tournament: PwtState, me: string) {
  const group = groupIndex(tournament, me);
  if (group < 0) return null;
  const rank = groupTable(tournament, group).findIndex(row => row.id === me) + 1;
  return { group, rank, done: groupStageDone(tournament) };
}

function internationalStatus(tournament: PwtState, tier: Tier, me: string, place: ReturnType<typeof groupPosition>, droppedIn: boolean, thirdPending: boolean): string | null {
  if (involves(tournament.final, me)) return finalStatus(tournament.final, me);
  if (tournament.champion === me) return "우승";
  for (let round = tournament.ko.length - 1; round >= 0; round--) {
    const tie = tournament.ko[round].find(t => involves(t, me));
    if (tie?.winner === me) return `${ADVANCE[round + 1]} 진출`;
    if (tie?.winner && round === KO_NAMES.length - 1) return thirdStatus(tournament.third, me, ADVANCE[round], thirdPending);
    if (tie) return `${ADVANCE[round]} ${tie.winner ? "탈락" : "진출"}`;
  }
  const playoff = tournament.kpo?.find(t => involves(t, me));
  if (playoff?.winner === me) return "16강 진출";
  if (playoff) return `${PLAYOFF} ${playoff.winner ? "탈락" : "진출"}`;
  if (!place) return droppedIn ? `${PLAYOFF} 진출` : null;
  if (!place.done) return `조별리그 ${GROUP_NAMES[place.group]}조 ${place.rank}위`;
  if (place.rank <= (tier === "pwt" ? 2 : 1)) return "16강 진출";
  if (tier !== "pwt" && place.rank === 2) return `${PLAYOFF} 진출`;
  return "조별리그 탈락";
}

function finalStatus(tie: Tie | undefined | null, me: string): string {
  if (!tie?.winner) return "결승 진출";
  return tie.winner === me ? "우승" : "준우승";
}

function thirdStatus(tie: Tie | undefined, me: string, stage: string, thirdPending: boolean): string {
  if (involves(tie, me) && tie.winner) return tie.winner === me ? "3위" : "4위";
  return `${stage} 탈락${thirdPending ? " · 3위 결정전 진출" : ""}`;
}

function regionalCupStatus(cup: Cup, me: string, thirdPending: boolean): string | null {
  if (cup.champion === me) return "우승";
  for (const key of cupPath(cup, me)) {
    const tie = cup.ties[key];
    if (key === "F") return finalStatus(tie, me);
    const stage = CUP_STAGE_NAME[key.slice(1)];
    if (!tie?.winner) return `${stage} 진출`;
    if (tie.winner !== me && key.endsWith("WF")) return thirdStatus(cup.ties.T, me, stage, thirdPending);
    if (tie.winner !== me) return `${stage} 탈락`;
  }
  return null;
}

function superBowlStatus(state: GameState, leagueChampion: boolean): string | null {
  const psb = state.psb?.season === state.season ? state.psb : null;
  if (!psb) return leagueChampion ? BEFORE_DRAW : null;
  const me = state.player.slotId;
  if (!confOf(me, psb)) return null;
  if (psb.champion === me) return "우승";
  if (involves(psb.ties.final, me)) return finalStatus(psb.ties.final, me);
  for (let round = 2; round >= 0; round--) {
    const tie = psbKeys(round).map(key => psb.ties[key]).find(t => involves(t, me));
    if (tie?.winner === me) return `${PSB_ROUND_KO[round + 1]} 진출`;
    if (tie) return `${PSB_ROUND_KO[round]} ${tie.winner ? "탈락" : "진출"}`;
  }
  return "4강 진출";
}

/** The player's current season only, including tournaments they entered and later left. */
export function competitionStatus(state: GameState): { label: string; status: string }[] {
  const { region, slotId: me } = state.player;
  const regionName = regionById(region).name;
  const league = state.leagues[region];
  const leagueDone = league.nextRound >= LEAGUE_ROUNDS;
  const rank = rankOf(league, me);
  const rows = [{ label: `${regionName} 리그`, status: `${leagueDone ? "최종" : "현재"} ${rank}위` }];
  const future = seasonEvents(state.season).filter(event => event.day >= state.day);

  const cup = state.cups?.[region];
  const regionalCup = cup?.season === state.season && !isSwissCup(cup)
    ? regionalCupStatus(cup, me, future.some(event => event.kind === "cupThird")) : BEFORE_DRAW;
  if (regionalCup) rows.push({ label: `${regionName} 컵`, status: registrationOf(state, "cup")?.withdrawn ? "기권" : regionalCup });

  const current = (tournament: PwtState | null | undefined) => tournament?.season === state.season ? tournament : null;
  const tournaments = { pwt: current(state.pwt), pct: current(state.pct), ect: current(state.ect) };
  const eligibility = { ...state, ...tournaments };
  const tiers: Tier[] = ["pwt", "pct", "ect"];
  let droppedIn = false;
  for (const tier of tiers) {
    const tournament = tournaments[tier];
    const place = tournament && groupPosition(tournament, me);
    const thirdPending = future.some(event => event.kind === "koThird" && event.tier === tier);
    const po = tier === "pwt" && state.qual?.season === state.season && state.qual.announced
      ? state.qual.po.ties.find(t => involves(t, me)) : undefined;
    const preDraw = po && po.winner !== me ? `플레이오프 ${po.winner ? "탈락" : "진출"}` : BEFORE_DRAW;
    const status = tournament
      ? internationalStatus(tournament, tier, me, place, droppedIn, thirdPending) ?? (po?.winner && po.winner !== me ? "플레이오프 탈락" : null)
      : droppedIn || entersCompetition(eligibility, tier) === true ? preDraw : null;
    if (status) rows.push({ label: TIER_NAME[tier], status: registrationOf(state, tier)?.withdrawn ? "기권" : status });
    droppedIn = !!place?.done && place.rank === 3;
  }

  const psb = superBowlStatus(state, leagueDone && rank === 1);
  if (psb) rows.push({ label: "PSB", status: psb });

  const supers = state.supers?.season === state.season ? state.supers : null;
  const regional = supers?.regional[region];
  const { prev } = state;
  if (involves(regional, me)) rows.push({ label: `${regionName} 슈퍼컵`, status: finalStatus(regional, me) });
  if (!regional && !prev.virtual) {
    const [first, second] = prev.tables[region] ?? [];
    const winner = prev.cupWinners?.[region];
    const challenger = winner && winner !== first?.id ? winner : second?.id;
    if (first && challenger && (first.id === me || challenger === me)) rows.push({ label: `${regionName} 슈퍼컵`, status: BEFORE_DRAW });
  }

  const national = supers?.world;
  const semi = supers?.semi;
  if (involves(national, me)) rows.push({ label: "전국 슈퍼컵", status: finalStatus(national, me) });
  else if (involves(semi, me)) {
    const status = !semi.winner ? "준결승 진출" : semi.winner === me ? "결승 진출" : "준결승 탈락";
    rows.push({ label: "전국 슈퍼컵", status });
  } else if (!prev.virtual) {
    const { champion, pctChampion, ectChampion } = prev;
    const hasSemi = !!pctChampion && !!ectChampion && pctChampion !== ectChampion;
    const challenger = pctChampion || ectChampion;
    const enters = hasSemi ? [champion, pctChampion, ectChampion].includes(me)
      : !!champion && !!challenger && champion !== challenger && (champion === me || challenger === me);
    if (enters) rows.push({ label: "전국 슈퍼컵", status: supers && champion === me ? "결승 진출" : BEFORE_DRAW });
  }
  return rows;
}
