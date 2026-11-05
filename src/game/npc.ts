// NPC trainers run their club like the player: fans, fame, a stadium, sponsors and prize money.
// Money goes into held items, bought one at a time from the ace down (by base stat total), using the
// items real players run with each Pokémon (src/data/npc-items.json, scripts/npc-items.mjs).
// Each NPC also buys one Mega Stone, one Z-Crystal and one Tera Shard for whoever gains the most.
// League and PWT winners recruit a legendary / mythical Pokémon for three seasons; the entry stays at six
// (the recruit sits in for the weakest of the original six while it stays).
import NPC_ITEMS from "../data/npc-items.json";
import { REGIONS, dex, koItem, koSpecies, regionById } from "../data/dex";
import { allTrainers, resolveTeam, trainerById } from "./lineups";
import type { GameState } from "./state";
import { entryTeam, pushMsg, pushMsgMerged } from "./state";
import type { TeamMember, TrainerDef } from "./types";
import { LEAGUE_PRIZE, solidarity, foodCost, gateAt, bestPrice, refPrice, ticketDemand, upkeepOf, capacityOf, stadiumRent, tierSeats, expansionCost, roleSeats, roleRented, groundPrice, MAX_SEATS, RENTED_SEATS } from "./finance";
import { moodFactor, npcMoodWeek, npcResult, SAT_START } from "./fans";
import { catalog, isRemovedItem, itemName } from "./shop";
import { dateOf, leagueRoundDay } from "./calendar";
import { standings } from "./league";
import { fixedMonthly, judgeContract, offersFor, orgForTrainer, rankPerf, scoreFrom, type ObjectiveKind, type SponsorContract } from "./sponsor";
import { LOAN_SEASONS, legendChoices, legendMon, type LegendTicket } from "./legend";
import { calcStats } from "../battle/calc";
import { classifyRole, exposure, pickEntry, weakTo, type Candidate } from "./ai/evaluator";
import { itemWishes as roleItems } from "./ai/loadout";
import { NPC_ROSTER_MAX, type MemberCare, type RosterMon, type ScoutTask } from "./ai/models";
import { conceptFit, profileOf } from "./ai/themes";

export interface NpcLegend {
  mon: TeamMember;
  until: number; // last season it stays
  comp: string;
}

export interface NpcState {
  money: number;
  fans: number;
  reputation: number;
  stadium: number; // starting tier (old saves); the ground is `seats`
  /** own seats (0 = renting) and the size of the rented ground */
  seats?: number;
  rented?: number;
  /** fans' mood 0–100 and the current run of results (fans.ts) */
  sat?: number;
  streak?: number;
  /** held item per member key ("0".."5" = original slots, "L0".. = recruits); "" = none */
  items: Record<string, string>;
  tera: { key: string; type: string } | null;
  ranks: number[]; // league ranks, most recent last
  sponsor: SponsorContract | null;
  legends: NpcLegend[];
  log: { day: number; text: string }[];
  // ---- NPC AI (ai/controller.ts) ----
  /** Pokémon brought in by scouting (keys "S…") */
  roster?: RosterMon[];
  /** EVs / nature / moves / Tera bought for a member, by member key */
  care?: Record<string, MemberCare>;
  /** scouts out on the road */
  scouts?: ScoutTask[];
  /** keys of the six it brings to matches (chosen each week) */
  entry?: string[];
  /** no new scout before this day (after a report: soon if it signed someone, much later if not) */
  scoutRest?: number;
}

export const ROLE_REP: Record<string, number> = { 챔피언: 80, 사천왕: 65, 보스: 60, 관장: 50, 라이벌: 45, 주인공: 45, 박사: 40, 기타: 35, 트레이너: 25 };
/** Held items a trainer starts with (the strongest Pokémon by base stat total get them). */
export const ROLE_START_ITEMS: Record<string, number> = { 챔피언: 3, 주인공: 3, 라이벌: 3, 사천왕: 2, 보스: 2, 기타: 2, 박사: 2, 관장: 1, 트레이너: 0 };
/** A trainer's starting fame: the role's, unless the trainer data sets its own. */
export const trainerFame = (t: TrainerDef) => t.fame ?? ROLE_REP[t.role] ?? 35;
const RESERVE = 5000; // cash an NPC keeps before shopping

const bst = (species: string) => dex.species.get(species).bst;

// ---------- prices ----------
let prices: Map<string, number> | null = null;
export function itemPrice(key: string): number {
  if (!prices) prices = new Map(catalog().map(i => [i.key, i.price]));
  return prices.get(key) ?? 12000;
}

// ---------- item choice ----------

const isGimmickItem = (item: string) => {
  const it = dex.items.get(item);
  return !!(it.exists && (it.megaStone || it.zMove));
};

/** Ranked held-item wishes for a member: the trainer data's own item first, then real usage picks. */
export function itemWishes(t: TrainerDef, key: string, m: TeamMember): string[] {
  const out: string[] = [];
  if (isLineupKey(key)) {
    const own = resolveTeam(t)[Number(key)]?.item;
    if (own && !isGimmickItem(own)) out.push(own);
    const pre = (NPC_ITEMS as Record<string, { sp: string; items: string[] }>)[`${t.id}#${key}`];
    if (pre && pre.sp === dex.species.get(m.species).id) out.push(...pre.items);
  }
  out.push(...roleItems(m, classifyRole(m)));
  return out.filter(i => dex.items.get(i).exists && !isRemovedItem(i));
}

// ---------- gimmick choice ----------

function attackStat(m: TeamMember, cat: string) {
  const s = calcStats({ ...m, evs: m.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } as any);
  return cat === "Physical" ? s.atk : s.spa;
}

/** Moves nobody builds a Tera around: the user faints (Explosion) or must rest a turn after (Hyper Beam). */
function oneShot(id: string): boolean {
  const m = dex.moves.get(id);
  return !!m.selfdestruct || !!m.flags.recharge;
}

/** A move's power as it is usually used: multi-hit moves count their average hits; moves that cost the user
 *  (recoil, lowered stats) count for less, since they are picked less often; two-turn moves count half. */
function usualPower(m: ReturnType<typeof dex.moves.get>): number {
  const hits = Array.isArray(m.multihit) ? (m.multihit[0] + m.multihit[1]) / 2 : m.multihit || 1;
  const costly = !!m.recoil || !!m.mindBlownRecoil || Object.values(m.self?.boosts || {}).some(b => (b as number) < 0);
  return m.basePower * hits * (costly ? 0.8 : 1) * (m.flags.charge ? 0.5 : 1); // two-turn moves (Bounce, Dig) half
}

/** Usable Mega Stones for a species (no stones from games that are not out yet). */
const megaCache = new Map<string, { item: string; forme: string }[]>();
function megaStonesFor(species: string): { item: string; forme: string }[] {
  const name = dex.species.get(species).name;
  const hit = megaCache.get(name);
  if (hit) return hit;
  const out = dex.items
    .all()
    .filter(i => i.megaStone && i.isNonstandard !== "Future" && (i.megaStone as any)[name])
    .map(i => ({ item: i.name, forme: (i.megaStone as any)[name] as string }))
    .filter(x => dex.species.get(x.forme).exists && dex.species.get(x.forme).isNonstandard !== "Future");
  megaCache.set(name, out);
  return out;
}
let zCache: ReturnType<typeof dex.items.all> | null = null;

export interface GimmickPlan {
  mega: { key: string; item: string; value: number } | null;
  z: { key: string; item: string; move: string; value: number } | null;
  tera: { key: string; type: string; value: number } | null;
}

/** The Tera type an NPC would buy for one Pokémon, and how much it gains (to pick the team's best user). */
export function teraChoice(mon: TeamMember): { type: string; value: number } | null {
  const sp = dex.species.get(mon.species);
  const atks = mon.moves.map(id => dex.moves.get(id)).filter(mv => mv.category !== "Status" && mv.basePower > 0 && !oneShot(mv.id));
  if (!atks.length) return null;
  const hit = (mv: (typeof atks)[number]) => usualPower(mv) * (sp.types.includes(mv.type) ? 1.5 : 1) * attackStat(mon, mv.category);
  // attackers: Tera into the type of their strongest attack (usually their own type, ×1.5 → ×2)
  const main = atks.reduce((a, b) => (hit(b) > hit(a) ? b : a));
  let type = main.type;
  // walls (two or more status moves, or one plus far more bulk than offence): a Tera type that only removes
  // weaknesses, never adds one, e.g. Levitate Weezing → Electric (no weaknesses at all) rather than Poison
  const st = sp.baseStats;
  const status = mon.moves.filter(id => dex.moves.get(id).category === "Status").length;
  const bulk = (st.hp + st.def + st.spd) / (Math.max(st.atk, st.spa) + st.spe);
  if (status >= 2 || (status >= 1 && bulk >= 1.5) || bulk >= 2) {
    const now = weakTo(sp.types, mon.ability);
    let best = exposure(sp.types, mon.ability);
    for (const t of new Set(atks.map(mv => mv.type))) {
      const w = weakTo([t], mon.ability);
      if (w.size >= now.size || [...w].some(x => !now.has(x))) continue;
      const e = exposure([t], mon.ability);
      if (e < best) (best = e), (type = t);
    }
  }
  const boosted = Math.max(...atks.filter(mv => mv.type === type).map(mv => usualPower(mv) * attackStat(mon, mv.category)));
  const v = boosted * 0.5 * (type !== main.type ? 1.2 : 1);
  return { type, value: v };
}

/**
 * Who gains most from each gimmick:
 *  - Mega: the biggest stat jump onto the strongest final form (X/Y picked by its attacking moves);
 *  - Z: the hardest-hitting Z-Move (Z power × same-type bonus × attacking stat), signature crystals included;
 *  - Tera: attackers take the type of their strongest attack; walls take one of their attack types that only
 *    removes weaknesses (Levitate Weezing → Electric). Moves used once (Explosion, Hyper Beam) never count.
 * A Pokémon gets at most one; a data-given Mega Stone / Z-Crystal / Tera Type is kept as the plan.
 */
export function planGimmicks(t: TrainerDef | null, members: { key: string; mon: TeamMember }[]): GimmickPlan {
  const plan: GimmickPlan = { mega: null, z: null, tera: null };
  const resolved = t ? resolveTeam(t) : [];
  const dataItem = (key: string) => (isLineupKey(key) ? resolved[Number(key)]?.item || "" : "");
  // Mega
  for (const { key, mon } of members) {
    const d = dataItem(key);
    if (d && dex.items.get(d).megaStone) {
      plan.mega = { key, item: d, value: 1e9 };
      break;
    }
    const phys = mon.moves.filter(x => dex.moves.get(x).category === "Physical").length;
    const spec = mon.moves.filter(x => dex.moves.get(x).category === "Special").length;
    for (const st of megaStonesFor(mon.species)) {
      const f = dex.species.get(st.forme);
      const gain = f.bst - bst(mon.species);
      let fit = 0;
      if (/-X$/.test(f.name)) fit = phys >= spec ? 20 : -20;
      if (/-Y$/.test(f.name)) fit = spec > phys ? 20 : -20;
      const v = f.bst + gain + fit;
      if (!plan.mega || v > plan.mega.value) plan.mega = { key, item: st.item, value: v };
    }
  }
  // Z
  const zCrystals = (zCache ||= dex.items.all().filter(i => i.zMove && i.isNonstandard !== "Future"));
  for (const { key, mon } of members) {
    if (plan.mega?.key === key) continue;
    const d = dataItem(key);
    if (d && dex.items.get(d).zMove) {
      plan.z = { key, item: d, move: "", value: 1e9 };
      break;
    }
    const types = dex.species.get(mon.species).types;
    const name = dex.species.get(mon.species).name;
    for (const id of mon.moves) {
      const mv = dex.moves.get(id);
      if (mv.category === "Status" || !mv.basePower) continue;
      const stat = attackStat(mon, mv.category);
      const stab = types.includes(mv.type) ? 1.5 : 1;
      const sig = zCrystals.find(i => i.itemUser?.includes(name) && dex.moves.get(i.zMoveFrom as string).id === mv.id);
      const typed = zCrystals.find(i => i.zMoveType === mv.type && !i.itemUser);
      const cands: { item: string; bp: number }[] = [];
      if (sig) cands.push({ item: sig.name, bp: dex.moves.get(sig.zMove as string).basePower || 0 });
      if (typed) cands.push({ item: typed.name, bp: (mv.zMove as any)?.basePower || 0 });
      for (const c of cands) {
        const v = c.bp * stab * stat;
        if (!plan.z || v > plan.z.value) plan.z = { key, item: c.item, move: mv.id, value: v };
      }
    }
  }
  // Tera
  for (const { key, mon } of members) {
    if (plan.mega?.key === key || plan.z?.key === key) continue;
    if (isLineupKey(key) && t?.team[Number(key)]?.teraType) {
      plan.tera = { key, type: t.team[Number(key)]!.teraType!, value: 1e9 };
      break;
    }
    const c = teraChoice(mon);
    if (c && (!plan.tera || c.value > plan.tera.value)) plan.tera = { key, ...c };
  }
  // a battle allows one gimmick in singles and two different ones in doubles: buy for the best two kinds
  // (a Mega or Z given in the trainer data first, then Mega > Z > Tera)
  const kinds = (["mega", "z", "tera"] as const).filter(k => plan[k]).sort((a, b) => (plan[b]!.value >= 1e9 ? 1 : 0) - (plan[a]!.value >= 1e9 ? 1 : 0));
  for (const k of kinds.slice(2)) plan[k] = null;
  return plan;
}

// ---------- state ----------

export function npcOf(state: GameState, id: string): NpcState {
  const all = ((state as any).npcs ||= {}) as Record<string, NpcState>;
  if (!all[id]) all[id] = newNpc(state, id);
  return all[id];
}
export const npcs = (state: GameState) => ((state as any).npcs ||= {}) as Record<string, NpcState>;

/** Base slots ranked strongest first (by base stat total). */
function slotsByBst(team: TeamMember[]): number[] {
  return team.map((m, i) => i).sort((a, b) => bst(team[b].species) - bst(team[a].species) || a - b);
}

/** The held items a trainer starts with (role decides how many; the strongest Pokémon get them). */
export function startingItems(t: TrainerDef): Record<string, string> {
  const team = resolveTeam(t);
  const n = ROLE_START_ITEMS[t.role] ?? 0;
  const out: Record<string, string> = {};
  const taken = new Set<string>();
  for (const i of slotsByBst(team).slice(0, n)) {
    const item = itemWishes(t, String(i), team[i]).find(x => !taken.has(x)) || "";
    out[String(i)] = item;
    taken.add(item);
  }
  return out;
}

function newNpc(state: GameState, id: string): NpcState {
  const t = trainerById(id)!;
  const rep = trainerFame(t);
  const n: NpcState = {
    money: 20000 + rep * 300,
    fans: 300 + rep * 40,
    reputation: rep,
    stadium: 1,
    seats: roleSeats(t.role),
    rented: roleRented(t.role),
    sat: SAT_START,
    items: startingItems(t),
    tera: null,
    ranks: [],
    sponsor: null,
    legends: [],
    log: [],
  };
  const org = orgForTrainer(id);
  if (org) n.sponsor = fixedContract(org.name, org.region, rep, state.season);
  return n;
}

function fixedContract(name: string, region: string, rep: number, season: number): SponsorContract {
  return { name, size: "big", region, monthly: fixedMonthly(rep), bonus: 0, objectives: [], fromSeason: season, toSeason: 9999, fixed: true, log: [], paidTotal: 0 };
}

export function initNpcs(state: GameState) {
  for (const t of allTrainers()) if (t.id !== state.player.slotId) npcOf(state, t.id);
}

/** "0".."5": one of the six from the lineup data. */
export const isLineupKey = (key: string) => /^\d+$/.test(key);

/** A member with what the NPC has done to it (EV training, a mint, a new moveset). */
function withCare(mon: TeamMember, c: MemberCare | undefined): TeamMember {
  if (!c) return mon;
  return { ...mon, evs: c.evs ? { ...c.evs } : mon.evs, nature: c.nature || mon.nature, moves: c.moves?.length ? c.moves.slice() : mon.moves };
}

/** Everyone an NPC has: the six from its lineup, legendary recruits ("L0"..) and scouted Pokémon ("S…"). */
export function npcRoster(state: GameState, id: string): Candidate[] {
  const t = trainerById(id)!;
  const n = npcOf(state, id);
  const care = n.care || {};
  const out: Candidate[] = resolveTeam(t).map((mon, i) => ({ key: String(i), mon: withCare(mon, care[String(i)]), signature: true, placeholder: !!mon.placeholder }));
  n.legends.forEach((l, i) => out.push({ key: `L${i}`, mon: withCare(l.mon, care[`L${i}`]), signature: false, placeholder: false }));
  for (const r of n.roster || []) out.push({ key: r.key, mon: withCare(r.mon, care[r.key]), signature: false, placeholder: false });
  return out;
}

/** Picks the six it brings (strength, roles, type cover; specialists keep to their concept). */
export function chooseEntry(state: GameState, id: string): string[] {
  const p = profileOf(id);
  const keys = pickEntry(p.archetype === "specialist", sp => !!conceptFit(p, sp), npcRoster(state, id));
  npcOf(state, id).entry = keys;
  return keys;
}

/** The six in play (the weekly pick, redone if the roster changed since). */
export function npcMembers(state: GameState, id: string): { key: string; mon: TeamMember }[] {
  const n = npcOf(state, id);
  const roster = npcRoster(state, id);
  const valid = n.entry && n.entry.length === Math.min(6, roster.length) && n.entry.every(k => roster.some(c => c.key === k));
  const keys = valid ? n.entry! : chooseEntry(state, id);
  return roster.filter(c => keys.includes(c.key)).map(c => ({ key: c.key, mon: c.mon }));
}

/** The team an NPC brings to a match (bought items, tera, recruits). */
/** How strong a team looks on paper: top four by base stats, weighted a little by IVs. */
function strength(team: { species: string; ivs?: Record<string, number> }[]): number {
  const vals = team
    .map(m => dex.species.get(m.species).bst * (0.75 + (Object.values(m.ivs || {}).reduce((a, b) => a + b, 0) / 186) * 0.25))
    .sort((a, b) => b - a)
    .slice(0, 4);
  return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
}

/** Where each club of a region is expected to finish, by squad strength (1 = strongest). */
export function expectedRanks(state: GameState, region: string): Record<string, number> {
  const ids = state.leagues[region]?.teams || [];
  const rated = ids.map(id => ({ id, s: strength(id === state.player.slotId ? entryTeam(state) : npcTeam(state, id)) })).sort((a, b) => b.s - a.s);
  return Object.fromEntries(rated.map((r, i) => [r.id, i + 1]));
}

export function npcTeam(state: GameState, id: string): TeamMember[] {
  const n = npcOf(state, id);
  const tera = (key: string) => n.care?.[key]?.tera ?? (n.tera?.key === key ? n.tera.type : null);
  return npcMembers(state, id).map(({ key, mon }) => ({ ...mon, item: n.items[key] || "", teraType: tera(key) }));
}

export function note(n: NpcState, state: GameState, text: string) {
  n.log.unshift({ day: state.day, text });
  if (n.log.length > 12) n.log.length = 12;
}

// ---------- money ----------

const npcSat = (n: NpcState) => n.sat ?? SAT_START;

/** An NPC club sets the ticket price that brings in the most (demand curve against its seats). */
export function npcPrice(n: NpcState): number {
  return bestPrice(n.fans, n.reputation, npcSat(n), npcCapacity(n));
}

export function npcGate(n: NpcState): { attendance: number; income: number; price: number } {
  const price = npcPrice(n);
  const g = gateAt(n.fans, n.reputation, npcSat(n), npcCapacity(n), price);
  return { attendance: g.attendance, income: g.income, price };
}

/** One game: gate money for the host, fans by the result, mood and long-run fame (same rules as the player). */
export function npcGame(state: GameState, id: string, home: boolean, outcome: 0 | 1 | -1) {
  if (id === state.player.slotId || !trainerById(id)) return;
  const n = npcOf(state, id);
  if (home) n.money += npcGate(n).income;
  if (outcome === 0) n.fans += 20 + Math.round(n.reputation / 4);
  else if (outcome === 1) n.fans = Math.max(50, n.fans - 5);
  else n.fans += 5;
  npcResult(n, outcome);
  n.fans = Math.round(n.fans * (0.99 + moodFactor(npcSat(n)) * 0.01));
}

export function npcPrize(state: GameState, id: string | undefined, amount: number) {
  if (!id || id === state.player.slotId || !trainerById(id) || !amount) return;
  npcOf(state, id).money += amount;
}

export function npcFame(state: GameState, id: string | undefined, rep: number) {
  if (!id || id === state.player.slotId || !trainerById(id)) return;
  const n = npcOf(state, id);
  n.reputation = Math.min(100, n.reputation + rep);
}

/** An NPC club's own seats (old saves keep a tier), and its seats on match day. */
export const npcSeats = (n: NpcState) => n.seats ?? tierSeats(n.stadium);
export const npcCapacity = (n: NpcState) => capacityOf(npcSeats(n), n.rented ?? RENTED_SEATS);

/** Sunday: merchandise and league share in, stadium upkeep or rent out (same rules as the player). */
export function npcWeek(state: GameState) {
  for (const [id, n] of Object.entries(npcs(state))) {
    if (id === state.player.slotId || !trainerById(id)) continue;
    npcMoodWeek(n);
    const merch = Math.round(n.fans * 0.5 * moodFactor(npcSat(n)));
    const seats = npcSeats(n);
    n.money += merch + solidarity(n.reputation) - upkeepOf({ training: 1, scouting: 1, seats }) - stadiumRent(seats, n.rented ?? RENTED_SEATS);
  }
}

/** Monday: food for everyone on the roster (lineup six, legendary recruits, scouted Pokémon). */
export function npcFoodDay(state: GameState) {
  for (const [id, n] of Object.entries(npcs(state))) {
    if (id === state.player.slotId || !trainerById(id)) continue;
    n.money -= npcRoster(state, id).reduce((a, c) => a + foodCost(c.mon), 0);
  }
}

// ---------- sponsors ----------

function npcScore(state: GameState, id: string, n: NpcState) {
  const t = trainerById(id)!;
  const ranks = n.ranks.slice(-3).reverse();
  const perfs = ranks.length ? ranks.map(rankPerf) : [rankPerf(state.prev.tables[t.region]?.find(r => r.id === id)?.rank ?? 15)];
  return scoreFrom(n.reputation, perfs);
}

/** Monday after the league opener: NPCs without a sponsor take the best offer still on the market. */
export function npcSponsorSigning(state: GameState) {
  const list = Object.entries(npcs(state))
    .filter(([id, n]) => id !== state.player.slotId && trainerById(id) && !(n.sponsor && (n.sponsor.fixed || n.sponsor.toSeason >= state.season)))
    .map(([id, n]) => ({ id, n, s: npcScore(state, id, n) }))
    .sort((a, b) => b.s.score - a.s.score || a.id.localeCompare(b.id));
  for (const { id, n, s } of list) {
    const t = trainerById(id)!;
    const ranks = n.ranks.slice(-3);
    const exp = ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : state.prev.tables[t.region]?.find(r => r.id === id)?.rank ?? 15;
    const offers = offersFor(state, { score: s.score, region: t.region, expRank: exp, tag: `npc:${id}` });
    const best = offers.sort((a, b) => b.monthly * 12 + b.bonus * 0.5 - (a.monthly * 12 + a.bonus * 0.5))[0];
    if (!best) continue;
    n.sponsor = { name: best.name, size: best.size, region: best.region, monthly: best.monthly, bonus: best.bonus, objectives: best.objectives, fromSeason: state.season, toSeason: state.season + best.len - 1, log: [], paidTotal: best.monthly };
    n.money += best.monthly;
    note(n, state, `${best.name}와(과) 스폰서 계약 (월 ₽${best.monthly.toLocaleString()}, ${best.len}시즌)`);
  }
}

/** Daily: sponsor signing day; on the 1st, sponsor pay and stadium growth (purchases are the weekly AI's job). */
export function npcDay(state: GameState) {
  if (state.day === leagueRoundDay(state.season, 0) + 1) npcSponsorSigning(state);
  if (dateOf(state.day).date !== 1) return;
  for (const [id, n] of Object.entries(npcs(state))) {
    const c = n.sponsor;
    if (id === state.player.slotId || !c || (!c.fixed && c.toSeason < state.season)) {
      continue;
    }
    n.money += c.monthly;
    c.paidTotal += c.monthly;
  }
  // a sold-out club builds seats for the crowd it turns away (same prices as the player), keeping its savings
  for (const [id, n] of Object.entries(npcs(state))) if (id !== state.player.slotId && trainerById(id)) npcExpand(n);
}

/**
 * A renting club buys its own ground once it can afford it with savings to spare; an own ground grows to the
 * crowd that would come at the club's reference price, when the extra takings repay the build within two seasons.
 */
export function npcExpand(n: NpcState): number {
  const seats = npcSeats(n);
  if (seats <= 0) {
    const size = n.rented ?? RENTED_SEATS;
    if (n.money < groundPrice(size) + RESERVE * 6) return 0;
    n.money -= groundPrice(size);
    n.seats = size;
    return size;
  }
  const sat = npcSat(n);
  const want = ticketDemand(n.fans, n.reputation, sat, refPrice(n.reputation, sat));
  if (want <= seats * 1.05) return 0;
  const target = Math.min(MAX_SEATS, Math.ceil(want / 100) * 100);
  const cost = expansionCost(seats, target);
  const now = gateAt(n.fans, n.reputation, sat, seats, bestPrice(n.fans, n.reputation, sat, seats)).income;
  const after = gateAt(n.fans, n.reputation, sat, target, bestPrice(n.fans, n.reputation, sat, target)).income;
  if ((after - now) * 40 < cost || n.money < cost + RESERVE * 6) return 0;
  n.money -= cost;
  n.seats = target;
  return target - seats;
}

export function npcJudge(state: GameState, kind: ObjectiveKind) {
  for (const [id, n] of Object.entries(npcs(state))) {
    if (id === state.player.slotId) continue;
    const t = trainerById(id);
    if (!t) continue;
    for (const r of judgeContract(state, n.sponsor, id, t.region, kind)) n.money += r.paid;
  }
}

// ---------- season ----------

/** League over: prize money, league titles, recruits for the champions. */
export function npcLeagueEnd(state: GameState) {
  for (const r of REGIONS) {
    const table = standings(state.leagues[r.id]);
    table.forEach((row, i) => {
      if (row.id === state.player.slotId || !trainerById(row.id)) return;
      const n = npcOf(state, row.id);
      n.money += LEAGUE_PRIZE(i + 1);
      if (i === 0) n.reputation = Math.min(100, n.reputation + 10);
      // finished above (below) what the squad's strength promised: fame up (down)
      const exp = expectedRanks(state, r.id)[row.id];
      if (exp) n.reputation = Math.max(0, Math.min(100, n.reputation + Math.max(-8, Math.min(8, Math.round((exp - (i + 1)) * 0.75)))));
    });
    const champ = table[0]?.id;
    if (champ && champ !== state.player.slotId) npcRecruit(state, champ, r.id, `${r.name} 리그`);
  }
  npcJudge(state, "league");
}

/** A champion NPC signs the strongest of three legendary / mythical candidates. */
export function npcRecruit(state: GameState, id: string, region: string, comp: string) {
  const n = npcOf(state, id);
  const choices = legendChoices(state, region, `npc:${id}:${comp}`);
  if (!choices.length) return;
  const species = choices.slice().sort((a, b) => bst(b) - bst(a))[0];
  const ticket: LegendTicket = { id: `n${id}`, kind: "both", region, comp, season: state.season, expires: 0, choices };
  const owned = legendMon(species, ticket, `${state.seed}:${id}:${comp}:${state.season}`);
  const { exp, origin, joinedSeason, record, known, loanUntil, ...mon } = owned as any;
  void exp, origin, joinedSeason, record, known, loanUntil;
  n.legends.push({ mon: mon as TeamMember, until: state.season + LOAN_SEASONS, comp });
  // no room on a full roster: the weakest scouted Pokémon makes way
  if (npcRoster(state, id).length > NPC_ROSTER_MAX && n.roster?.length) {
    const out = n.roster.slice().sort((a, b) => dex.species.get(a.mon.species).bst - dex.species.get(b.mon.species).bst)[0];
    n.roster = n.roster.filter(r => r !== out);
    delete n.items[out.key];
    if (n.care) delete n.care[out.key];
    note(n, state, `${koSpecies(out.mon.species)} 방출 (전설 영입으로 자리 정리)`);
  }
  n.entry = undefined;
  const who = trainerById(id)!.name;
  note(n, state, `${comp} 우승 상품으로 ${koSpecies(mon.species)} 영입 (시즌 ${state.season + LOAN_SEASONS}까지)`);
  // one message per day for all of the day's signings
  pushMsgMerged(
    state,
    "news",
    `legend:${state.day}`,
    c => (c > 1 ? `[전설 영입] ${who}, ${koSpecies(mon.species)} 외 ${c - 1}건` : `[전설 영입] ${who}, ${koSpecies(mon.species)} 영입`),
    `${who}: ${koSpecies(mon.species)} (${comp} 우승 상품, 후보 ${choices.map(c => koSpecies(dex.species.get(c).name)).join("·")}) — ${LOAN_SEASONS}시즌 동안 엔트리에 들어갑니다.`,
  );
}

/** New season: league ranks for the sponsor market, recruits whose three seasons ended leave, org pay renewed. */
export function npcSeasonStart(state: GameState) {
  for (const [id, n] of Object.entries(npcs(state))) {
    if (id === state.player.slotId) continue;
    const t = trainerById(id);
    if (!t) continue;
    const rank = state.prev.tables[t.region]?.find(r => r.id === id)?.rank;
    if (rank && !state.prev.virtual) n.ranks = [...n.ranks, rank].slice(-3);
    const leaving = n.legends.filter(l => l.until < state.season);
    if (leaving.length) {
      // keys of recruits shift: rebuild items for the ones that stay
      const stay = n.legends.filter(l => l.until >= state.season);
      const items: Record<string, string> = {};
      for (const [k, v] of Object.entries(n.items)) if (!k.startsWith("L")) items[k] = v;
      stay.forEach((l, i) => (items[`L${i}`] = n.items[`L${n.legends.indexOf(l)}`] || ""));
      // EVs / nature / moves / Tera move with them too
      if (n.care) {
        const care: NonNullable<NpcState["care"]> = {};
        for (const [k, v] of Object.entries(n.care)) if (!k.startsWith("L")) care[k] = v;
        stay.forEach((l, i) => {
          const c = n.care![`L${n.legends.indexOf(l)}`];
          if (c) care[`L${i}`] = c;
        });
        n.care = care;
      }
      n.entry = undefined; // picked again next week
      if (n.tera?.key.startsWith("L")) {
        const l = n.legends[Number(n.tera.key.slice(1))];
        n.tera = stay.includes(l) ? { ...n.tera, key: `L${stay.indexOf(l)}` } : null;
      }
      n.items = items;
      n.legends = stay;
      note(n, state, `${leaving.map(l => koSpecies(l.mon.species)).join(", ")} 계약 종료`);
    }
    if (n.sponsor?.fixed) n.sponsor.monthly = fixedMonthly(n.reputation);
    else if (n.sponsor && n.sponsor.toSeason < state.season) n.sponsor = null;
  }
}

export const regionName = (id: string) => regionById(id).name;
