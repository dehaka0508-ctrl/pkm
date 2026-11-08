import { gateAt, groundName, homeGate, playerSeats, roleSeats } from "./finance";
import { satOf } from "./fans";
import { npcGate, npcOf, npcPrice, npcSat, npcSeats } from "./npc";
import { Rng } from "./rng";
import type { GameState, TieRef } from "./state";
import type { Tie } from "./tie";

export type MatchVenue = { host: string; visitorShare: 0.3 | 0.5 } | { stadium: string };

export function finalStadium(kind: string): string | undefined {
  switch (kind) {
    case "pwtFinal": return "석영고원 스타디움";
    case "pctFinal": return "슛스타디움"; // PST
    case "ectFinal": return "그랜드시티 스타디움"; // PCT
  }
}

export function psbHost(state: GameState, key: string, tie: Tie): 0 | 1 {
  const recorded = tie.games[0]?.home;
  if (tie.host !== undefined) return tie.host;
  if (recorded === 0 || recorded === 1) return recorded;
  return new Rng(`${state.seed}:${state.season}:psb-venue:${key}`).chance(0.5) ? 0 : 1;
}

/** Compare grounds before choosing the host. An exact tie keeps the bracket order. */
export function cupHost(state: GameState, tie: Tie): 0 | 1 {
  const recorded = tie.games[0]?.home;
  if (tie.host !== undefined) return tie.host;
  if (recorded === 0 || recorded === 1) return recorded;
  const ground = (id: string) => {
    if (id === state.player.slotId) return { own: playerSeats(state.player.facilities) > 0, gate: homeGate(state).income };
    const n = npcOf(state, id);
    return { own: npcSeats(n) > 0, gate: npcGate(n).income };
  };
  const a = ground(tie.a), b = ground(tie.b);
  return (a.own !== b.own ? b.own : b.gate > a.gate) ? 1 : 0;
}

export function tieVenue(state: GameState, kind: TieRef["kind"], tie: Tie, psbKey = ""): MatchVenue | undefined {
  const stadium = finalStadium(kind);
  if (stadium) return { stadium };
  switch (kind) {
    case "super":
    case "worldSemi":
    case "world":
      return { host: tie.a, visitorShare: 0.3 };
    case "cup":
      return { host: cupHost(state, tie) === 0 ? tie.a : tie.b, visitorShare: 0.5 };
    case "psb":
      return { host: psbHost(state, psbKey, tie) === 0 ? tie.a : tie.b, visitorShare: 0.5 };
  }
}

export function venueName(state: GameState, venue: MatchVenue): string {
  if ("stadium" in venue) return venue.stadium;
  if (venue.host === state.player.slotId) {
    const p = state.player;
    return groundName(p.replaced, playerSeats(p.facilities), p.facilities.name);
  }
  return groundName(venue.host, npcSeats(npcOf(state, venue.host)));
}

function ticketMarket(state: GameState, id: string, playerPrice: number) {
  if (id === state.player.slotId) {
    const p = state.player;
    return { fans: p.fans, rep: p.reputation, sat: satOf(state), price: playerPrice };
  }
  const n = npcOf(state, id);
  return { fans: n.fans, rep: n.reputation, sat: npcSat(n), price: npcPrice(n) };
}

export function venueGate(state: GameState, venue: MatchVenue, a: string, b: string, importance = 0, playerPrice = state.player.ticketPrice) {
  const me = state.player.slotId;
  let gate: { attendance: number; income: number };
  let shareA: number;
  if ("host" in venue) {
    gate = venue.host === me ? homeGate(state, playerPrice, importance) : npcGate(npcOf(state, venue.host), importance);
    const visitor = Math.round(gate.income * venue.visitorShare);
    shareA = venue.host === a ? gate.income - visitor : visitor;
  } else {
    const x = ticketMarket(state, a, playerPrice);
    const y = ticketMarket(state, b, playerPrice);
    gate = gateAt(x.fans + y.fans, (x.rep + y.rep) / 2, (x.sat + y.sat) / 2, roleSeats("챔피언"), Math.round((x.price + y.price) / 2), importance);
    shareA = a < b ? Math.ceil(gate.income / 2) : Math.floor(gate.income / 2);
  }
  return { ...gate, shareA, shareB: gate.income - shareA };
}

/** Book one game's gate once, before either team's result changes its fan demand. */
export function settleVenueGate(state: GameState, venue: MatchVenue, a: string, b: string, logs?: string[], importance = 0) {
  const gate = venueGate(state, venue, a, b, importance);
  const { shareA, shareB } = gate;
  const me = state.player.slotId;
  for (const [id, share] of [[a, shareA], [b, shareB]] as const) {
    if (id === me) {
      state.player.money += share;
      logs?.push(`${venueName(state, venue)} 관중 ${gate.attendance.toLocaleString()}명 · 입장 수입 배분 ₽${share.toLocaleString()}`);
    } else npcOf(state, id).money += share;
  }
  return gate;
}
