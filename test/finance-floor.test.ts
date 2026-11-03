import { it, expect } from "vitest";
import { gateAt, bestPrice, solidarity, foodCost, RENTED_SEATS, RENT } from "../src/game/finance";
import { moodFactor } from "../src/game/fans";

// The poorest possible club (fame 10, 150 fans, neutral mood, rented 1,000-seat ground, ticket at its best
// price, ~22 home games) can just about feed four of the very best Pokémon over a season (with its small sponsor):
// four is a full team, even for doubles.
it("a club can always afford four top Pokémon", () => {
  const rep = 10;
  const sat = 50;
  const fans = 150;
  const price = bestPrice(fans, rep, sat, RENTED_SEATS);
  const g = gateAt(fans, rep, sat, RENTED_SEATS, price);
  const sponsor = (3000 * 12) / 52; // the smallest sponsor deal a fame-10 club gets (₽3,000 a month)
  const weekly = (g.income * 22) / 52 + solidarity(rep) + Math.round(fans * 0.5 * moodFactor(sat)) + sponsor;
  const best = foodCost({ species: "Garchomp", ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } });
  const costs = best * 4 + RENT;
  console.log({ price, att: g.attendance, perGame: g.income, weekly: Math.round(weekly), best, costs });
  // just enough: covered, but with almost nothing left over
  expect(weekly).toBeGreaterThan(costs);
  expect(weekly).toBeLessThan(costs * 1.05);
});
