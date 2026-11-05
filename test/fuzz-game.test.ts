// Game-loop fuzzer: random clubs and random player decisions over whole seasons, checking invariants and
// save/load at every step. NPC games use a fast random simulator; the player's own games are real battles.
// FUZZ_SEEDS / FUZZ_SEASONS raise the effort (defaults keep the normal test run short).
import { describe, it, expect } from "vitest";
import { createGame, entryTeam, migrate, type GameState } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { advanceWithRegistration as advance } from "./registered-advance";
import { pendingDecided, playerCupTeam, recordPlayerGame, sideFor, type Simulator } from "../src/game/season";
import { BattleSession } from "../src/battle/engine";
import { autoRegistration, registrationProblems } from "../src/game/cup";
import { Rng } from "../src/game/rng";
import { buyGround, expandStadium, FACILITY_MAX, MAX_SEATS, playerSeats, upgradeFacility } from "../src/game/finance";
import { setTicketPrice, onRelease } from "../src/game/fans";
import { borrow, lendersFor, loansOf, moneyBlocked, repayAll, roomWith } from "../src/game/loan";
import { startMission, signCandidate, scoutStartOptions, maxMissions } from "../src/game/scouting";
import { buy, catalog, equip, isHoldable } from "../src/game/shop";
import { declineAllOffers, respond, signOffer, sponsorOf } from "../src/game/sponsor";
import { ticketsOf, useTicket } from "../src/game/legend";
import { treatSquad } from "../src/game/clinic";
import { answerOffer, friendliesOf, invite, inviteable, openDays } from "../src/game/friendly";
import { COMPETITION_NAMES, registrationOf, type Competition } from "../src/game/registration";
import { koSpecies, REGIONS } from "../src/data/dex";

const SEEDS = Number(process.env.FUZZ_SEEDS || 3);
const SEASONS = Number(process.env.FUZZ_SEASONS || 1);

/** NPC-vs-NPC games: random but well-formed results. */
const fastSim: Simulator = async jobs =>
  jobs.map(j => {
    const rng = new Rng(j.seed);
    const w = rng.chance(0.08) ? -1 : rng.chance(0.5) ? 0 : 1;
    const n = j.doubles ? 4 : 3;
    const rem: [number, number] = [0, 0];
    if (w === -1) rem[0] = rem[1] = rng.int(1, 2);
    else rem[w] = rng.int(1, n);
    return { winner: w, remaining: rem, turns: rng.int(5, 40), picks: [[0, 1, 2], [0, 1, 2]], kos: [{}, {}] } as any;
  });

function check(st: GameState, where: string) {
  const p = st.player;
  const bad = (msg: string) => {
    throw new Error(`[${where}] day ${st.day}: ${msg}`);
  };
  if (!Number.isFinite(p.money)) bad(`money ${p.money}`);
  if (!Number.isFinite(p.fans) || p.fans < 0) bad(`fans ${p.fans}`);
  if (!(p.reputation >= 0 && p.reputation <= 100)) bad(`fame ${p.reputation}`);
  if (!((p.satisfaction ?? 60) >= 0 && (p.satisfaction ?? 60) <= 100)) bad(`mood ${p.satisfaction}`);
  if (!(p.ticketPrice >= 5 && p.ticketPrice <= 100)) bad(`ticket ${p.ticketPrice}`);
  const seats = playerSeats(p.facilities);
  if (!(seats >= 0 && seats <= MAX_SEATS)) bad(`seats ${seats}`);
  for (const k of Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[]) {
    const lv = p.facilities[k] ?? 1;
    if (!(lv >= 1 && lv <= FACILITY_MAX[k])) bad(`facility ${k} ${lv}`);
  }
  const uids = new Set(p.squad.map(m => m.uid));
  if (uids.size !== p.squad.length) bad("duplicate squad uid");
  if (p.entry.length > 6 || new Set(p.entry).size !== p.entry.length) bad(`entry ${p.entry}`);
  for (const u of p.entry) if (!uids.has(u)) bad(`entry has unknown ${u}`);
  for (const m of p.squad) {
    if (m.cond && !(m.cond.hp >= 0 && m.cond.hp <= 1)) bad(`cond ${JSON.stringify(m.cond)}`);
    if (!(m.level >= 1 && m.level <= 100)) bad(`level ${m.level}`);
    if (m.moves.length < 1 || m.moves.length > 4) bad(`moves ${m.moves}`);
  }
  for (const l of loansOf(st)) if (!Number.isFinite(l.balance) || l.balance < 0) bad(`loan ${JSON.stringify(l)}`);
  for (const [id, n] of Object.entries(st.npcs || {})) {
    if (!Number.isFinite(n.money)) bad(`npc ${id} money ${n.money}`);
    if (!(n.reputation >= 0 && n.reputation <= 100)) bad(`npc ${id} fame ${n.reputation}`);
    if (n.sat != null && !(n.sat >= 0 && n.sat <= 100)) bad(`npc ${id} mood ${n.sat}`);
    if ((n.seats ?? 0) < 0) bad(`npc ${id} seats ${n.seats}`);
  }
  // save / load
  const re = migrate(JSON.parse(JSON.stringify(st)));
  if (re.day !== st.day || re.player.money !== st.player.money) bad("save/load changed the state");
}

/** Random club decisions, as a player might make them on the hub screens. */
function act(st: GameState, rng: Rng) {
  const p = st.player;
  const r = rng.next();
  if (r < 0.06) setTicketPrice(st, rng.int(5, 100));
  else if (r < 0.1) upgradeFacility(st, rng.pick(Object.keys(FACILITY_MAX) as (keyof typeof FACILITY_MAX)[]));
  else if (r < 0.13) (playerSeats(p.facilities) > 0 ? expandStadium(st, rng.int(1, 30) * 100) : buyGround(st));
  else if (r < 0.16) {
    const l = rng.pick(lendersFor(p.region));
    borrow(st, l.id, rng.int(1, Math.max(1, Math.floor(l.limit / 1000))) * 1000);
  } else if (r < 0.18 && loansOf(st).length) repayAll(st, rng.pick(loansOf(st)).id);
  else if (r < 0.24 && p.missions.length < maxMissions(p.facilities.scouting)) startMission(st, rng.pick(REGIONS).id, rng.chance(0.5) ? null : rng.pick(["Fire", "Water", "Dragon", "Steel", "Fairy"]));
  else if (r < 0.3 && p.candidates.length) signCandidate(st, rng.pick(p.candidates).id);
  else if (r < 0.34 && p.squad.length > 4) {
    // release (as the squad screen does: Pokémon registered for this season cannot go)
    const free = p.squad.filter(x => !(Object.keys(COMPETITION_NAMES) as Competition[]).some(c => registrationOf(st, c)?.uids.includes(x.uid)));
    if (!free.length) return;
    const m = rng.pick(free);
    onRelease(st, m, p.squad, koSpecies);
    p.squad = p.squad.filter(x => x.uid !== m.uid);
    p.entry = p.entry.filter(x => x !== m.uid);
    delete p.plan[m.uid];
    if (p.entry.length < 4) p.entry = p.squad.slice(0, 6).map(x => x.uid);
  } else if (r < 0.38 && p.squad.length >= 4) {
    // reshuffle the entry (4–6)
    const order = rng.shuffle(p.squad.map(m => m.uid));
    p.entry = order.slice(0, Math.min(6, Math.max(4, rng.int(4, 6))));
  } else if (r < 0.44) {
    const items = catalog().filter(i => isHoldable(i.key));
    const it = rng.pick(items);
    if (!buy(st, it.key, it.price)) equip(st, rng.pick(p.squad), it.key);
  } else if (r < 0.48) {
    const sp = sponsorOf(st);
    if (sp.offers.length) {
      const i = rng.int(0, sp.offers.length - 1);
      const o = sp.offers[i];
      if (rng.chance(0.3)) respond(o, { monthly: Math.round(o.monthly * 1.3), bonus: o.bonus, len: o.len });
      if (rng.chance(0.2)) declineAllOffers(st);
      else signOffer(st, i);
    }
  } else if (r < 0.5) {
    const t = ticketsOf(st)[0];
    if (t) useTicket(st, t.id, rng.pick(t.choices));
  } else if (r < 0.52) treatSquad(st);
  else if (r < 0.535) {
    // preseason friendlies: invite someone, or answer an NPC's invitation
    const days = openDays(st);
    const opps = inviteable(st);
    if (days.length && opps.length) invite(st, rng.pick(opps), rng.pick(days));
    for (const f of friendliesOf(st).filter(x => x.status === "offer")) answerOffer(st, f.id, rng.chance(0.6));
  }
  else if (r < 0.55 && p.squad.length) p.plan[rng.pick(p.squad).uid] = rng.pick(["level", "atk", "spe", "hp", "rest"]);
}

/** Plays the player's game today, like the match screen: register for the cup, pick, real battle. */
function playPending(st: GameState, rng: Rng) {
  const p = st.pending!;
  const dbl = !!p.doubles;
  if (dbl && !(p.reg && p.reg.length >= 4)) {
    const entry = entryTeam(st);
    const reg = autoRegistration(entry).idx;
    const problems = registrationProblems(entry, reg);
    if (problems.length) throw new Error(`cannot register for the cup: ${problems.join(" ")} (entry ${entry.length})`);
    p.reg = reg;
  }
  const me = sideFor(st, st.player.slotId, dbl);
  const need = Math.min(dbl ? 4 : 3, me.team.length);
  if (me.team.length < need || need < (dbl ? 4 : 3)) throw new Error(`team too small: ${me.team.length} for ${dbl ? "doubles" : "singles"} (${p.label}${p.friendly ? ", friendly" : ""}; squad ${st.player.squad.length}, entry ${st.player.entry.length}, day ${st.day})`);
  const picks = rng.shuffle(me.team.map((_, i) => i)).slice(0, need);
  const s = new BattleSession({ ...me, picks, human: false }, sideFor(st, p.opponent, dbl), `${st.seed}:${st.day}:${p.games.length}:fz`, { doubles: dbl });
  s.start();
  const r = s.runToEnd();
  recordPlayerGame(st, r, []);
  void playerCupTeam;
}

async function runClub(seedIdx: number) {
  const rng = new Rng(`fuzz${seedIdx}`);
  const modes = ["trainer", "trainer", "scout"] as const;
  const mode = modes[seedIdx % modes.length];
  const t = rng.pick(allTrainers());
  let st: GameState;
  if (mode === "scout") {
    const o = scoutStartOptions(t.region, `fz${seedIdx}`);
    const early = rng.shuffle(o[1].slice()).slice(0, 2);
    st = createGame({ mode: "scout", slotId: t.id, name: "퍼즈", scoutPicks: [rng.pick(o[0]), ...early, rng.pick(o[2])] });
  } else st = createGame({ mode: "trainer", slotId: t.id, name: "퍼즈" });
  check(st, "start");
  const end = st.season + SEASONS;
  let stuck = 0;
  let games = 0;
  for (let step = 0; step < 4000 && st.season < end; step++) {
    if (rng.chance(0.5)) act(st, rng);
    check(st, "act");
    if (st.pending && !pendingDecided(st)) {
      playPending(st, rng);
      games++;
      check(st, "game");
      continue;
    }
    const before = st.day;
    if (moneyBlocked(st)) {
      // what the popup leads to: borrow (up to each lender's remaining limit) until the shortfall is covered
      for (const x of lendersFor(st.player.region)) {
        if (st.player.money >= 0) break;
        const room = roomWith(st, x);
        if (room >= 1000) borrow(st, x.id, Math.min(room, Math.ceil(-st.player.money / 1000) * 1000 + 30000));
      }
    }
    await advance(st, fastSim, undefined, { toMyNext: rng.chance(0.3) });
    check(st, "advance");
    stuck = st.day === before && !st.pending ? stuck + 1 : 0;
    if (stuck > 5) throw new Error(`calendar stuck on day ${st.day} (money ${st.player.money}, blocked ${moneyBlocked(st)})`);
  }
  return { mode, club: t.name, season: st.season, day: st.day, games, money: st.player.money, fame: st.player.reputation, mood: st.player.satisfaction, seats: playerSeats(st.player.facilities), squad: st.player.squad.length, loans: loansOf(st).length };
}

describe("game-loop fuzz", () => {
  for (let i = 0; i < SEEDS; i++) {
    it(`club ${i}`, async () => {
      const r = await runClub(i);
      console.log(JSON.stringify(r));
      expect(r.season).toBeGreaterThan(1);
    }, 900000);
  }
});
