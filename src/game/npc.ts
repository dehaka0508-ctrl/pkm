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
import { pushMsg } from "./state";
import type { TeamMember, TrainerDef } from "./types";
import { STADIUM_CAPACITY, LEAGUE_PRIZE, solidarity, foodCost, gateDemand, gateIncome, upkeepOf } from "./finance";
import { catalog, isRemovedItem, itemName } from "./shop";
import { dateOf, leagueRoundDay } from "./calendar";
import { standings } from "./league";
import { fixedMonthly, judgeContract, offersFor, orgForTrainer, rankPerf, scoreFrom, type ObjectiveKind, type SponsorContract } from "./sponsor";
import { LOAN_SEASONS, legendChoices, legendMon, type LegendTicket } from "./legend";
import { calcStats } from "../battle/calc";

export interface NpcLegend {
  mon: TeamMember;
  until: number; // last season it stays
  comp: string;
}

export interface NpcState {
  money: number;
  fans: number;
  reputation: number;
  stadium: number; // STADIUM_CAPACITY level
  /** held item per member key ("0".."5" = original slots, "L0".. = recruits); "" = none */
  items: Record<string, string>;
  tera: { key: string; type: string } | null;
  ranks: number[]; // league ranks, most recent last
  sponsor: SponsorContract | null;
  legends: NpcLegend[];
  log: { day: number; text: string }[];
}

export const ROLE_REP: Record<string, number> = { 챔피언: 80, 사천왕: 65, 보스: 60, 관장: 50, 라이벌: 45, 주인공: 45, 박사: 40, 기타: 35, 트레이너: 25 };
export const ROLE_STADIUM: Record<string, number> = { 챔피언: 5, 사천왕: 4, 보스: 4, 주인공: 3, 라이벌: 3, 관장: 3, 박사: 2, 기타: 2, 트레이너: 1 };
/** Held items a trainer starts with (the strongest Pokémon by base stat total get them). */
export const ROLE_START_ITEMS: Record<string, number> = { 챔피언: 3, 주인공: 3, 라이벌: 3, 사천왕: 2, 보스: 2, 기타: 2, 박사: 2, 관장: 1, 트레이너: 0 };
/** A trainer's starting fame: the role's, unless the trainer data sets its own. */
export const trainerFame = (t: TrainerDef) => t.fame ?? ROLE_REP[t.role] ?? 35;
const TICKET_PRICE = 20;
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

/** Simple role-based picks for Pokémon without usage data (recruits, edited lineups). */
function ruleItems(m: TeamMember): string[] {
  const sp = dex.species.get(m.species);
  const moves = m.moves.map(x => dex.moves.get(x));
  const status = moves.filter(x => x.category === "Status").length;
  const phys = moves.filter(x => x.category === "Physical").length;
  const spec = moves.filter(x => x.category === "Special").length;
  const out: string[] = [];
  if (sp.nfe) out.push("Eviolite");
  if (status >= 2) out.push(sp.types.includes("Poison") ? "Black Sludge" : "Leftovers", "Sitrus Berry", "Rocky Helmet");
  else if (status === 0) out.push("Life Orb", phys >= spec ? "Choice Band" : "Choice Specs", "Assault Vest", "Expert Belt");
  else out.push("Life Orb", "Leftovers", "Sitrus Berry", "Lum Berry");
  out.push("Leftovers", "Sitrus Berry", "Focus Sash", "Expert Belt");
  return out;
}

/** Ranked held-item wishes for a member: the trainer data's own item first, then real usage picks. */
function itemWishes(t: TrainerDef, key: string, m: TeamMember): string[] {
  const out: string[] = [];
  if (!key.startsWith("L")) {
    const own = resolveTeam(t)[Number(key)]?.item;
    if (own && !isGimmickItem(own)) out.push(own);
    const pre = (NPC_ITEMS as Record<string, { sp: string; items: string[] }>)[`${t.id}#${key}`];
    if (pre && pre.sp === dex.species.get(m.species).id) out.push(...pre.items);
  }
  out.push(...ruleItems(m));
  return out.filter(i => dex.items.get(i).exists && !isRemovedItem(i));
}

// ---------- gimmick choice ----------

function attackStat(m: TeamMember, cat: string) {
  const s = calcStats({ ...m, evs: m.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } as any);
  return cat === "Physical" ? s.atk : s.spa;
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

/**
 * Who gains most from each gimmick:
 *  - Mega: the biggest stat jump onto the strongest final form (X/Y picked by its attacking moves);
 *  - Z: the hardest-hitting Z-Move (Z power × same-type bonus × attacking stat), signature crystals included;
 *  - Tera: the strongest move it could boost (same-type to ×2, or a coverage move to ×1.5).
 * A Pokémon gets at most one; a data-given Mega Stone / Z-Crystal / Tera Type is kept as the plan.
 */
export function planGimmicks(t: TrainerDef | null, members: { key: string; mon: TeamMember }[]): GimmickPlan {
  const plan: GimmickPlan = { mega: null, z: null, tera: null };
  const resolved = t ? resolveTeam(t) : [];
  const dataItem = (key: string) => (key.startsWith("L") ? "" : resolved[Number(key)]?.item || "");
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
    if (!key.startsWith("L") && t?.team[Number(key)]?.teraType) {
      plan.tera = { key, type: t.team[Number(key)]!.teraType!, value: 1e9 };
      break;
    }
    const types = dex.species.get(mon.species).types;
    for (const id of mon.moves) {
      const mv = dex.moves.get(id);
      if (mv.category === "Status" || !mv.basePower) continue;
      const own = types.includes(mv.type);
      // ×1.5 → ×2 for its own type, ×1 → ×1.5 for coverage; own type also keeps its defensive typing
      const v = mv.basePower * attackStat(mon, mv.category) * 0.5 * (own ? 1.05 : 1);
      if (!plan.tera || v > plan.tera.value) plan.tera = { key, type: mv.type, value: v };
    }
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
    stadium: ROLE_STADIUM[t.role] ?? 1,
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

/** Members in play: the original six, with recruits sitting in for the weakest while they stay. */
export function npcMembers(state: GameState, id: string): { key: string; mon: TeamMember }[] {
  const t = trainerById(id)!;
  const base = resolveTeam(t).map((mon, i) => ({ key: String(i), mon }));
  const n = npcOf(state, id);
  const out = base.slice();
  const weakest = slotsByBst(base.map(b => b.mon)).reverse();
  n.legends.forEach((l, i) => {
    const slot = weakest[i];
    if (slot != null) out[slot] = { key: `L${i}`, mon: l.mon };
  });
  return out;
}

/** The team an NPC brings to a match (bought items, tera, recruits). */
export function npcTeam(state: GameState, id: string): TeamMember[] {
  const n = npcOf(state, id);
  return npcMembers(state, id).map(({ key, mon }) => ({ ...mon, item: n.items[key] || "", teraType: n.tera?.key === key ? n.tera.type : null }));
}

function note(n: NpcState, state: GameState, text: string) {
  n.log.unshift({ day: state.day, text });
  if (n.log.length > 12) n.log.length = 12;
}

// ---------- money ----------

function satisfaction(n: NpcState) {
  const priceFactor = Math.max(0.2, 1.25 - (TICKET_PRICE - 10) / 50);
  return Math.min(1.2, priceFactor * (0.6 + n.reputation / 250));
}

export function npcGate(n: NpcState): { attendance: number; income: number } {
  const cap = STADIUM_CAPACITY[n.stadium];
  const attendance = Math.round(Math.min(cap, gateDemand(n.fans, satisfaction(n))));
  return { attendance, income: gateIncome(attendance, TICKET_PRICE) };
}

/** One game: gate money for the host, fans and fame by the result (same rules as the player). */
export function npcGame(state: GameState, id: string, home: boolean, outcome: 0 | 1 | -1) {
  if (id === state.player.slotId || !trainerById(id)) return;
  const n = npcOf(state, id);
  if (home) n.money += npcGate(n).income;
  if (outcome === 0) {
    n.fans += 20 + Math.round(n.reputation / 4);
    n.reputation = Math.min(100, n.reputation + 1);
  } else if (outcome === 1) {
    n.fans = Math.max(50, n.fans - 5);
    n.reputation = Math.max(0, n.reputation - 0.5);
  } else n.fans += 5;
  n.fans = Math.round(n.fans * (0.99 + satisfaction(n) * 0.01));
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

/** Sunday: merchandise, food, upkeep. */
export function npcWeek(state: GameState) {
  for (const [id, n] of Object.entries(npcs(state))) {
    if (id === state.player.slotId || !trainerById(id)) continue;
    const merch = Math.round(n.fans * 0.5 * satisfaction(n));
    // food for the original six and every recruit, stadium upkeep (none at level 1), rent for the rented ground
    const t = trainerById(id)!;
    const food = [...resolveTeam(t), ...n.legends.map(l => l.mon)].reduce((a, m) => a + foodCost(m), 0);
    const costs = food + upkeepOf({ training: 1, scouting: 1, stadium: n.stadium }) + (n.stadium === 1 ? 1500 : 0);
    n.money += merch + solidarity(n.reputation) - costs;
  }
}

/** The next purchase: strongest member first; Mega/Z holders get their stone, then the Tera Shard. */
export function nextPurchase(state: GameState, id: string): { key: string; item: string; price: number; tera?: string } | null {
  const t = trainerById(id)!;
  const n = npcOf(state, id);
  const members = npcMembers(state, id);
  const plan = planGimmicks(t, members);
  const order = members.slice().sort((a, b) => bst(b.mon.species) - bst(a.mon.species));
  const held = new Set(members.map(m => n.items[m.key]).filter(Boolean));
  for (const { key, mon } of order) {
    const goal = plan.mega?.key === key ? plan.mega.item : plan.z?.key === key ? plan.z.item : null;
    const cur = n.items[key] || "";
    if (goal) {
      if (cur !== goal) return { key, item: goal, price: itemPrice(goal) };
    } else if (!cur || isGimmickItem(cur)) {
      const item = itemWishes(t, key, mon).find(x => !held.has(x)) || itemWishes(t, key, mon)[0];
      if (item) return { key, item, price: itemPrice(item) };
    }
    if (plan.tera?.key === key && !(n.tera && n.tera.key === key && n.tera.type === plan.tera.type)) {
      const k = `tera:${plan.tera.type}`;
      return { key, item: k, price: itemPrice(k), tera: plan.tera.type };
    }
  }
  return null;
}

function shop(state: GameState, id: string, n: NpcState) {
  const next = nextPurchase(state, id);
  if (!next || n.money - next.price < RESERVE) return;
  n.money -= next.price;
  const mon = npcMembers(state, id).find(m => m.key === next.key)!.mon;
  if (next.tera) {
    n.tera = { key: next.key, type: next.tera };
    note(n, state, `${itemName(`tera:${next.tera}`)} 구입 → ${koSpecies(mon.species)}`);
    return;
  }
  const old = n.items[next.key];
  if (old) n.money += Math.floor(itemPrice(old) / 2); // the replaced item is sold back
  n.items[next.key] = next.item;
  note(n, state, `${koItem(next.item) || itemName(next.item)} 구입 → ${koSpecies(mon.species)}`);
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

/** Daily: sponsor signing day; on the 1st, sponsor pay and one item purchase. */
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
  // one purchase a month, when the money is there
  for (const [id, n] of Object.entries(npcs(state))) if (id !== state.player.slotId && trainerById(id)) shop(state, id, n);
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
  const who = trainerById(id)!.name;
  note(n, state, `${comp} 우승 상품으로 ${koSpecies(mon.species)} 영입 (시즌 ${state.season + LOAN_SEASONS}까지)`);
  pushMsg(
    state,
    "news",
    `[전설 영입] ${who}, ${koSpecies(mon.species)} 영입`,
    `${comp} 우승 상품으로 ${who}이(가) ${koSpecies(mon.species)}을(를) 데려왔습니다. 후보: ${choices.map(c => koSpecies(dex.species.get(c).name)).join(", ")}.\n${LOAN_SEASONS}시즌 동안 엔트리에 들어갑니다.`,
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
