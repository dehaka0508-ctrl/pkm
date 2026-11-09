// Money: match-day income, weekly costs, facilities.
import type { Facilities, GameState } from "./state";
import { pushMsg } from "./state";
import { dex, isUltraOrParadox } from "../data/dex";
import stadiums from "../data/trainer-stadiums.json";
import { addSat, moodFactor, satOf } from "./fans";

/** Old stadium tiers (saves and role defaults are given as a tier; 1 = the rented ground). */
export const STADIUM_CAPACITY = [0, 1000, 3000, 6000, 10000, 15000, 20000, 25000, 30000];
export const FACILITY_MAX = { training: 10, scouting: 10, merch: 10 };
export const FACILITY_KO = { training: "훈련 시설", scouting: "스카우팅 시설", merch: "굿즈샵" };
/** Merchandise sales: +40% of the base for every merch shop level above 1. */
export const merchMult = (level: number | undefined) => 1 + 0.4 * ((level || 1) - 1);

// ---------- stadium: seats are built one by one ----------

/** A club without its own ground rents a 1,000-seat one, and can buy its own 1,000-seat ground. */
export const RENTED_SEATS = 1000;
export const RENT = 1500;
/** Buying an own ground: ₽100,000 per 1,000 seats of the ground the club was renting. */
export const GROUND_PRICE = 100000;
export const groundPrice = (rented: number) => Math.round((GROUND_PRICE * rented) / RENTED_SEATS);
export const MAX_SEATS = 50000;
/** Building cost per seat, by the seat's number: up to 5,000 ₽150, up to 10,000 ₽200, … (the first 1,000 come with the ground). */
export const SEAT_TIERS: [number, number][] = [
  [1000, 100],
  [5000, 150],
  [10000, 200],
  [20000, 400],
  [30000, 600],
  [40000, 800],
  [50000, 1000],
];
/** Weekly upkeep of an own ground, per seat. */
export const UPKEEP_PER_SEAT = 0.15;

/** Own seats for an old tier (tier 1 = renting, no own seats). */
export const tierSeats = (tier: number) => (tier <= 1 ? 0 : STADIUM_CAPACITY[Math.min(tier, STADIUM_CAPACITY.length - 1)]);
/** Seats on match day: the own ground, or the rented one (1,000 seats unless the club rents a bigger one). */
export const capacityOf = (seats: number, rented = RENTED_SEATS) => (seats > 0 ? seats : rented);
/** Rent for the rented ground, by its size (₽1,500 a week for 1,000 seats). */
export const stadiumRent = (seats: number, rented = RENTED_SEATS) => (seats > 0 ? 0 : Math.round((RENT * rented) / RENTED_SEATS));
export const playerRented = (f: Facilities) => f.rented ?? RENTED_SEATS;
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

/** Starting grounds by role: champions own 1,500 seats, gym leaders own 1,000, the Elite Four rent 1,500, everyone else rents 1,000. */
export const ROLE_SEATS: Record<string, number> = { 챔피언: 1500, 관장: 1000 };
export const ROLE_RENTED: Record<string, number> = { 사천왕: 1500 };
export const roleSeats = (role: string | undefined) => (role ? ROLE_SEATS[role] ?? 0 : 0);
export const roleRented = (role: string | undefined) => (role ? ROLE_RENTED[role] ?? RENTED_SEATS : RENTED_SEATS);

const stadiumDb: Record<string, { home: string; ownSeats?: number }> = stadiums;

export const STADIUM_NAME_MAX = 30;
export const defaultGroundName = (id: string) => stadiumDb[id]?.home ?? "전용 경기장";
export const groundName = (id: string, seats: number, name?: string) =>
  seats > 0 ? name || defaultGroundName(id) : "임대 경기장";

export const assignedGroundSeats = (id: string) => stadiumDb[id]?.ownSeats ?? 0;
export const startingGroundSeats = (id: string, role: string) => assignedGroundSeats(id) || roleSeats(role);
export const startingGroundRent = (id: string, role: string) => assignedGroundSeats(id) ? RENTED_SEATS : roleRented(role);

/** A renting club buys its own ground, as big as the one it rents. */
export function buyGround(state: GameState, name = ""): string | null {
  const f = state.player.facilities;
  if (playerSeats(f) > 0) return "이미 전용 경기장이 있습니다.";
  const size = playerRented(f);
  const price = groundPrice(size);
  if (state.player.money < price) return "자금이 부족합니다.";
  state.player.money -= price;
  f.seats = size;
  f.name = name.trim().slice(0, STADIUM_NAME_MAX) || defaultGroundName(state.player.replaced);
  addSat(state, 4, "전용 경기장 마련");
  pushMsg(state, "money", "전용 경기장 마련", `₽${price.toLocaleString()}에 ${size.toLocaleString()}석 전용 경기장 ‘${f.name}’을 마련했습니다. 이제 임대료 대신 주 ₽${stadiumUpkeep(size).toLocaleString()}의 유지비를 내고, 좌석을 늘릴 수 있습니다.`);
  return null;
}

/** Expansion works in steps of 100 seats on an own ground. */
export const minExpansion = (_seats: number) => 100;

export function expandStadium(state: GameState, add: number): string | null {
  const f = state.player.facilities;
  const seats = playerSeats(f);
  if (seats <= 0) return "먼저 전용 경기장을 사야 합니다.";
  add = Math.round(add / 100) * 100;
  if (add < 100) return "100석 단위로 늘릴 수 있습니다.";
  if (seats + add > MAX_SEATS) return `경기장은 최대 ${MAX_SEATS.toLocaleString()}석입니다.`;
  const cost = expansionCost(seats, seats + add);
  if (state.player.money < cost) return "자금이 부족합니다.";
  state.player.money -= cost;
  f.seats = seats + add;
  addSat(state, add >= 1000 ? 3 : 2, `경기장 ${add.toLocaleString()}석 증축`);
  pushMsg(state, "money", `경기장 ${add.toLocaleString()}석 증축`, `₽${cost.toLocaleString()}을 들여 ${groundName(state.player.replaced, f.seats, f.name)}이 ${f.seats.toLocaleString()}석이 되었습니다.\n유지비 주 ₽${stadiumUpkeep(f.seats).toLocaleString()}`);
  return null;
}

export function upgradeCost(_kind: keyof typeof FACILITY_MAX, level: number): number {
  return Math.round((20000 * Math.pow(level, 1.5)) / 1000) * 1000;
}

export function upgradeFacility(state: GameState, kind: keyof typeof FACILITY_MAX): string | null {
  const f = state.player.facilities;
  const lv = f[kind] ?? 1;
  if (lv >= FACILITY_MAX[kind]) return "이미 최고 단계입니다.";
  const cost = upgradeCost(kind, lv);
  if (state.player.money < cost) return "자금이 부족합니다.";
  state.player.money -= cost;
  f[kind] = lv + 1;
  addSat(state, 2, `${FACILITY_KO[kind]} 업그레이드`);
  return null;
}

/** Fans' mood 0–100 (fans.ts). */
export const satisfaction = (state: GameState) => satOf(state);

/**
 * Match-day money (tickets, stands, programmes). It follows the crowd, but the gap between clubs is 30%
 * smaller than the crowd alone (a power law around a mid-table crowd): small grounds earn a bit more per
 * head, packed big ones a bit less — and an empty ground earns nothing.
 */
export const GATE_PIVOT = 2500; // crowd of a mid-table club
export const GATE_SPREAD = 0.7;
export function gateIncome(attendance: number, price: number): number {
  if (attendance <= 0) return 0;
  return Math.round(GATE_PIVOT * Math.pow(attendance / GATE_PIVOT, GATE_SPREAD) * price);
}

// ---------- ticket price: a demand curve against a fixed number of seats ----------

export const PRICE_MIN = 5;
export const PRICE_MAX = 100;
/** The price at which takings peak while seats are left: set mostly by fame, a little by the mood. */
export const refPrice = (rep: number, sat: number) => 14 + rep * 0.15 + (sat - 50) * 0.05;
/** Spectators who want a ticket at this price. At the reference price: 80% of (fans × 0.9 + 200). */
export function ticketDemand(fans: number, rep: number, sat: number, price: number): number {
  const P = refPrice(rep, sat);
  return Math.round((fans * 0.9 + 200) * 0.8 * Math.exp((1 - price / P) / GATE_SPREAD));
}
export function gateAt(fans: number, rep: number, sat: number, cap: number, price: number, importance = 0) {
  const demand = ticketDemand(fans, rep, sat, price);
  const attendance = Math.min(cap, demand);
  return { demand, attendance, income: Math.round(gateIncome(attendance, price) * (1 + Math.max(-5, Math.min(10, importance)) / 100)) };
}
/** The ticket price that brings in the most on match day (seats included). */
export function bestPrice(fans: number, rep: number, sat: number, cap: number): number {
  let best = PRICE_MIN;
  let top = -1;
  for (let p = PRICE_MIN; p <= PRICE_MAX; p++) {
    const inc = gateAt(fans, rep, sat, cap, p).income;
    if (inc > top) (top = inc), (best = p);
  }
  return best;
}

/**
 * League solidarity payment, weekly, for clubs with little fame (none from fame 60 up). With the smallest
 * match-day money and a small sponsor it just about covers four of the very best Pokémon (600 BST, six
 * perfect IVs) — enough to field a full team, even in doubles — with nothing left over.
 */
export const solidarity = (rep: number) => Math.round(Math.max(0, 60 - rep) * 110);

export function homeGate(state: GameState, price = state.player.ticketPrice, importance = 0): { attendance: number; income: number; demand: number } {
  const p = state.player;
  return gateAt(p.fans, p.reputation, satOf(state), capacityOf(playerSeats(p.facilities), playerRented(p.facilities)), price, importance);
}

/** Weekly food: base stat total × IV sum × constant (a 600-BST Pokémon with six perfect IVs eats ₽2,000);
 *  Ultra Beasts and Paradox Pokémon eat 50% more than an ordinary Pokémon with the same stats
 *  (except 올림박사's and 투로박사's own six, raised on it: `foodNative`). */
export const FOOD_K = 2000 / (600 * 186);
export function foodCost(m: { species: string; ivs: Record<string, number>; foodNative?: boolean }): number {
  const ivSum = Object.values(m.ivs || {}).reduce((a, b) => a + (b || 0), 0);
  return Math.round(dex.species.get(m.species).bst * ivSum * FOOD_K * (isUltraOrParadox(m.species) && !m.foodNative ? 1.5 : 1));
}

/** Weekly upkeep: training / scouting cost nothing at level 1, more for every level above it; an own ground costs per seat. */
export const UPKEEP_PER_LEVEL = { training: 250, scouting: 250, merch: 200 };
export function upkeepOf(f: { training: number; scouting: number; merch?: number; seats: number }): number {
  return (f.training - 1) * UPKEEP_PER_LEVEL.training + (f.scouting - 1) * UPKEEP_PER_LEVEL.scouting + ((f.merch || 1) - 1) * UPKEEP_PER_LEVEL.merch + stadiumUpkeep(f.seats);
}

export function weeklyCosts(state: GameState): { food: number; upkeep: number; rent: number; total: number } {
  const p = state.player;
  const food = p.squad.reduce((a, m) => a + foodCost(m), 0);
  const seats = playerSeats(p.facilities);
  const upkeep = upkeepOf({ ...p.facilities, seats });
  const rent = stadiumRent(seats, playerRented(p.facilities));
  return { food, upkeep, rent, total: food + upkeep + rent };
}

/** Weekly merchandise income (sponsors pay monthly, see sponsor.ts). */
export function weeklyIncome(state: GameState): { merch: number; share: number; total: number } {
  const p = state.player;
  const merch = Math.round(p.fans * 0.5 * moodFactor(satOf(state)) * merchMult(p.facilities.merch ?? 1));
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
    if (p.debtWeeks === 1) pushMsg(state, "money", "자금이 바닥났습니다", "다음 주에도 먹이값을 못 내면 돈을 마련할 때까지 진행할 수 없습니다.\n경영 탭에서 대출을 받거나, 포켓몬을 놓아줘 지출을 줄이세요.");
    else if (p.debtWeeks === 2) pushMsg(state, "money", "먹이값 2주 연속 미납", "돈을 마련하기 전에는 다음 날로 넘어갈 수 없습니다. 경영 탭에서 대출을 받거나 긴급 정리를 하세요.");
  } else p.debtWeeks = 0;
}

export function onMatchResult(state: GameState, home: boolean, outcome: 0 | 1 | -1, logs: string[], importance = 0) {
  const p = state.player;
  if (home) {
    const g = homeGate(state, p.ticketPrice, importance);
    p.money += g.income;
    logs.push(`홈 경기 관중 ${g.attendance.toLocaleString()}명, 입장 수입 ₽${g.income.toLocaleString()}`);
  }
  // fame no longer moves game by game (fans.ts: long streaks, titles, season vs expectation)
  if (outcome === 0) p.fans += 20 + Math.round(p.reputation / 4);
  else if (outcome === 1) p.fans = Math.max(50, p.fans - 5);
  else p.fans += 5;
  p.fans = Math.round(p.fans * (0.99 + moodFactor(satOf(state)) * 0.01));
}

/** League prize by final rank: 1st ₽100,000 · 2~3rd ₽80,000 · 4~7th ₽60,000 · 8~15th ₽40,000 · below ₽20,000. */
export const LEAGUE_PRIZE = (rank: number) => (rank <= 1 ? 100000 : rank <= 3 ? 80000 : rank <= 7 ? 60000 : rank <= 15 ? 40000 : 20000);
