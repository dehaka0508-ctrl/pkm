// Loans: three tiers of lenders by fame. Repaid in equal monthly instalments on the 1st; a missed instalment
// costs fame and the interest is added to what is owed. Paying an overdue loan off gives half that fame back.
import { addFame } from "./fans";
import { REGIONS, regionById } from "../data/dex";
import { dateOf } from "./calendar";
import type { GameState } from "./state";
import { newUid, pushMsg } from "./state";

export type LoanTier = 1 | 2 | 3;
export interface LenderDef {
  id: string;
  name: string;
  tier: LoanTier;
  limit: number;
  /** yearly interest, e.g. 0.024 */
  annual: number;
  months: number;
  note: string;
}
export interface Loan {
  id: string;
  lender: string;
  name: string;
  tier: LoanTier;
  principal: number;
  /** principal still owed (interest not included); older saves fall back to min(balance, principal) */
  left?: number;
  balance: number;
  annual: number;
  months: number;
  monthsLeft: number;
  payment: number;
  missed: number;
  /** fame lost to missed instalments on this loan (older saves: missed × MISS_FAME) */
  fameLost?: number;
  taken: number; // day
}

/** Fame needed for each tier. */
export const TIER_FAME: Record<LoanTier, number> = { 1: 50, 2: 20, 3: 0 };
export const TIER_KO: Record<LoanTier, string> = { 1: "제1금융권", 2: "제2금융권", 3: "제3금융권" };
/** Fame lost for each missed instalment. */
export const MISS_FAME: Record<LoanTier, number> = { 1: 2, 2: 3, 3: 5 };

const SAVINGS_CITY: Record<string, string> = { kanto: "노랑", johto: "금빛", hoenn: "보라", sinnoh: "축복", unova: "구름", kalos: "미르", alola: "하우올리", galar: "슛시티", paldea: "테이블" };
const VILLAIN: { regions: string[]; id: string; name: string; limit: number; annual: number; months: number; note: string }[] = [
  { regions: ["kanto", "johto"], id: "rocket", name: "로켓 캐피탈", limit: 50000, annual: 0.3, months: 6, note: "묻지 않고 빌려주지만 이자는 가장 무겁다" },
  { regions: ["hoenn"], id: "aquamagma", name: "아쿠아/마그마 캐시", limit: 45000, annual: 0.28, months: 6, note: "두 조직이 번갈아 수금하러 온다" },
  { regions: ["sinnoh"], id: "galactic", name: "갤럭시 크레딧", limit: 50000, annual: 0.26, months: 6, note: "계약서가 우주만큼 길다" },
  { regions: ["unova"], id: "plasma", name: "플라즈마론", limit: 40000, annual: 0.25, months: 6, note: "포켓몬 해방 기금이라는 명목" },
  { regions: ["kalos"], id: "flare", name: "플레어 캐시", limit: 50000, annual: 0.3, months: 4, note: "멋지게 빌려주고 빨리 받아 간다" },
  { regions: ["alola"], id: "skull", name: "스컬 머니", limit: 15000, annual: 0.24, months: 3, note: "자금이 넉넉하지 않은 동네 대부업" },
  { regions: ["galar"], id: "yell", name: "옐 캐피탈", limit: 20000, annual: 0.22, months: 4, note: "응원단 회비로 굴러가는 대부업" },
  { regions: ["paldea"], id: "star", name: "STC대출", limit: 30000, annual: 0.22, months: 6, note: "스타단 학생들이 운영한다" },
];

/** Lenders open to a club of this region. */
export function lendersFor(region: string): LenderDef[] {
  const rn = REGIONS.some(r => r.id === region) ? regionById(region).name : "지방";
  const villain = VILLAIN.filter(v => v.regions.includes(region));
  return [
    { id: "macro", name: "매크로코스모스 투자증권", tier: 1, limit: 300000, annual: 0.02, months: 24, note: "가라르 대기업 계열, 가장 낮은 금리와 큰 한도" },
    { id: "silph", name: "실프 파이낸셜", tier: 1, limit: 250000, annual: 0.024, months: 24, note: "실프주식회사 금융 계열사" },
    { id: "regional1", name: `${rn}투자금융`, tier: 1, limit: 150000, annual: 0.03, months: 12, note: "지방 리그와 오래 거래해 온 투자은행" },
    { id: "devon", name: "데봉 자산운용", tier: 2, limit: 100000, annual: 0.065, months: 12, note: "데봉코퍼레이션의 자산운용사" },
    { id: "friendly", name: "프렌들리 증권", tier: 2, limit: 80000, annual: 0.08, months: 12, note: "프렌들리숍 체인이 운영" },
    { id: "savings", name: `${SAVINGS_CITY[region] || rn}저축은행`, tier: 2, limit: 60000, annual: 0.1, months: 6, note: "동네 저축은행, 기간이 짧다" },
    { id: "pc", name: "포켓몬센터 긴급대출", tier: 3, limit: 20000, annual: 0.2, months: 3, note: "급할 때 쓰는 공공 소액 대출" },
    ...villain.map(v => ({ id: v.id, name: v.name, tier: 3 as LoanTier, limit: v.limit, annual: v.annual, months: v.months, note: v.note })),
  ];
}

export const monthlyRate = (annual: number) => annual / 12;
export const pctLabel = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** Equal monthly instalment (principal + interest) for `months` months. */
export function instalment(amount: number, annual: number, months: number): number {
  const r = monthlyRate(annual);
  if (r === 0) return Math.ceil(amount / months);
  return Math.ceil((amount * r) / (1 - Math.pow(1 + r, -months)));
}

export const loansOf = (state: GameState): Loan[] => ((state.player as any).loans ||= []);

/** Principal still owed on a loan (what counts against the lender's limit; interest does not). */
export const principalLeft = (loan: Loan) => loan.left ?? Math.min(loan.balance, loan.principal);

/** How much more this lender will lend: its limit minus the principal still owed to it. */
export function roomWith(state: GameState, l: LenderDef): number {
  const used = loansOf(state)
    .filter(x => x.lender === l.id)
    .reduce((a, x) => a + principalLeft(x), 0);
  return Math.max(0, Math.floor((l.limit - used) / 1000) * 1000);
}

export function canBorrow(state: GameState, l: LenderDef): string | null {
  if (state.player.reputation < TIER_FAME[l.tier]) return `명성 ${TIER_FAME[l.tier]} 이상만 이용할 수 있습니다.`;
  if (roomWith(state, l) < 1000) return "이 회사의 한도를 모두 빌렸습니다. 원금을 갚으면 그만큼 다시 빌릴 수 있습니다.";
  return null;
}

export function borrow(state: GameState, lenderId: string, amount: number): string | null {
  const l = lendersFor(state.player.region).find(x => x.id === lenderId);
  if (!l) return "없는 금융회사입니다.";
  const err = canBorrow(state, l);
  if (err) return err;
  amount = Math.round(amount / 1000) * 1000;
  const room = roomWith(state, l);
  if (amount < 1000 || amount > room) return `₽1,000 ~ ₽${room.toLocaleString()} 사이로 빌릴 수 있습니다.`;
  // every draw is its own loan with its own schedule; together they stay within the lender's limit
  const loan: Loan = { id: newUid("l"), lender: l.id, name: l.name, tier: l.tier, principal: amount, left: amount, balance: amount, annual: l.annual, months: l.months, monthsLeft: l.months, payment: instalment(amount, l.annual, l.months), missed: 0, taken: state.day };
  loansOf(state).push(loan);
  state.player.money += amount;
  if (state.player.money >= 0) state.player.debtWeeks = 0; // the shortfall is covered
  pushMsg(state, "money", `${l.name}에서 ₽${amount.toLocaleString()} 대출`, `월 이자 ${pctLabel(monthlyRate(l.annual))} · ${l.months}개월 · 매달 1일 ₽${loan.payment.toLocaleString()}씩 상환합니다.\n연체하면 명성이 ${MISS_FAME[l.tier]} 떨어집니다.`);
  return null;
}

/** Fame a loan has cost through missed instalments. */
export const fameLostOn = (loan: Loan) => loan.fameLost ?? loan.missed * MISS_FAME[loan.tier];
/** Fame given back when an overdue loan is paid off: half of what it cost, rounded. */
export const fameBack = (loan: Loan) => Math.round(fameLostOn(loan) / 2);

/** A loan is paid off: it leaves the list, and half the fame its missed instalments cost comes back. */
function paidOff(state: GameState, loan: Loan, text: string) {
  (state.player as any).loans = loansOf(state).filter(x => x !== loan);
  const back = fameBack(loan);
  if (back > 0) addFame(state, back, `${loan.name} 연체 빚 완납`, false);
  pushMsg(state, "money", `${loan.name} 대출 완납`, back > 0 ? `${text}\n연체로 떨어졌던 명성 ${fameLostOn(loan)} 중 ${back}을 되찾았습니다.` : text);
}

/** Pays the whole balance now (no fee). */
export function repayAll(state: GameState, loanId: string): string | null {
  const list = loansOf(state);
  const loan = list.find(x => x.id === loanId);
  if (!loan) return "대출을 찾을 수 없습니다.";
  if (state.player.money < loan.balance) return "자금이 부족합니다.";
  state.player.money -= loan.balance;
  paidOff(state, loan, `남은 ₽${loan.balance.toLocaleString()}을 모두 갚았습니다.`);
  return null;
}

/** Daily: on the 1st, every loan charges its instalment. */
export function loanDay(state: GameState, logs: string[]) {
  if (dateOf(state.day).date !== 1) return;
  const list = loansOf(state);
  if (!list.length) return;
  const p = state.player;
  for (const loan of list.slice()) {
    if (loan.taken >= state.day - 1) continue; // borrowed yesterday: first payment next month
    const interest = Math.round(loan.balance * monthlyRate(loan.annual));
    const due = Math.min(loan.balance + interest, loan.payment);
    if (p.money >= due) {
      p.money -= due;
      loan.left = Math.max(0, principalLeft(loan) - Math.max(0, due - interest)); // the part above interest repays principal
      loan.balance = loan.balance + interest - due;
      loan.monthsLeft = Math.max(0, loan.monthsLeft - 1);
      logs.push(`${loan.name} 상환 ₽${due.toLocaleString()}`);
      if (loan.balance <= 0) paidOff(state, loan, "모든 상환을 마쳤습니다.");
    } else {
      loan.balance += interest;
      const lost = MISS_FAME[loan.tier];
      loan.fameLost = fameLostOn(loan) + lost;
      loan.missed++;
      addFame(state, -lost, `${loan.name} 대출 연체`, false);
      pushMsg(state, "money", `${loan.name} 상환 연체`, `이번 달 ₽${due.toLocaleString()}을 갚지 못했습니다. 이자는 빚에 더해졌고 명성이 ${lost} 떨어졌습니다.\n남은 빚 ₽${loan.balance.toLocaleString()}`);
    }
  }
}

/** Two food days in a row without enough money: the club cannot go on until it finds money. */
export function moneyBlocked(state: GameState): boolean {
  if (state.player.money >= 0 || state.player.debtWeeks < 2) return false;
  // no lender left to turn to: let the season go on rather than lock the save
  return lendersFor(state.player.region).some(l => !canBorrow(state, l));
}
