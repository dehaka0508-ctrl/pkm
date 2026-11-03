// Sponsors: offers every first Monday of August, FM-style negotiation of monthly pay, bonus and length,
// monthly payment on the 1st, performance bonus for objectives. Villain organisations only back
// their own boss / members (fixed contract, no offers).
import SPONSOR_DATA from "../data/sponsors.json";
import { REGIONS, regionById } from "../data/dex";
import { trainerById } from "./lineups";
import { standings } from "./league";
import { cupPath, isSwissCup } from "./cup";
import { Rng } from "./rng";
import type { GameState } from "./state";
import { pushMsg } from "./state";
import { dateOf, leagueRoundDay } from "./calendar";

export type SponsorSize = "big" | "mid" | "small";
export interface SponsorDef {
  name: string;
  size: SponsorSize;
  industry: string;
  region: string; // region id or "all"
  villain?: boolean;
  members?: string[];
}
export const SPONSORS = (SPONSOR_DATA as { sponsors: SponsorDef[] }).sponsors;
export const SIZE_KO: Record<SponsorSize, string> = { big: "대규모", mid: "중규모", small: "소규모" };

export type ObjectiveKind = "league" | "cup" | "europe";
export interface Objective {
  kind: ObjectiveKind;
  /** league: rank; cup: 1 = wing final, 2 = final, 3 = winner; europe: 1 = PWT/PCT round of 16 */
  target: number;
  share: number; // part of the season bonus
  label: string;
}

export interface SponsorContract {
  name: string;
  size: SponsorSize;
  region: string;
  monthly: number;
  bonus: number; // per season, split across objectives
  objectives: Objective[];
  fromSeason: number;
  toSeason: number;
  fixed?: boolean; // villain organisation: permanent, not negotiable
  log: { season: number; label: string; ok: boolean; paid: number }[];
  paidTotal: number;
}

export interface SponsorOffer {
  name: string;
  size: SponsorSize;
  region: string;
  industry: string;
  monthly: number;
  bonus: number;
  len: number;
  prefLen: number;
  objectives: Objective[];
  ceiling: number; // max monthly they will ever pay
  maxValue: number; // max season value at their preferred length
  patience: number;
  status: "open" | "withdrawn";
  message?: string;
}

export interface SponsorState {
  contract: SponsorContract | null;
  offers: SponsorOffer[];
  offersUntil: number; // day the offers expire
  score?: { score: number; rep: number; perf: number };
}

export const round500 = (x: number) => Math.max(500, Math.round(x / 500) * 500);
const CUP_LABEL = ["", "지방 컵 윙 결승 진출", "지방 컵 결승 진출", "지방 컵 우승"];

export function sponsorOf(state: GameState): SponsorState {
  const p = state.player as any;
  if (!p.sponsor) p.sponsor = { contract: null, offers: [], offersUntil: -1 };
  return p.sponsor as SponsorState;
}

/** The organisation that backs a trainer for good (villain teams, 에테르재단, 매크로코스모스), if any. */
export function orgForTrainer(id: string): SponsorDef | null {
  const name = trainerById(id)?.name;
  return name ? SPONSORS.find(s => s.members?.includes(name)) ?? null : null;
}

/** The villain organisation that backs the player's trainer, if any (trainer start only). */
export function villainOrgFor(state: GameState): SponsorDef | null {
  if (state.mode !== "trainer") return null;
  return orgForTrainer(state.player.replaced);
}

/** Fixed organisation pay: by fame, renewed each season. */
export const fixedMonthly = (rep: number) => round500(15000 + 250 * rep);

/** Companies under a running contract (player or NPC). */
export function takenSponsors(state: GameState): Set<string> {
  const out = new Set<string>();
  const live = (c: SponsorContract | null | undefined) => c && !c.fixed && c.toSeason >= state.season;
  const pc = (state.player as any).sponsor?.contract as SponsorContract | null;
  if (live(pc)) out.add(pc!.name);
  for (const n of Object.values(((state as any).npcs || {}) as Record<string, { sponsor: SponsorContract | null }>)) if (live(n.sponsor)) out.add(n.sponsor!.name);
  return out;
}

/** 0–100 from fame and the last three league seasons (most recent first). */
export function scoreFrom(rep: number, perfs: number[]): { score: number; rep: number; perf: number } {
  const r = Math.max(0, Math.min(100, rep));
  const w = [0.5, 0.3, 0.2].slice(0, perfs.length);
  const ws = w.reduce((a, b) => a + b, 0) || 1;
  const perf = perfs.length ? perfs.reduce((a, v, i) => a + v * w[i], 0) / ws : 25;
  return { score: Math.round(r * 0.5 + perf * 0.5), rep: Math.round(r), perf: Math.round(perf) };
}
export const rankPerf = (rank: number) => Math.max(0, Math.min(100, ((21 - rank) / 20) * 100));

/** 0–100: half fame, half results over the last three seasons (most recent weighs most). */
export function sponsorScore(state: GameState): { score: number; rep: number; perf: number } {
  const p = state.player;
  const rep = Math.max(0, Math.min(100, p.reputation));
  const seasonPerf = (rank: number, cup?: string, pwt?: string, pct?: string) => {
    let v = ((21 - rank) / 20) * 100;
    if (cup === "우승") v += 10;
    if (pwt === "우승") v += 20;
    else if (pwt && !/진출 실패|플레이오프 탈락|^-$/.test(pwt)) v += 6;
    if (pct === "우승") v += 8;
    return Math.max(0, Math.min(100, v));
  };
  const hist = p.history.slice(-3).reverse();
  let perfs = hist.map(h => seasonPerf(h.rank, h.cup, h.pwt, h.pct));
  if (!perfs.length) {
    const row = state.prev.tables[p.region]?.find(r => r.id === p.slotId);
    perfs = [seasonPerf(row?.rank ?? 15)];
  }
  return scoreFrom(rep, perfs);
}

/** Expected league finish from recent seasons (or last season's strength table). */
function expectedRank(state: GameState): number {
  const p = state.player;
  const ranks = p.history.slice(-3).map(h => h.rank);
  if (ranks.length) return Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
  return state.prev.tables[p.region]?.find(r => r.id === p.slotId)?.rank ?? 15;
}

function monthlyBase(size: SponsorSize, score: number): number {
  if (size === "big") return 12000 + 200 * score;
  if (size === "mid") return 5000 + 110 * score;
  return 2500 + 50 * score;
}

function objectivesFor(exp: number, size: SponsorSize, score: number): Objective[] {
  const t = Math.max(1, Math.min(18, exp + (size === "big" ? -1 : size === "small" ? 2 : 0)));
  const list: Objective[] = [{ kind: "league", target: t, share: 1, label: t === 1 ? "리그 우승" : `리그 ${t}위 이내` }];
  if (size !== "small") {
    const c = size === "big" ? (score >= 75 ? 3 : 2) : score >= 50 ? 2 : 1;
    list.push({ kind: "cup", target: c, share: 1, label: CUP_LABEL[c] });
  }
  if (size === "big" && score >= 55) list.push({ kind: "europe", target: 1, share: 1, label: "PWT·PCT 16강 진출" });
  const weights: Record<ObjectiveKind, number> = { league: 5, cup: 3, europe: 2 };
  const sum = list.reduce((a, o) => a + weights[o.kind], 0);
  list.forEach(o => (o.share = weights[o.kind] / sum));
  return list;
}

/** Builds this August's offers for the player. */
export function makeOffers(state: GameState): SponsorOffer[] {
  return offersFor(state, { score: sponsorScore(state).score, region: state.player.region, expRank: expectedRank(state), tag: "sponsor" });
}

/** Offers for any trainer: companies of their region or nationwide (big ones from anywhere when famous), not already under contract. */
export function offersFor(state: GameState, o: { score: number; region: string; expRank: number; tag: string }): SponsorOffer[] {
  const { score, region } = o;
  const rng = new Rng(`${state.seed}:${state.season}:${o.tag}`);
  const taken = takenSponsors(state);
  const eligible = (s: SponsorDef) => !s.villain && !s.members && !taken.has(s.name) && (s.region === region || s.region === "all" || (s.size === "big" && score >= 75));
  const pool = (size: SponsorSize) => rng.shuffle(SPONSORS.filter(s => s.size === size && eligible(s)));
  const n = Math.max(2, Math.min(5, 2 + Math.floor(score / 30)));
  const picks: SponsorDef[] = [];
  const take = (size: SponsorSize, k: number) => pool(size).filter(s => !picks.includes(s)).slice(0, k).forEach(s => picks.push(s));
  if (score >= 55) take("big", score >= 80 ? 2 : 1);
  if (score >= 25) take("mid", Math.max(1, n - picks.length - (score < 40 ? 1 : 0)));
  take("small", n - picks.length);
  if (picks.length < n) take("mid", n - picks.length);
  return picks.slice(0, n).map(s => {
    const monthly = round500(monthlyBase(s.size, score) * (0.9 + rng.next() * 0.2));
    const objectives = objectivesFor(o.expRank, s.size, score);
    const bonus = round500(monthly * (1 + objectives.length) * (0.8 + rng.next() * 0.4));
    const prefLen = s.size === "big" ? 3 : s.size === "mid" ? 2 : 1 + (rng.chance(0.5) ? 1 : 0);
    return {
      name: s.name,
      size: s.size,
      region: s.region,
      industry: s.industry,
      monthly,
      bonus,
      len: prefLen,
      prefLen,
      objectives,
      ceiling: round500(monthly * (1.15 + rng.next() * 0.15)),
      maxValue: Math.round((monthly * 12 + bonus * 0.5) * (1.08 + rng.next() * 0.12)),
      patience: 3,
      status: "open" as const,
    };
  });
}

/** August: offers arrive (or the fixed organisation keeps paying). */
export function sponsorOffersEvent(state: GameState) {
  const sp = sponsorOf(state);
  const org = villainOrgFor(state);
  if (sp.contract && (sp.contract.fixed || sp.contract.toSeason >= state.season)) {
    pushMsg(state, "money", "스폰서 계약 유지", `${sp.contract.name} 계약이 ${sp.contract.fixed ? "계속 이어집니다" : `${sp.contract.toSeason}시즌까지 남아 있습니다`}.`);
    return;
  }
  if (org) return sponsorSeasonStart(state);
  sp.score = sponsorScore(state);
  sp.offers = makeOffers(state);
  sp.offersUntil = leagueRoundDay(state.season, 0);
  pushMsg(
    state,
    "money",
    `스폰서 제의 ${sp.offers.length}건 도착`,
    `${sp.offers.map(o => `${o.name}(${SIZE_KO[o.size]}) 월 ₽${o.monthly.toLocaleString()}`).join("\n")}\n경영 탭에서 조건을 협상하고 계약하세요. 리그 개막 전까지 유효합니다.`,
  );
}

/** Season start: expire finished contracts, keep villain backing (paid by fame, renewed each season). */
export function sponsorSeasonStart(state: GameState) {
  const sp = sponsorOf(state);
  const org = villainOrgFor(state);
  if (org) {
    const monthly = fixedMonthly(state.player.reputation);
    if (sp.contract?.fixed) sp.contract.monthly = monthly;
    else sp.contract = { name: org.name, size: "big", region: org.region, monthly, bonus: 0, objectives: [], fromSeason: state.season, toSeason: 9999, fixed: true, log: [], paidTotal: 0 };
    sp.offers = [];
    return;
  }
  if (sp.contract && !sp.contract.fixed && sp.contract.toSeason < state.season) {
    pushMsg(state, "money", `${sp.contract.name} 계약 만료`, "8월 첫 월요일에 새 스폰서 제의가 도착합니다.");
    sp.contract = null;
  }
  sp.offers = [];
}

/** Offers still open, no contract, and today is the last day to sign: moving on means a season without a sponsor. */
export function offersLapsingToday(state: GameState): boolean {
  const sp = sponsorOf(state);
  const c = sp.contract;
  const signed = !!c && (c.fixed || c.toSeason >= state.season);
  return !signed && sp.offers.some(o => o.status === "open") && state.day >= sp.offersUntil;
}

/** The player chose to go without a sponsor this season. */
export function declineAllOffers(state: GameState) {
  const sp = sponsorOf(state);
  if (!sp.offers.length) return;
  sp.offers = [];
  pushMsg(state, "money", "스폰서 없이 시즌 진행", "이번 시즌은 스폰서 없이 치릅니다. 내년 8월에 다시 제의가 옵니다.");
}

/** Daily: unanswered offers lapse when the league starts; the contract pays on the 1st of every month. */
export function sponsorDay(state: GameState, logs: string[]) {
  const sp = sponsorOf(state);
  const c = sp.contract;
  if (sp.offers.length && state.day > sp.offersUntil) {
    sp.offers = [];
    if (!c) pushMsg(state, "money", "스폰서 제의 만료", "이번 시즌은 스폰서 없이 치릅니다. 내년 8월에 다시 제의가 옵니다.");
  }
  if (dateOf(state.day).date !== 1) return;
  if (!c || (!c.fixed && c.toSeason < state.season)) return;
  pay(state, c, logs);
}

function pay(state: GameState, c: SponsorContract, logs: string[]) {
  state.player.money += c.monthly;
  c.paidTotal += c.monthly;
  logs.push(`스폰서 ${c.name} 월 지급 ₽${c.monthly.toLocaleString()}`);
}

export function objectiveMet(state: GameState, id: string, region: string, o: Objective): boolean {
  if (o.kind === "league") {
    const rank = standings(state.leagues[region]).findIndex(r => r.id === id) + 1;
    return rank > 0 && rank <= o.target;
  }
  if (o.kind === "cup") {
    const cup = state.cups?.[region];
    if (!cup || isSwissCup(cup)) return false;
    const wf = cupPath(cup, id).find(k => k.endsWith("WF"));
    const reached = (k?: string) => !!k && !!cup.ties[k] && (cup.ties[k].a === id || cup.ties[k].b === id);
    return o.target === 3 ? cup.champion === id : o.target === 2 ? reached("F") : reached(wf);
  }
  const r16 = (t: GameState["pwt"]) => !!t?.ko[0]?.some(x => x.a === id || x.b === id);
  return r16(state.pwt) || r16(state.pct);
}

/** Judges a contract's objectives of a kind now; returns the bonus earned (the caller pays it). */
export function judgeContract(state: GameState, c: SponsorContract | null | undefined, id: string, region: string, kind: ObjectiveKind): { label: string; ok: boolean; paid: number }[] {
  if (!c || c.fixed || c.toSeason < state.season) return [];
  const out: { label: string; ok: boolean; paid: number }[] = [];
  for (const o of c.objectives.filter(x => x.kind === kind)) {
    if (c.log.some(l => l.season === state.season && l.label === o.label)) continue;
    const ok = objectiveMet(state, id, region, o);
    const paid = ok ? round500(c.bonus * o.share) : 0;
    c.paidTotal += paid;
    const r = { season: state.season, label: o.label, ok, paid };
    c.log.push(r);
    out.push(r);
  }
  return out;
}

/** Pays the player's bonus share of objectives of a kind, judged now. */
export function judgeObjectives(state: GameState, kind: ObjectiveKind, logs: string[] = []) {
  const c = sponsorOf(state).contract;
  for (const r of judgeContract(state, c, state.player.slotId, state.player.region, kind)) {
    state.player.money += r.paid;
    const line = r.ok ? `스폰서 목표 달성: ${r.label} → 성과급 ₽${r.paid.toLocaleString()}` : `스폰서 목표 실패: ${r.label}`;
    logs.push(line);
    pushMsg(state, "money", line, `${c!.name} 계약 성과급`);
  }
}

// ---------- negotiation ----------

export interface Proposal {
  monthly: number;
  bonus: number;
  len: number;
}
export type NegotiationResult = { kind: "accept" | "counter" | "withdraw"; message: string; counter?: Proposal };

const value = (p: Proposal) => p.monthly * 12 + p.bonus * 0.5;
function limitFor(o: SponsorOffer, len: number) {
  return o.maxValue * (1 - 0.06 * Math.abs(len - o.prefLen));
}

/** The sponsor's answer to a proposal (FM-style: accept, counter, or walk away when patience runs out). */
export function respond(o: SponsorOffer, p: Proposal): NegotiationResult {
  const len = Math.max(1, Math.min(3, Math.round(p.len)));
  const prop = { monthly: round500(p.monthly), bonus: Math.max(0, round500(p.bonus)), len };
  if (prop.monthly <= o.ceiling && value(prop) <= limitFor(o, len)) {
    return { kind: "accept", message: `${o.name}: 좋습니다. 그 조건이면 계약하겠습니다.` };
  }
  o.patience--;
  if (o.patience <= 0) {
    o.status = "withdrawn";
    return { kind: "withdraw", message: `${o.name}: 기대와 차이가 너무 큽니다. 제의를 거두겠습니다.` };
  }
  // counter: cap the monthly, then trim the bonus, then the monthly, to fit their budget for that length
  const lim = limitFor(o, len);
  let monthly = Math.min(prop.monthly, o.ceiling);
  let bonus = prop.bonus;
  if (monthly * 12 + bonus * 0.5 > lim) bonus = Math.max(0, (lim - monthly * 12) / 0.5);
  if (monthly * 12 > lim) {
    monthly = lim / 12;
    bonus = 0;
  }
  const counter = { monthly: Math.max(500, Math.floor(monthly / 500) * 500), bonus: Math.max(0, Math.floor(bonus / 500) * 500), len };
  o.monthly = counter.monthly;
  o.bonus = counter.bonus;
  o.len = counter.len;
  const why = prop.monthly > o.ceiling ? "월 지급액이 저희 한도를 넘습니다" : len !== o.prefLen ? `계약 기간 ${len}시즌은 부담스럽습니다` : "전체 금액이 예산을 넘습니다";
  return {
    kind: "counter",
    counter,
    message: `${o.name}: ${why}. 월 ₽${counter.monthly.toLocaleString()}, 성과급 ₽${counter.bonus.toLocaleString()}, ${len}시즌이라면 가능합니다. (인내심 ${o.patience}/3)`,
  };
}

export function signOffer(state: GameState, idx: number, p?: Proposal): string | null {
  const sp = sponsorOf(state);
  const o = sp.offers[idx];
  if (!o || o.status !== "open") return "유효하지 않은 제의입니다.";
  if (sp.contract && !sp.contract.fixed && sp.contract.toSeason >= state.season) return "이미 스폰서 계약이 있습니다.";
  const terms = p ?? { monthly: o.monthly, bonus: o.bonus, len: o.len };
  sp.contract = {
    name: o.name,
    size: o.size,
    region: o.region,
    monthly: terms.monthly,
    bonus: terms.bonus,
    objectives: o.objectives,
    fromSeason: state.season,
    toSeason: state.season + terms.len - 1,
    log: [],
    paidTotal: 0,
  };
  sp.offers = [];
  pay(state, sp.contract, []);
  pushMsg(state, "money", `${o.name}와(과) 스폰서 계약`, `첫 달 ₽${terms.monthly.toLocaleString()}을 바로 받았습니다. 이후 매달 1일 지급.\n월 ₽${terms.monthly.toLocaleString()} · 시즌 성과급 최대 ₽${terms.bonus.toLocaleString()} · ${terms.len}시즌 (${state.season}~${state.season + terms.len - 1}시즌)\n목표: ${o.objectives.map(x => x.label).join(", ")}`);
  return null;
}

export const regionLabel = (r: string) => (r === "all" ? "전국" : REGIONS.some(x => x.id === r) ? regionById(r).name : r);

/** For saves made before sponsors existed: offer contracts right away for the rest of the season. */
export function sponsorMigrate(state: GameState) {
  const sp = sponsorOf(state);
  if (villainOrgFor(state)) return sponsorSeasonStart(state);
  if (sp.contract || sp.offers.length) return;
  sp.score = sponsorScore(state);
  sp.offers = makeOffers(state);
  sp.offersUntil = state.day + 28;
}
