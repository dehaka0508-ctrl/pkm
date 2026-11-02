import { it, expect } from "vitest";
import { gateDemand, gateIncome, solidarity, foodCost, STADIUM_CAPACITY } from "../src/game/finance";

// The poorest possible club (fame 10, 150 fans, rented 1,000-seat ground, ₽20 tickets, ~22 home games)
// can just about feed six of the very best Pokémon over a season (with its small sponsor).
it("a club can always afford six top Pokémon", () => {
  const rep = 10;
  const sat = Math.min(1.2, 1.05 * (0.6 + rep / 250));
  const att = Math.round(Math.min(STADIUM_CAPACITY[1], gateDemand(150, sat)));
  const perGame = gateIncome(att, 20);
  const sponsor = (3000 * 12) / 52; // the smallest sponsor deal a fame-10 club gets (₽3,000 a month)
  const weekly = (perGame * 22) / 52 + solidarity(rep) + Math.round(150 * 0.5 * sat) + sponsor;
  const best = foodCost({ species: "Garchomp", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
  const costs = best * 6 + 1500;
  console.log({ att, perGame, weekly: Math.round(weekly), best, costs });
  // just enough: covered, but with almost nothing left over
  expect(weekly).toBeGreaterThan(costs);
  expect(weekly).toBeLessThan(costs * 1.05);
});
