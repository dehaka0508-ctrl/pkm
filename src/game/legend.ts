// Legendary / mythical scout tickets, given to the player for winning a competition.
// A ticket offers three random Pokémon; the one signed stays for three seasons.
// Tickets must be used before the next season starts (they expire on Sep 1).
import { onSign } from "./fans";
import { REGIONS, dex, koSpecies, regionById, speciesRegion } from "../data/dex";
import { Rng } from "./rng";
import type { GameState } from "./state";
import { newUid, pushMsg } from "./state";
import type { OwnedMon, StatTable } from "./types";
import { STATS } from "./types";
import { dayOf } from "./calendar";
import { defaultMoves } from "./moves";
import { pickNature } from "./natures";
import { expForLevel } from "./training";
import { SQUAD_MAX } from "./scouting";
import { addItem } from "./shop";
import { trainerById } from "./lineups";

export type TicketKind = "legend" | "myth" | "both";
export interface LegendTicket {
  id: string;
  kind: TicketKind;
  region: string; // region id or "all"
  comp: string;
  season: number; // season it was won
  expires: number; // day (Sep 1 of the next season)
  choices: string[]; // species ids
}

export const LOAN_SEASONS = 3;
export const LEGEND_LEVEL = 70;
export const KIND_KO: Record<TicketKind, string> = { legend: "전설의 포켓몬", myth: "환상의 포켓몬", both: "전설·환상의 포켓몬" };

let pools: Record<"legend" | "myth", Record<string, string[]>> | null = null;
/** Legendary / mythical species by origin region (base and regional forms only). */
export function legendPools() {
  if (pools) return pools;
  const out: Record<"legend" | "myth", Record<string, string[]>> = { legend: {}, myth: {} };
  for (const r of REGIONS) out.legend[r.id] = [];
  for (const r of REGIONS) out.myth[r.id] = [];
  for (const s of dex.species.all()) {
    if (!s.exists || s.num <= 0 || s.num > 1025 || s.battleOnly) continue;
    if (["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string)) continue;
    if (s.forme && !/^(Alola|Galar|Hisui|Paldea)$/.test(s.forme)) continue;
    const kind: "legend" | "myth" | null = s.tags.includes("Mythical") ? "myth" : s.tags.includes("Restricted Legendary") || s.tags.includes("Sub-Legendary") ? "legend" : null;
    if (!kind) continue;
    const list = out[kind][speciesRegion(s.id)];
    if (list && !list.includes(s.id)) list.push(s.id);
  }
  pools = out;
  return out;
}

export function ticketName(t: { kind: TicketKind; region: string }) {
  return `${t.region === "all" ? "전국" : regionById(t.region).name} ${KIND_KO[t.kind]} 스카우트권`;
}

/** Legendary / mythical species someone already has (player, unused tickets, NPC teams and recruits). */
export function heldLegends(state: GameState): Set<string> {
  const out = new Set<string>();
  const add = (sp: string) => out.add(dex.species.get(sp).id);
  state.player.squad.forEach(m => add(m.species));
  for (const t of ((state.player as any).tickets || []) as LegendTicket[]) t.choices.forEach(add);
  for (const [id, n] of Object.entries(((state as any).npcs || {}) as Record<string, { legends?: { mon: { species: string } }[] }>)) {
    n.legends?.forEach(l => add(l.mon.species));
    trainerById(id)?.team.forEach(m => m?.species && add(m.species));
  }
  return out;
}

/**
 * Three candidates: the region's (or nation's) legendary + mythical Pokémon nobody has yet; when the region
 * has fewer than three left, the rest come from the nationwide pool; only if even that runs dry, held ones.
 */
export function legendChoices(state: GameState, region: string, tag: string, n = 3): string[] {
  const all = REGIONS.flatMap(r => [...legendPools().legend[r.id], ...legendPools().myth[r.id]]);
  const pool = region === "all" ? all : [...(legendPools().legend[region] || []), ...(legendPools().myth[region] || [])];
  const held = heldLegends(state);
  const rng = new Rng(`${state.seed}:${state.season}:${tag}`);
  const out = rng.shuffle(pool.filter(id => !held.has(id)));
  if (out.length < n) out.push(...rng.shuffle(all.filter(id => !held.has(id) && !out.includes(id))));
  if (out.length < n) out.push(...rng.shuffle(pool.filter(id => !out.includes(id))));
  return out.slice(0, n);
}

/** Gives the player a ticket (trophy reward). */
export function awardTicket(state: GameState, kind: TicketKind, region: string, comp: string) {
  const p = state.player as any;
  p.tickets ||= [];
  const choices = legendChoices(state, region, `${comp}:${kind}`);
  const t: LegendTicket = { id: newUid("t"), kind, region, comp, season: state.season, expires: dayOf(state.season + 1, 9, 1), choices };
  p.tickets.push(t);
  pushMsg(
    state,
    "scout",
    `${comp} 우승 상품: ${ticketName(t)}`,
    `후보: ${choices.map(id => koSpecies(dex.species.get(id).name)).join(", ")}\n스카우트 탭에서 한 마리를 영입하세요. 영입한 포켓몬은 ${LOAN_SEASONS}시즌 동안 함께합니다.\n다음 시즌 9월 1일에 만료됩니다.`,
  );
}

export function ticketsOf(state: GameState): LegendTicket[] {
  return ((state.player as any).tickets ||= []) as LegendTicket[];
}

/** Last season the signed Pokémon stays (three full seasons after the one it was won in). */
export const loanUntilFor = (t: LegendTicket) => t.season + LOAN_SEASONS;

export function legendMon(species: string, t: LegendTicket, seed: string): OwnedMon {
  const s = dex.species.get(species);
  const rng = new Rng(seed);
  const perfect = rng.shuffle(STATS.slice()).slice(0, 3);
  const ivs = Object.fromEntries(STATS.map(k => [k, perfect.includes(k) ? 31 : rng.int(15, 31)])) as StatTable;
  const moves = defaultMoves(s.id, LEGEND_LEVEL);
  const gender: "M" | "F" | "" = s.gender === "N" || !s.genderRatio ? (s.gender === "M" ? "M" : s.gender === "F" ? "F" : "") : rng.chance(s.genderRatio.F ?? 0.5) ? "F" : "M";
  return {
    uid: newUid("p"),
    species: s.name,
    level: LEGEND_LEVEL,
    ability: s.abilities[0],
    item: "",
    nature: pickNature(s.id, moves).nature,
    moves,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs,
    gender,
    shiny: rng.chance(1 / 4096),
    teraType: null,
    exp: expForLevel(LEGEND_LEVEL),
    origin: speciesRegion(s.id),
    joinedSeason: t.season,
    record: { played: 0, wins: 0, kos: 0 },
    known: moves.slice(),
    loanUntil: loanUntilFor(t),
  };
}

export function useTicket(state: GameState, ticketId: string, species: string): string | null {
  const p = state.player;
  const list = ticketsOf(state);
  const t = list.find(x => x.id === ticketId);
  if (!t) return "스카우트권을 찾을 수 없습니다.";
  if (!t.choices.includes(species)) return "후보에 없는 포켓몬입니다.";
  if (state.day >= t.expires) return "만료된 스카우트권입니다.";
  if (p.squad.length >= SQUAD_MAX) return `스쿼드는 최대 ${SQUAD_MAX}마리입니다. 먼저 방출하세요.`;
  const mon = legendMon(species, t, `${state.seed}:${t.id}:${species}`);
  p.squad.push(mon);
  onSign(state, mon, koSpecies, true);
  p.plan[mon.uid] = "spe";
  if (p.entry.length < 6) p.entry.push(mon.uid);
  (p as any).tickets = list.filter(x => x !== t);
  pushMsg(state, "scout", `${koSpecies(mon.species)} 영입`, `${ticketName(t)}으로 영입했습니다. 시즌 ${mon.loanUntil}이 끝날 때까지 함께합니다.`);
  return null;
}

/** Daily: drop expired tickets. */
export function expireTickets(state: GameState) {
  const list = ticketsOf(state);
  const gone = list.filter(t => state.day >= t.expires);
  if (!gone.length) return;
  (state.player as any).tickets = list.filter(t => state.day < t.expires);
  for (const t of gone) pushMsg(state, "scout", `${ticketName(t)} 만료`, "사용하지 않은 스카우트권이 9월 1일에 만료되었습니다.");
}

/** New season: Pokémon whose three seasons are over leave the squad. */
export function endLoans(state: GameState) {
  const p = state.player;
  const leaving = p.squad.filter(m => m.loanUntil != null && m.loanUntil < state.season);
  if (!leaving.length) return;
  for (const m of leaving) {
    if (m.item) addItem(state, m.item);
    delete p.plan[m.uid];
  }
  p.squad = p.squad.filter(m => !leaving.includes(m));
  p.entry = p.entry.filter(u => p.squad.some(m => m.uid === u));
  if (p.entry.length < Math.min(3, p.squad.length)) p.entry = p.squad.slice(0, 6).map(m => m.uid);
  pushMsg(state, "scout", `${leaving.map(m => koSpecies(m.species)).join(", ")} 떠남`, `${LOAN_SEASONS}시즌 계약이 끝나 팀을 떠났습니다. 지니고 있던 도구는 가방으로 돌아왔습니다.`);
}
