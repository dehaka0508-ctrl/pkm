// Money: match-day income, weekly costs, facilities.
import type { Facilities, GameState } from "./state";
import { pushMsg } from "./state";
import { dex } from "../data/dex";

/** Old stadium tiers (saves and role defaults are given as a tier; 1 = the rented ground). */
export const STADIUM_CAPACITY = [0, 1000, 3000, 6000, 10000, 15000, 20000, 25000, 30000];
export const FACILITY_MAX = { training: 10, scouting: 10 };
export const FACILITY_KO = { training: "훈련 시설", scouting: "스카우팅 시설" };

// ---------- stadium: seats are built one by one ----------

/** A club without its own ground rents a 1,000-seat one. */
export const RENTED_SEATS = 1000;
export const RENT = 1500;
export const MAX_SEATS = 50000;
/** Building cost per seat, by the seat's number: the 1st–1,000th cost ₽50, up to 5,000 ₽75, … */
export const SEAT_TIERS: [number, number][] = [
  [1000, 50],
  [5000, 75],
  [10000, 100],
  [20000, 200],
  [30000, 300],
  [40000, 400],
  [50000, 500],
];
/** Weekly upkeep of an own ground, per seat. */
export const UPKEEP_PER_SEAT = 0.15;

/** Own seats for an old tier (tier 1 = renting, no own seats). */
export const tierSeats = (tier: number) => (tier <= 1 ? 0 : STADIUM_CAPACITY[Math.min(tier, STADIUM_CAPACITY.length - 1)]);
/** Seats on match day: the own ground, or the rented one. */
export const capacityOf = (seats: number) => (seats > 0 ? seats : RENTED_SEATS);
export const stadiumRent = (seats: number) => (seats > 0 ? 0 : RENT);
export const stadiumUpkeep = (seats: number) => Math.round(seats * UPKEEP_PER_SEAT);
/** The player's own seats (old saves keep a tier). */
export const playerSeats = (f: Facilities) => f.seats ?? tierSeats(f.stadium);

export function stadiumName(seats: number): string {
  if (seats <= 0) return "임대 소형 경기장";
  if (seats < 3000) return "소형 경기장";
  if (seats < 6000) return "중형 경기장";
  if (seats < 10000) return "지역 경기장";
  if (seats < 15000) return "대형 경기장";
  if (seats < 20000) return "광역 경기장";
  if (seats < 30000) return "리그 경기장";
  if (seats < 40000) return "전용 대경기장";
  return "초대형 돔 경기장";
}

/** Price of the seat numbered `n` (1-based). */
export function seatPrice(n: number): number {
  for (const [upto, price] of SEAT_TIERS) if (n <= upto) return price;
  return SEAT_TIERS[SEAT_TIERS.length - 1][1];
}

/** Cost of building seats from `from` up to `to` (tier by tier). */
export function expansionCost(from: number, to: number): number {
  let cost = 0;
  let lo = from;
  for (const [upto, price] of SEAT_TIERS) {
    if (lo >= to) break;
    if (lo >= upto) continue;
    const hi = Math.min(to, upto);
    cost += (hi - lo) * price;
    lo = hi;
  }
  return cost;
}

/** Smallest legal build: the first own ground has at least as many seats as the rented one. */
export const minExpansion = (seats: number) => (seats > 0 ? 100 : RENTED_SEATS);

export function expandStadium(state: GameState, add: number): string | null {
  const f = state.player.facilities;
  const seats = playerSeats(f);
  add = Math.round(add / 100) * 100;
  if (add < minExpansion(seats)) return seats > 0 ? "100석 단위로 늘릴 수 있습니다." : `처음 짓는 경기장은 ${RENTED_SEATS.toLocaleString()}석 이상이어야 합니다.`;
  if (seats + add > MAX_SEATS) return `경기장은 최대 ${MAX_SEATS.toLocaleString()}석입니다.`;
  const cost = expansionCost(seats, seats + add);
  if (state.player.money < cost) return "자금이 부족합니다.";
  state.player.money -= cost;
  f.seats = seats + add;
  pushMsg(
    state,
    "money",
    seats > 0 ? `경기장 ${add.toLocaleString()}석 증축` : "전용 경기장 완공",
    `₽${cost.toLocaleString()}을 들여 ${stadiumName(f.seats)} ${f.seats.toLocaleString()}석이 되었습니다.${seats > 0 ? "" : "\n이제 경기장 임대료를 내지 않습니다."}\n유지비 주 ₽${stadiumUpkeep(f.seats).toLocaleString()}`,
  );
  return null;
}

export function upgradeCost(_kind: keyof typeof FACILITY_MAX, level: number): number {
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

/** Spectators who want a ticket (fans and their mood). */
export const gateDemand = (fans: number, sat: number) => fans * 0.9 * sat + 200;

/**
 * Match-day money (tickets, stands, programmes). It follows the crowd, but the gap between clubs is 30%
 * smaller than the crowd alone: small grounds earn a bit more per head, packed big ones a bit less.
 */
export const GATE_PIVOT = 2500; // crowd of a mid-table club
export const GATE_SPREAD = 0.7;
export function gateIncome(attendance: number, price: number): number {
  return Math.round(Math.max(0, GATE_PIVOT + (attendance - GATE_PIVOT) * GATE_SPREAD) * price);
}

/**
 * League solidarity payment, weekly, for clubs with little fame (none from fame 60 up). With the smallest
 * match-day money and a small sponsor it just about covers six of the very best Pokémon (600 BST, six
 * perfect IVs): nothing left over, but no club is pushed into fielding weaker Pokémon.
 */
export const solidarity = (rep: number) => Math.round(Math.max(0, 60 - rep) * 100);

export function homeGate(state: GameState): { attendance: number; income: number } {
  const p = state.player;
  const cap = capacityOf(playerSeats(p.facilities));
  const attendance = Math.round(Math.min(cap, gateDemand(p.fans, satisfaction(state))));
  return { attendance, income: gateIncome(attendance, p.ticketPrice) };
}

/** Weekly food: base stat total × IV sum × constant (a 600-BST Pokémon with six perfect IVs eats ₽2,000). */
export const FOOD_K = 2000 / (600 * 186);
export function foodCost(m: { species: string; ivs: Record<string, number> }): number {
  const ivSum = Object.values(m.ivs || {}).reduce((a, b) => a + (b || 0), 0);
  return Math.round(dex.species.get(m.species).bst * ivSum * FOOD_K);
}

/** Weekly upkeep: training / scouting cost nothing at level 1, more for every level above it; an own ground costs per seat. */
export const UPKEEP_PER_LEVEL = { training: 250, scouting: 250 };
export function upkeepOf(f: { training: number; scouting: number; seats: number }): number {
  return (f.training - 1) * UPKEEP_PER_LEVEL.training + (f.scouting - 1) * UPKEEP_PER_LEVEL.scouting + stadiumUpkeep(f.seats);
}

export function weeklyCosts(state: GameState): { food: number; upkeep: number; rent: number; total: number } {
  const p = state.player;
  const food = p.squad.reduce((a, m) => a + foodCost(m), 0);
  const seats = playerSeats(p.facilities);
  const upkeep = upkeepOf({ ...p.facilities, seats });
  const rent = stadiumRent(seats);
  return { food, upkeep, rent, total: food + upkeep + rent };
}

/** Weekly merchandise income (sponsors pay monthly, see sponsor.ts). */
export function weeklyIncome(state: GameState): { merch: number; share: number; total: number } {
  const p = state.player;
  const merch = Math.round(p.fans * 0.5 * satisfaction(state));
  const share = solidarity(p.reputation);
  return { merch, share, total: merch + share };
}

/** Sunday: merchandise and league share in, facility upkeep and rent out (food is paid on Monday). */
export function financeWeek(state: GameState, logs: string[]) {
  const p = state.player;
  const c = weeklyCosts(state);
  const i = weeklyIncome(state);
  p.money += i.total - c.upkeep - c.rent;
  logs.push(`수입 ₽${i.total.toLocaleString()} (굿즈·리그 지원금) / 시설 유지비·임대료 ₽${(c.upkeep + c.rent).toLocaleString()}`);
}

/** Monday (no matches are played): every Pokémon's food. Two Mondays in a row short of money stop the calendar. */
export function foodDay(state: GameState, logs: string[]) {
  const p = state.player;
  const food = weeklyCosts(state).food;
  p.money -= food;
  logs.push(`먹이값 ₽${food.toLocaleString()} (${p.squad.length}마리)`);
  if (p.money < 0) {
    p.debtWeeks++;
    if (p.debtWeeks === 1) pushMsg(state, "money", "자금이 바닥났습니다", "다음 주에도 먹이값을 못 내면 돈을 마련할 때까지 진행할 수 없습니다.\n경영 탭에서 대출을 받거나, 포켓몬을 방출해 지출을 줄이세요.");
    else if (p.debtWeeks === 2) pushMsg(state, "money", "먹이값 2주 연속 미납", "돈을 마련하기 전에는 다음 날로 넘어갈 수 없습니다. 경영 탭에서 대출을 받으세요.");
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
