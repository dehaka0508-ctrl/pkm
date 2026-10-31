// Money: match-day income, weekly costs, facilities.
import type { GameState } from "./state";
import { pushMsg } from "./state";

export const STADIUM_CAPACITY = [0, 1000, 3000, 6000, 10000, 15000, 20000, 25000, 30000];
export const STADIUM_NAME = ["", "임대 소형 경기장", "소형 경기장", "중형 경기장", "지역 경기장", "대형 경기장", "광역 경기장", "리그 경기장", "전용 대경기장"];
export const FACILITY_MAX = { training: 10, scouting: 10, stadium: 8 };
export const FACILITY_KO = { training: "훈련 시설", scouting: "스카우팅 시설", stadium: "경기장" };

export function upgradeCost(kind: keyof typeof FACILITY_MAX, level: number): number {
  if (kind === "stadium") return Math.round((60000 * Math.pow(level, 1.7)) / 1000) * 1000;
  return Math.round((20000 * Math.pow(level, 1.5)) / 1000) * 1000;
}

export function upgradeFacility(state: GameState, kind: keyof typeof FACILITY_MAX): string | null {
  const f = state.player.facilities;
  const lv = f[kind];
  if (lv >= FACILITY_MAX[kind]) return "이미 최고 단계입니다.";
  const cost = upgradeCost(kind, lv);
  if (state.player.money < cost) return "자금이 부족합니다.";
  state.player.money -= cost;
  f[kind] = lv + 1;
  return null;
}

/** 0..1.2: fans' mood, affected by ticket price and reputation. */
export function satisfaction(state: GameState): number {
  const p = state.player;
  const priceFactor = Math.max(0.2, 1.25 - (p.ticketPrice - 10) / 50);
  return Math.min(1.2, priceFactor * (0.6 + p.reputation / 250));
}

export function homeGate(state: GameState): { attendance: number; income: number } {
  const p = state.player;
  const cap = STADIUM_CAPACITY[p.facilities.stadium];
  const demand = p.fans * 0.9 * satisfaction(state) + 200;
  const attendance = Math.round(Math.min(cap, demand));
  return { attendance, income: attendance * p.ticketPrice };
}

export function weeklyCosts(state: GameState): { food: number; upkeep: number; rent: number; total: number } {
  const p = state.player;
  const food = p.squad.length * 600;
  const upkeep = (p.facilities.training + p.facilities.scouting) * 250 + (p.facilities.stadium - 1) * 600;
  const rent = p.facilities.stadium === 1 ? 1500 : 0;
  return { food, upkeep, rent, total: food + upkeep + rent };
}

export function weeklyIncome(state: GameState): { sponsor: number; merch: number; total: number } {
  const p = state.player;
  const sponsor = Math.round(p.reputation * 40);
  const merch = Math.round(p.fans * 0.5 * satisfaction(state));
  return { sponsor, merch, total: sponsor + merch };
}

export function financeWeek(state: GameState, logs: string[]) {
  const p = state.player;
  const c = weeklyCosts(state);
  const i = weeklyIncome(state);
  p.money += i.total - c.total;
  logs.push(`수입 ₽${i.total.toLocaleString()} (스폰서·굿즈) / 지출 ₽${c.total.toLocaleString()}`);
  if (p.money < 0) {
    p.debtWeeks++;
    if (p.debtWeeks === 1 || p.debtWeeks % 4 === 0) pushMsg(state, "money", "자금이 바닥났습니다", "입장료를 조정하거나 포켓몬을 방출해 지출을 줄이세요.");
  } else p.debtWeeks = 0;
}

export function onMatchResult(state: GameState, home: boolean, outcome: 0 | 1 | -1, logs: string[]) {
  const p = state.player;
  if (home) {
    const g = homeGate(state);
    p.money += g.income;
    logs.push(`홈 경기 관중 ${g.attendance.toLocaleString()}명, 입장 수입 ₽${g.income.toLocaleString()}`);
  }
  if (outcome === 0) {
    p.fans += 20 + Math.round(p.reputation / 4);
    p.reputation = Math.min(100, p.reputation + 1);
  } else if (outcome === 1) {
    p.fans = Math.max(50, p.fans - 5);
    p.reputation = Math.max(0, p.reputation - 0.5);
  } else p.fans += 5;
  p.fans = Math.round(p.fans * (0.99 + satisfaction(state) * 0.01));
}

export const LEAGUE_PRIZE = (rank: number) => Math.max(10000, 160000 - (rank - 1) * 8000);
