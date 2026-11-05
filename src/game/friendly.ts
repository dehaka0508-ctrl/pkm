// Preseason friendlies (August only): money while the league has not started.
//  - the club that invites hosts the game, keeps 70% of the gate and pays the visitor 30%
//  - the player invites NPC clubs (they accept or not, by what the visit pays them and fame), and NPC clubs
//    invite the player (offers come on Mondays, answered in the schedule tab before the day)
//  - at most one friendly a week for the player; NPC clubs also play each other on August Saturdays
//  - no league effects (fame, table, registration); the Pokémon still gain EXP and need treatment
import { regionById } from "../data/dex";
import { dateLabel, dayOf, seasonEvents, weekdayOf } from "./calendar";
import { homeGate } from "./finance";
import { allTrainers, trainerById } from "./lineups";
import { npcGate, npcOf, npcs } from "./npc";
import { Rng } from "./rng";
import type { GameState } from "./state";
import { displayName, newUid, pushMsg } from "./state";

export const AWAY_SHARE = 0.3;

export interface Friendly {
  id: string;
  season: number;
  day: number;
  /** the inviting club (hosts the game) */
  home: string;
  away: string;
  /** offer = an NPC's invitation waiting for the player; set = agreed; declined (or lapsed); played */
  status: "offer" | "set" | "declined" | "played";
  result?: { w: 0 | 1 | -1; my: number; opp: number };
  /** the whole gate of the game (the visitor got 30% of it) */
  gate?: number;
}

export const friendliesOf = (state: GameState): Friendly[] => (((state as any).friendlies ||= []) as Friendly[]).filter(f => f.season === state.season);
const all = (state: GameState): Friendly[] => ((state as any).friendlies ||= []);

const weekOf = (day: number) => Math.floor((day + 4) / 7); // Monday-based weeks
const augFirst = (state: GameState) => dayOf(state.season, 8, 1);
const augLast = (state: GameState) => dayOf(state.season, 8, 31);

/** August days with an official game (PWT playoff, super cups): no friendlies then. */
function blocked(state: GameState): Set<number> {
  return new Set(seasonEvents(state.season).filter(e => ["po", "superCup", "worldSuper"].includes(e.kind)).map(e => e.day));
}

const mine = (state: GameState, f: Friendly) => f.home === state.player.slotId || f.away === state.player.slotId;
const opponentOf = (state: GameState, f: Friendly) => (f.home === state.player.slotId ? f.away : f.home);

/** Days the player can still play a friendly: August, from tomorrow, no official game, one per week. */
export function openDays(state: GameState): number[] {
  const busy = blocked(state);
  const weeks = new Set(friendliesOf(state).filter(f => mine(state, f) && (f.status === "set" || f.status === "played")).map(f => weekOf(f.day)));
  const out: number[] = [];
  for (let d = Math.max(state.day + 1, augFirst(state)); d <= augLast(state); d++) if (!busy.has(d) && !weeks.has(weekOf(d))) out.push(d);
  return out;
}

/** NPC clubs the player has not dealt with yet this preseason. */
export function inviteable(state: GameState): string[] {
  const done = new Set(friendliesOf(state).filter(f => mine(state, f)).map(f => opponentOf(state, f)));
  return Object.keys(npcs(state)).filter(id => id !== state.player.slotId && trainerById(id) && !done.has(id));
}

/** The gate of a game hosted by `home`, and the visitor's 30%. */
export function friendlyGate(state: GameState, home: string): { attendance: number; income: number; share: number } {
  const g = home === state.player.slotId ? homeGate(state) : npcGate(npcOf(state, home));
  return { attendance: g.attendance, income: g.income, share: Math.round(g.income * AWAY_SHARE) };
}

/** How likely an NPC club is to accept the player's invitation (what the visit pays it, and fame). */
export function acceptChance(state: GameState, opp: string): number {
  const n = npcOf(state, opp);
  const share = friendlyGate(state, state.player.slotId).share;
  return Math.max(0.1, Math.min(0.95, 0.35 + share / 12000 + (state.player.reputation - n.reputation) / 80));
}

/** The player invites an NPC club to its own ground. */
export function invite(state: GameState, opp: string, day: number): { ok: boolean; text: string } {
  if (!openDays(state).includes(day)) return { ok: false, text: "그날은 친선경기를 잡을 수 없습니다. (8월 · 공식 경기 없는 날 · 주 1회)" };
  if (!inviteable(state).includes(opp)) return { ok: false, text: "이번 프리시즌에 이미 제의한 상대입니다." };
  if (friendliesOf(state).some(f => f.day === day && (f.home === opp || f.away === opp) && f.status === "set")) return { ok: false, text: "상대 팀이 그날 다른 경기가 있습니다." };
  const rng = new Rng(`${state.seed}:friendly:${opp}:${state.season}`);
  const yes = rng.next() < acceptChance(state, opp);
  const f: Friendly = { id: newUid("f"), season: state.season, day, home: state.player.slotId, away: opp, status: yes ? "set" : "declined" };
  all(state).push(f);
  const name = displayName(state, opp);
  if (!yes) return { ok: false, text: `${name} 측이 초청을 거절했습니다.` };
  const g = friendlyGate(state, state.player.slotId);
  pushMsg(state, "match", `친선경기 확정: ${name} (${dateLabel(day)} · 홈)`, `예상 입장 수입 ₽${g.income.toLocaleString()} 중 30%(₽${g.share.toLocaleString()})를 ${name} 측에 나눠 줍니다.`);
  return { ok: true, text: `${name} 측이 초청을 받아들였습니다. ${dateLabel(day)} 홈 친선경기.` };
}

/** The player answers an NPC club's invitation. */
export function answerOffer(state: GameState, id: string, accept: boolean): string | null {
  const f = friendliesOf(state).find(x => x.id === id && x.status === "offer");
  if (!f) return "이미 지난 제안입니다.";
  if (accept && !openDays(state).includes(f.day)) return "그 주에는 이미 친선경기가 있습니다.";
  f.status = accept ? "set" : "declined";
  if (accept) pushMsg(state, "match", `친선경기 확정: ${displayName(state, f.home)} (${dateLabel(f.day)} · 원정)`, `상대 홈 입장 수입의 30%를 받습니다.`);
  return null;
}

/** The friendly the player plays today, if any. */
export const friendlyToday = (state: GameState) => friendliesOf(state).find(f => f.day === state.day && f.status === "set" && mine(state, f));

/** Books the result and splits the gate (host 70%, visitor 30%). */
export function settleFriendly(state: GameState, f: Friendly, g: { w: 0 | 1 | -1; my: number; opp: number }, logs: string[]) {
  const me = state.player.slotId;
  const opp = opponentOf(state, f);
  const gate = friendlyGate(state, f.home);
  const host = gate.income - gate.share;
  if (f.home === me) {
    state.player.money += host;
    npcOf(state, opp).money += gate.share;
  } else {
    state.player.money += gate.share;
    npcOf(state, opp).money += host;
  }
  f.status = "played";
  f.result = g;
  f.gate = gate.income;
  const res = g.w === -1 ? "무승부" : g.w === 0 ? "승리" : "패배";
  logs.unshift(`친선경기 vs ${displayName(state, opp)} — ${res} (${g.my}:${g.opp})`);
  logs.push(f.home === me ? `친선경기 관중 ${gate.attendance.toLocaleString()}명 · 입장 수입 ₽${gate.income.toLocaleString()} 중 ₽${gate.share.toLocaleString()}을 원정팀에 분배` : `친선경기 원정 분배금 ₽${gate.share.toLocaleString()}`);
}

/** End of each day in August: NPC invitations for the coming week, lapsed offers, NPC-vs-NPC Saturdays. */
export function friendlyEndDay(state: GameState) {
  const tomorrow = state.day + 1;
  if (state.day < augFirst(state) - 1 || state.day > augLast(state)) return;
  // an offer must be answered by the day before
  for (const f of friendliesOf(state)) if (f.status === "offer" && f.day <= tomorrow) f.status = "declined";
  // invitations for the player: on the season's first day and every Sunday night, for the week ahead
  if ((state.day === augFirst(state) || weekdayOf(state.day) === 6) && tomorrow <= augLast(state)) npcInvites(state);
  // NPC clubs play each other on Saturdays
  if (weekdayOf(state.day) === 5 && !blocked(state).has(state.day)) npcFriendlies(state);
}

function npcInvites(state: GameState) {
  const me = state.player.slotId;
  const days = openDays(state).filter(d => d - state.day >= 2 && d - state.day <= 8);
  if (!days.length) return;
  const rng = new Rng(`${state.seed}:frOffers:${state.day}`);
  const taken = new Set(friendliesOf(state).filter(f => mine(state, f)).map(f => opponentOf(state, f)));
  const region = state.player.region;
  // hosts: mostly league rivals, then anyone; two offers at most
  const pool = Object.keys(npcs(state)).filter(id => id !== me && trainerById(id) && !taken.has(id));
  const local = pool.filter(id => trainerById(id)!.region === region);
  for (let i = 0; i < 2 && pool.length; i++) {
    const src = local.length && rng.chance(0.75) ? local : pool;
    const host = rng.pick(src);
    local.splice(local.indexOf(host), 1);
    pool.splice(pool.indexOf(host), 1);
    const day = rng.pick(days);
    const f: Friendly = { id: newUid("f"), season: state.season, day, home: host, away: me, status: "offer" };
    all(state).push(f);
    const g = friendlyGate(state, host);
    const t = trainerById(host)!;
    pushMsg(state, "match", `친선경기 제안: ${t.name} (${dateLabel(day)} · 원정)`, `${regionById(t.region).name}의 ${t.name} 측이 홈 친선경기에 초청했습니다. 입장 수입의 30%(약 ₽${g.share.toLocaleString()})를 나눠 줍니다.\n일정 탭에서 ${dateLabel(day - 1, false)}까지 수락하거나 거절하세요.`);
  }
}

function npcFriendlies(state: GameState) {
  const me = state.player.slotId;
  const rng = new Rng(`${state.seed}:frNpc:${state.day}`);
  const playing = new Set(friendliesOf(state).filter(f => f.day === state.day && f.status === "set").flatMap(f => [f.home, f.away]));
  const byRegion = new Map<string, string[]>();
  for (const t of allTrainers()) {
    if (t.id === me || playing.has(t.id) || !npcs(state)[t.id]) continue;
    (byRegion.get(t.region) || byRegion.set(t.region, []).get(t.region)!).push(t.id);
  }
  for (const ids of byRegion.values()) {
    const order = rng.shuffle(ids.slice());
    for (let i = 0; i + 1 < order.length; i += 2) {
      const [host, guest] = [order[i], order[i + 1]];
      const g = friendlyGate(state, host);
      npcOf(state, host).money += g.income - g.share;
      npcOf(state, guest).money += g.share;
    }
  }
}
