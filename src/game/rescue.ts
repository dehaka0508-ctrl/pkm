// Out of money with nowhere left to borrow: 긴급 정리 sells what the club has, in this order, until the money is
// back above zero — items in the bag and held items (half price, as the shop buys them back), then facility
// levels (half of what each cost), then an own ground (80% of its value; the club rents again).
// When even that is gone and the club loses money every week, its debts are cleared once (fame −10). That last
// rule is told to the player only when it happens.
import { isKeyItem } from "../data/forms";
import { isBoundItem } from "./formitems";
import { catalog, itemName } from "./shop";
import { expansionCost, FACILITY_KO, FACILITY_MAX, groundPrice, homeGate, playerSeats, RENTED_SEATS, upgradeCost, weeklyCosts, weeklyIncome } from "./finance";
import { canBorrow, lendersFor, loansOf, monthlyRate } from "./loan";
import { sponsorOf } from "./sponsor";
import { addFame } from "./fans";
import type { GameState } from "./state";
import { pushMsg } from "./state";

const FACILITY_REFUND = 0.5;
const GROUND_REFUND = 0.8;
const REHAB_FAME = 10;

let prices: Map<string, number> | null = null;
const priceOf = (key: string) => (prices ||= new Map(catalog().map(i => [i.key, i.price]))).get(key) ?? 0;
/** What the shop gives for an item: half its price (key items and items bound to a Pokémon can't be sold). */
const salePrice = (state: GameState, key: string) => (!key || isKeyItem(key) || isBoundItem(state, key) ? 0 : Math.floor(priceOf(key) / 2));

/** An own ground's value: a 1,000-seat ground plus what its extra seats cost to build. */
export function groundValue(seats: number): number {
  if (seats <= 0) return 0;
  return seats <= RENTED_SEATS ? groundPrice(seats) : groundPrice(RENTED_SEATS) + expansionCost(RENTED_SEATS, seats);
}

/** Whether anything is left to sell. */
export function canLiquidate(state: GameState): boolean {
  const p = state.player;
  if (Object.entries(p.bag || {}).some(([k, n]) => n > 0 && salePrice(state, k) > 0)) return true;
  if (p.squad.some(m => salePrice(state, m.item) > 0)) return true;
  if ((Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[]).some(k => (p.facilities[k] ?? 1) > 1)) return true;
  return playerSeats(p.facilities) > 0;
}

/** 긴급 정리: sells in order until the money is back to zero or above. Returns what was sold. */
export function emergencySale(state: GameState): string[] {
  const p = state.player;
  const lines: string[] = [];
  const short = () => p.money < 0;
  // 1. items: the bag first, then what the squad holds
  for (const [key, n] of Object.entries(p.bag || {})) {
    const price = salePrice(state, key);
    for (let i = 0; i < n && short() && price > 0; i++) {
      p.bag[key]--;
      p.money += price;
      lines.push(`${itemName(key)} 판매 +₽${price.toLocaleString()}`);
    }
    if (!p.bag[key]) delete p.bag[key];
  }
  for (const m of p.squad) {
    if (!short()) break;
    const price = salePrice(state, m.item);
    if (price <= 0) continue;
    lines.push(`${itemName(m.item)} 판매 +₽${price.toLocaleString()}`);
    m.item = "";
    p.money += price;
  }
  // 2. facility levels, the dearest level first
  const kinds = Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[];
  while (short()) {
    const k = kinds.filter(x => (p.facilities[x] ?? 1) > 1).sort((a, b) => (p.facilities[b] ?? 1) - (p.facilities[a] ?? 1))[0];
    if (!k) break;
    const lv = p.facilities[k] ?? 1;
    const back = Math.round(upgradeCost(k, lv - 1) * FACILITY_REFUND);
    p.facilities[k] = lv - 1;
    p.money += back;
    lines.push(`${FACILITY_KO[k]} Lv.${lv} → Lv.${lv - 1} 반환 +₽${back.toLocaleString()}`);
  }
  // 3. the ground
  const seats = playerSeats(p.facilities);
  if (short() && seats > 0) {
    const back = Math.round(groundValue(seats) * GROUND_REFUND);
    p.facilities.seats = 0;
    p.facilities.rented = RENTED_SEATS;
    delete (p.facilities as any).name;
    p.money += back;
    lines.push(`전용 경기장 ${seats.toLocaleString()}석 매각 +₽${back.toLocaleString()} (이제 ${RENTED_SEATS.toLocaleString()}석 경기장을 빌려 씁니다)`);
  }
  if (p.money >= 0) p.debtWeeks = 0;
  if (lines.length) pushMsg(state, "money", "긴급 정리", lines.join("\n"));
  return lines;
}

const canStillBorrow = (state: GameState) => lendersFor(state.player.region).some(l => !canBorrow(state, l));

/** A week's money in and out with nothing left to sell: income (merch, league share, sponsor, about half a home
 *  gate) against interest, upkeep, rent and food. */
function weeklyBalance(state: GameState): number {
  const c = weeklyCosts(state);
  const interest = loansOf(state).reduce((a, l) => a + l.balance * monthlyRate(l.annual), 0) * (12 / 52);
  const contract = sponsorOf(state).contract;
  const sponsor = contract && contract.toSeason >= state.season ? (contract.monthly * 12) / 52 : 0;
  return weeklyIncome(state).total + sponsor + homeGate(state).income * 0.5 - (interest + c.total);
}

/** Monday, after food: with no money, no lender, nothing to sell and a loss every week, all debts are cleared. */
export function rescueCheck(state: GameState) {
  const p = state.player;
  if (p.money >= 0 || p.debtWeeks < 2 || canStillBorrow(state) || canLiquidate(state)) return;
  if (weeklyBalance(state) >= 0) return; // income will pay it back in time
  const owed = loansOf(state).reduce((a, l) => a + l.balance, 0) + Math.max(0, -p.money);
  (p as any).loans = [];
  p.money = 0;
  p.debtWeeks = 0;
  addFame(state, -REHAB_FAME, "개인회생", false);
  pushMsg(state, "money", "개인회생", `빌릴 곳도 정리할 것도 없이 매주 적자가 이어져 개인회생이 받아들여졌습니다.\n모든 빚 ₽${Math.round(owed).toLocaleString()}이 탕감되었고 명성이 ${REHAB_FAME} 떨어졌습니다.`);
}

