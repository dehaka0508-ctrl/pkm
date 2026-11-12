// NPC AI weekly controller (runs every Saturday after the club's books):
//  1. scouts on the road come back with candidates; the best one joins if it improves the squad
//  2. the six for matches are picked again (ai/evaluator.ts pickEntry)
//  3. money goes where it raises strength most per ₽ (value ÷ cost, weighted by priority):
//       1st  moves (TMs for recruits) and held items        — cheap, big effect
//       2nd  EV training and mints for aces and signature Pokémon
//       3rd  Mega Stone / Z-Crystal / Tera Shards
//       4th  scouting, when the squad has a hole (placeholders, a type that hits half the team, low stars)
//     always keeping a reserve that depends on the trainer's spending style; a poor club fits a cheap stand-in
//     (type booster / berry) instead of waiting, and ★2–3 stopgaps don't get expensive care.
import { REGIONS, dex, josa, isLegendaryLike, koItem, koMove, koSpecies, koType, speciesRegion } from "../../data/dex";
import { candidateFee, MISSION_COST } from "../scouting";
import { foodCost, solidarity, stadiumRent, upkeepOf, RENTED_SEATS } from "../finance";
import { moodFactor, SAT_START } from "../fans";
import { resolveTeam, trainerById } from "../lineups";
import { defaultMoves, levelUpMoves } from "../moves";
import { pickNature } from "../natures";
import { Rng } from "../rng";
import { itemName, tmPrice } from "../shop";
import type { GameState } from "../state";
import { EV_TOTAL_CAP } from "../training";
import { STATS, zeroStats, type TeamMember } from "../types";
import { bagOf, chooseEntry, isLineupKey, itemPrice, itemWishes, note, npcGate, putInBag, takeFromBag, npcMembers, npcOf, npcRoster, npcs, npcSeats, planGimmicks, teraChoice, type NpcState } from "../npc";
import { coverScore, criticalTypes, effAgainst, evaluateTeamSynergy, ivsForStars, monPower, roleByStats, starsOf, ATTACK_TYPES } from "./evaluator";
import { budgetItems, buildMoveset, evTarget, isBudgetItem } from "./loadout";
import { NEED_KO, NPC_ROSTER_MAX, type RosterMon, type ScoutTask, type SpendingStyle } from "./models";
import { profileOf } from "./themes";
import { FRESH_WEEK_EXP, freshMon, growFresh, lineupDefOf } from "../fresh";

export const SCOUT_WEEKS = 3;
const EV_STEP = 16;
export const MINT_COST = 20000;

const TIER_WEIGHT: Record<1 | 2 | 3 | 4, number> = { 1: 4, 2: 2, 3: 1.5, 4: 1 };
const STYLE: Record<SpendingStyle, { share: number; floor: number; actions: number }> = {
  aggressive: { share: 0.1, floor: 10000, actions: 3 },
  balanced: { share: 0.2, floor: 15000, actions: 2 },
  frugal: { share: 0.35, floor: 25000, actions: 1 },
};

/**
 * A club's spending habits this season. Clubs invest more as the seasons go by, so that by the third or fourth
 * season even the careful ones have their real items, Tera Shards and gimmick stones: the share of the money
 * held back shrinks (to half by season 4) and one more purchase a week is allowed from season 2, two from season 4.
 */
export function spendingOf(state: GameState, id: string): { share: number; floor: number; actions: number } {
  const st = STYLE[profileOf(id).style];
  const late = Math.max(0, Math.min(1, (state.season - 1) / 3));
  return { share: st.share * (1 - 0.5 * late), floor: st.floor, actions: st.actions + (late >= 0.33 ? 1 : 0) + (late >= 1 ? 1 : 0) };
}

export interface AiAction {
  kind: "item" | "budgetItem" | "moves" | "mint" | "gimmick" | "tera" | "scout";
  tier: 1 | 2 | 3 | 4;
  key?: string;
  cost: number;
  /** expected strength gained (rough %-of-a-member units) */
  value: number;
  label: string;
  apply: () => void;
}

const score = (a: AiAction) => (a.value * TIER_WEIGHT[a.tier] * 10000) / Math.max(1000, a.cost);

/** Income that keeps coming without matches: merch, league share, and a sponsor whose contract runs past this
 *  season (one ending now pays nothing in the August before the next signing). */
function steadyIncome(state: GameState, id: string): number {
  const n = npcOf(state, id);
  const sponsor = n.sponsor && (n.sponsor.fixed || n.sponsor.toSeason > state.season) ? (n.sponsor.monthly * 12) / 52 : 0;
  return n.fans * 0.5 * moodFactor(n.sat ?? SAT_START) + solidarity(n.reputation) + sponsor;
}

/** Weeks with no home gate in a year (summer break and the preseason month): the reserve must last them. */
const NO_GATE_WEEKS = 16;

/** What it keeps back: its style's share of the money, and never less than what carries it through the months
 *  without gate money plus two weeks of costs. */
export function reserveOf(state: GameState, id: string): number {
  const n = npcOf(state, id);
  const st = spendingOf(state, id);
  const burn = weeklyBurn(state, id);
  const gap = Math.max(0, burn - steadyIncome(state, id)) * NO_GATE_WEEKS;
  return Math.max(st.floor, Math.round(n.money * st.share), gap + burn * 2);
}

/** Food, upkeep and rent per week. */
function weeklyBurn(state: GameState, id: string): number {
  const n = npcOf(state, id);
  const seats = npcSeats(n);
  return npcRoster(state, id).reduce((a, c) => a + foodCost(c.mon), 0) + upkeepOf({ training: 1, scouting: 1, seats }) + stadiumRent(seats, n.rented ?? RENTED_SEATS);
}

/** Rough weekly result over a season: merch, league share, sponsor, a home gate every other week, minus costs. */
export function weeklyNet(state: GameState, id: string): number {
  return Math.round(steadyIncome(state, id) + npcGate(npcOf(state, id)).income * 0.45 - weeklyBurn(state, id));
}

const careOf = (n: NpcState, key: string) => ((n.care ||= {})[key] ||= {});

/** How much a member matters: the strongest two most, the last two least; ★2–3 stopgaps barely (for costly care). */
function importance(members: { key: string; mon: TeamMember }[], placeholderKeys: Set<string>) {
  const ranked = members.slice().sort((a, b) => monPower(b.mon) - monPower(a.mon));
  const w = [1, 1, 0.85, 0.85, 0.7, 0.7];
  const out = new Map<string, { imp: number; costly: number }>();
  ranked.forEach((m, i) => {
    const stars = starsOf(m.mon.ivs);
    const stopgap = stars <= 3 && (placeholderKeys.has(m.key) || !isLineupKey(m.key));
    out.set(m.key, { imp: w[i] ?? 0.6, costly: stopgap ? 0.3 : 1 });
  });
  return out;
}

/** Everything worth buying this week, best value per ₽ first. */
export function planActions(state: GameState, id: string): AiAction[] {
  const t = trainerById(id);
  if (!t) return [];
  const n = npcOf(state, id);
  const roster = npcRoster(state, id);
  const members = npcMembers(state, id);
  const placeholders = new Set(roster.filter(c => c.placeholder).map(c => c.key));
  const imp = importance(members, placeholders);
  const acts: AiAction[] = [];
  const held = new Set(members.map(m => n.items[m.key]).filter(Boolean));
  // a fresh start's six owe nothing to the lineup data's stones and Tera types
  const plan = planGimmicks(state.fresh ? null : t, members);
  const gimmickKeys = new Set([plan.mega?.key, plan.z?.key].filter(Boolean) as string[]);

  for (const { key, mon } of members) {
    const { imp: w, costly } = imp.get(key)!;
    const name = koSpecies(mon.species);
    // 1st: a moveset for its role (recruits come with level-up moves only)
    if (!isLineupKey(key) && !n.care?.[key]?.moves && !mon.target) {
      const target = buildMoveset(mon.species, roleByStats(mon.species), `${id}:${key}`);
      const lv = new Set(levelUpMoves(mon.species, 100).map(m => m.id));
      const cost = target.filter(m => !lv.has(m)).reduce((a, m) => a + tmPrice(m), 0);
      acts.push({ kind: "moves", tier: 1, key, cost, value: 8 * w, label: `기술 세팅 → ${name}`, apply: () => {
        careOf(n, key).moves = target;
        note(n, state, `기술 세팅 → ${name} (${target.map(koMove).join("·")})`);
      } });
    }
    // 1st: a held item (gimmick holders get their stone below)
    const cur = n.items[key] || "";
    if (!gimmickKeys.has(key)) {
      const wish = itemWishes(t, key, mon).find(x => !held.has(x) || x === cur);
      if (wish && wish !== cur && (!cur || isBudgetItem(cur))) {
        const inBag = (bagOf(n)[wish] || 0) > 0;
        acts.push({ kind: "item", tier: 1, key, cost: inBag ? 0 : itemPrice(wish), value: (cur ? 5 : 10) * w, label: `${itemName(wish)} → ${name}`, apply: () => (inBag && takeFromBag(n, wish) ? holdFromBag(n, key, wish) : equipNpc(state, n, key, wish, name)) });
      }
      // too poor for the real thing: a cheap stand-in now
      if (!cur && wish && n.money - itemPrice(wish) < reserveOf(state, id)) {
        const cheap = budgetItems(mon).find(x => !held.has(x));
        if (cheap) acts.push({ kind: "budgetItem", tier: 1, key, cost: itemPrice(cheap), value: 4 * w, label: `${itemName(cheap)} (임시) → ${name}`, apply: () => equipNpc(state, n, key, cheap, name) });
      }
    }
    const stars = starsOf(mon.ivs);
    // 2nd: a mint when a recruit's nature doesn't suit its moves
    if (!isLineupKey(key) && stars >= 4) {
      const want = pickNature(mon.species, mon.moves).nature;
      if (want !== mon.nature) acts.push({ kind: "mint", tier: 2, key, cost: MINT_COST, value: 6 * w * costly, label: `${itemName(`mint:${want}`)} → ${name}`, apply: () => {
        careOf(n, key).nature = want;
        note(n, state, `${itemName(`mint:${want}`)} 사용 → ${name}`);
      } });
    }
    // 3rd: Tera — its own type is free to set; another type needs a Tera Shard
    if (!gimmickKeys.has(key)) {
      const c = teraChoice(mon);
      const now = n.care?.[key]?.tera ?? (n.tera?.key === key ? n.tera.type : null);
      // (its own first type is set for free in the weekly run: freeTera)
      if (c && c.type !== now && !(c.type === dex.species.get(mon.species).types[0] && !now)) {
        const shards = members.filter(m => (n.care?.[m.key]?.tera ?? null) && n.care![m.key].tera !== dex.species.get(m.mon.species).types[0]).length;
        acts.push({ kind: "tera", tier: 3, key, cost: itemPrice(`tera:${c.type}`), value: (shards ? 2 : 6) * w * costly, label: `${itemName(`tera:${c.type}`)} → ${name}`, apply: () => {
          careOf(n, key).tera = c.type;
          note(n, state, `${itemName(`tera:${c.type}`)} 구입 → ${name}`);
        } });
      }
    }
  }
  // 3rd: Mega Stone / Z-Crystal for the one that gains most
  for (const g of [plan.mega, plan.z]) {
    if (!g || n.items[g.key] === g.item) continue;
    const m = members.find(x => x.key === g.key)!;
    const w = imp.get(g.key)?.imp ?? 0.7;
    acts.push({ kind: "gimmick", tier: 3, key: g.key, cost: itemPrice(g.item), value: (g === plan.mega ? 20 : 12) * w, label: `${koItem(g.item) || itemName(g.item)} → ${koSpecies(m.mon.species)}`, apply: () => equipNpc(state, n, g.key, g.item, koSpecies(m.mon.species)) });
  }
  // 4th: scouting when the squad has a hole
  const full = roster.length >= NPC_ROSTER_MAX;
  // one more Pokémon eats about ₽2,000 a week: the club must afford that through the months without gate money too
  const affordable = full || (weeklyNet(state, id) > 2500 && n.money - MISSION_COST - 10000 - 2000 * (NO_GATE_WEEKS + 2) >= reserveOf(state, id));
  if (!(n.scouts || []).length && state.day >= (n.scoutRest ?? 0) && affordable) {
    const s = scoutNeed(state, id);
    if (s) acts.push({ kind: "scout", tier: 4, cost: MISSION_COST, value: s.value, label: `스카우트 파견 (${s.label})`, apply: () => sendScout(state, id, s.task) });
  }
  // The weekly budget is for items. Training runs separately from the spending plan.
  // (held items, budget stand-ins, Mega Stones / Z-Crystals, Tera Shards)
  return acts.filter(a => NPC_BUYS.has(a.kind)).sort((a, b) => score(b) - score(a));
}
const NPC_BUYS = new Set<AiAction["kind"]>(["item", "budgetItem", "gimmick", "tera"]);

/** Gives a member an item taken out of the bag (what it held goes into the bag). */
function holdFromBag(n: NpcState, key: string, item: string) {
  const old = n.items[key];
  if (old) putInBag(n, old);
  n.items[key] = item;
}

function equipNpc(state: GameState, n: NpcState, key: string, item: string, name: string) {
  const old = n.items[key];
  if (old) putInBag(n, old); // kept: it can be held again later
  n.items[key] = item;
  note(n, state, `${koItem(item) || itemName(item)} 구입 → ${name}`);
}

// ---------- scouting ----------

let finals: string[] | null = null;
/** Fully evolved, non-legendary species a scout can bring back (regional forms included). */
function finalPool(): string[] {
  return (finals ||= dex.species
    .all()
    .filter(s => s.exists && s.num > 0 && s.num <= 1025 && !s.evos.length && !s.battleOnly && !["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string))
    .filter(s => !s.forme || /^(Alola|Galar|Hisui|Paldea)$/.test(s.forme))
    .filter(s => !isLegendaryLike(s.id) && s.bst >= 400)
    .map(s => s.id));
}

/** Why this squad should scout, and for what (or null when it is fine as it is). */
export function scoutNeed(state: GameState, id: string): { value: number; label: string; task: Omit<ScoutTask, "id" | "weeksLeft"> } | null {
  const t = trainerById(id)!;
  const roster = npcRoster(state, id);
  const members = npcMembers(state, id).map(m => m.mon);
  const scouted = roster.filter(c => c.key.startsWith("S"));
  // roster full of Pokémon it would never let go: nothing to gain
  if (roster.length >= NPC_ROSTER_MAX && !scouted.length) return null;
  const placeholders = roster.filter(c => c.placeholder && npcMembers(state, id).some(m => m.key === c.key)).length;
  const crit = criticalTypes(members);
  const avgStars = members.reduce((a, m) => a + starsOf(m.ivs), 0) / Math.max(1, members.length);
  // what the six lack as a team (a role, a cushion for a consistent type, the format's must-haves)
  const lacks = evaluateTeamSynergy(members, "league").missing;
  let value = 0;
  if (placeholders) value += 10 + 4 * placeholders;
  if (crit.length) value += 10;
  if (avgStars <= 3) value += 8;
  if (lacks.length) value += Math.min(8, 3 * lacks.length);
  if (!value) return null;
  const region = t.region;
  // a missing cushion: scout a type that resists it
  const cushion = lacks.find(x => x.startsWith("cushion:"))?.slice(8);
  if (cushion && !crit.length && !placeholders) {
    const best = ATTACK_TYPES().map(d => ({ d, v: effAgainst(cushion, [d]) })).sort((a, b) => a.v - b.v)[0];
    if (best && best.v < 1) return { value, label: `${koType(best.d)} 타입 · ${koType(cushion)} 대비`, task: { region, type: best.d, purpose: "wildcard" } };
  }
  // a wildcard: a type that resists what hits the team
  if (crit.length && !placeholders) {
    const best = ATTACK_TYPES().map(d => ({ d, v: crit.filter(a => effAgainst(a, [d]) < 1).length })).sort((a, b) => b.v - a.v)[0];
    if (best?.v) return { value, label: `${koType(best.d)} 타입 · 약점 보완`, task: { region, type: best.d, purpose: "wildcard" } };
  }
  const role = lacks.find(x => !x.startsWith("cushion:"));
  return { value, label: role ? `전력 보강 · ${NEED_KO[role] ?? role}` : "전력 보강", task: { region, type: null, purpose: "upgrade" } };
}

function sendScout(state: GameState, id: string, task: Omit<ScoutTask, "id" | "weeksLeft">) {
  const n = npcOf(state, id);
  (n.scouts ||= []).push({ ...task, id: `${state.day}`, weeksLeft: SCOUT_WEEKS });
  const regionName = REGIONS.find(r => r.id === task.region)?.name || "";
  note(n, state, `스카우트 파견 (${regionName}${task.type ? ` · ${koType(task.type)}` : ""})`);
}

/** A scout's report: a few fully trained candidates; the best one joins if it makes the squad better. */
function scoutReport(state: GameState, id: string, task: ScoutTask) {
  const n = npcOf(state, id);
  const rng = new Rng(`${state.seed}:${id}:report:${task.id}`);
  const fitsTask = (sp: string) => (task.type ? dex.species.get(sp).types.includes(task.type) : true);
  let pool = finalPool().filter(fitsTask);
  const local = pool.filter(sp => speciesRegion(sp) === task.region);
  if (local.length >= 3) pool = local;
  if (!pool.length) return;
  const owned = new Set(npcRoster(state, id).map(c => dex.species.get(c.mon.species).id));
  const quality = 0.35 + Math.min(100, n.reputation) / 200;
  const cands: RosterMon[] = [];
  const count = 3 + Math.floor(n.reputation / 30);
  for (let i = 0; i < count; i++) {
    const sp = dex.species.get(rng.pick(pool));
    if (owned.has(sp.id)) continue;
    const stars = Math.max(1, Math.min(5, Math.round((1.5 + rng.next() * 2 + quality * 2) * 2) / 2));
    const moves = defaultMoves(sp.id, 50);
    const abilities = [sp.abilities[0], sp.abilities[1]].filter(Boolean) as string[];
    const gender: "M" | "F" | "" = sp.gender === "N" ? "" : sp.gender === "M" ? "M" : sp.gender === "F" ? "F" : rng.chance(sp.genderRatio?.F ?? 0.5) ? "F" : "M";
    const key = `S${state.day}${i}`;
    // 새출발: scouts find young first-stage Pokémon (like the player's) that grow toward the one wanted
    const mon: TeamMember = state.fresh
      ? { ...freshMon(sp.name, `${id}#${key}`, rng, 5 + rng.int(0, 9)), ivs: ivsForStars(stars, rng) }
      : { uid: `${id}#${key}`, species: sp.name, level: 50, ability: rng.pick(abilities), item: "", nature: pickNature(sp.id, moves).nature, moves, evs: zeroStats(), ivs: ivsForStars(stars, rng), gender, teraType: null };
    if (state.fresh && owned.has(dex.species.get(mon.species).id)) continue;
    cands.push({ key, stars, joined: state.day, why: task.purpose, mon });
  }
  if (!cands.length) return;
  const members = npcMembers(state, id);
  const crit = criticalTypes(members.map(m => m.mon));
  const worth = (m: TeamMember) => monPower(m) * (1 + 0.04 * Math.max(0, coverScore(m, crit)));
  // a candidate is weighed in the six it would join (in place of the weakest): what the team gains as a whole
  const six = members.map(m => m.mon);
  const out0 = six.slice().sort((a, b) => worth(a) - worth(b))[0];
  const rest = six.filter(m => m !== out0);
  const fit = (m: TeamMember) => worth(m) * evaluateTeamSynergy([...rest, m], "league").score;
  const best = cands.sort((a, b) => fit(b.mon) - fit(a.mon))[0];
  const fee = candidateFee(best.mon.species, best.mon.level, best.stars);
  const roster = npcRoster(state, id);
  const weakestEntry = members.slice().sort((a, b) => worth(a.mon) - worth(b.mon))[0];
  const better = !weakestEntry || worth(best.mon) > worth(weakestEntry.mon) * 0.97 || roster.find(c => c.key === weakestEntry.key)?.placeholder;
  const name = koSpecies(best.mon.species);
  n.scoutRest = state.day + 56; // nothing signed: wait about two months before the next scout
  if (!better) return note(n, state, `스카우트 보고: 쓸 만한 후보 없음`);
  if (n.money - fee < reserveOf(state, id) / 2) return note(n, state, `스카우트 보고: ${name} ★${best.stars} — 자금 부족으로 보류`);
  // a full roster lets its weakest scouted Pokémon go
  if (roster.length >= NPC_ROSTER_MAX) {
    const out = roster.filter(c => c.key.startsWith("S")).sort((a, b) => worth(a.mon) - worth(b.mon))[0];
    if (!out || worth(out.mon) >= worth(best.mon)) return;
    releaseNpc(n, out.key);
    note(n, state, `${josa(koSpecies(out.mon.species), "을를")} 놓아줌`);
  }
  n.money -= fee;
  n.scoutRest = state.day + 14;
  (n.roster ||= []).push(best);
  note(n, state, `${name} ★${best.stars} 영입 (₽${fee.toLocaleString()})`);
}

function releaseNpc(n: NpcState, key: string) {
  n.roster = (n.roster || []).filter(r => r.key !== key);
  delete n.items[key];
  if (n.care) delete n.care[key];
}

// ---------- the weekly loop ----------

/** One NPC's week: scouts report, the six are re-picked, then the best-value purchases within its reserve. */
export function aiWeek(state: GameState, id: string) {
  const n = npcOf(state, id);
  // short of money: items lying in the bag are sold back (half price)
  for (const [item, count] of Object.entries(bagOf(n))) {
    if (n.money >= 0) break;
    for (let c = 0; c < count && n.money < 0; c++) if (takeFromBag(n, item)) n.money += Math.floor(itemPrice(item) / 2);
  }
  for (const s of n.scouts || []) s.weeksLeft--;
  const back = (n.scouts || []).filter(s => s.weeksLeft <= 0);
  n.scouts = (n.scouts || []).filter(s => s.weeksLeft > 0);
  for (const s of back) scoutReport(state, id, s);
  const entry = chooseEntry(state, id);
  // recruits left out of the six still eat: after eight weeks on the bench (one week when broke) they go
  for (const r of n.roster || []) r.benchWeeks = entry.includes(r.key) ? 0 : (r.benchWeeks || 0) + 1;
  const benched = (n.roster || []).filter(r => (r.benchWeeks || 0) >= (n.money < 0 ? 1 : 8)).sort((a, b) => monPower(a.mon) - monPower(b.mon))[0];
  if (benched) {
    releaseNpc(n, benched.key);
    note(n, state, `${josa(koSpecies(benched.mon.species), "을를")} 놓아줌 (출전 기회 없음)`);
  }
  freeTera(state, id);
  const st = spendingOf(state, id);
  let done = 0;
  const tried = new Set<string>();
  while (done < st.actions) {
    const acts = planActions(state, id).filter(a => !tried.has(a.label));
    const reserve = reserveOf(state, id);
    // a scout also needs the signing fee (about ₽10,000) to be there when it reports
    const a = acts.find(x => n.money - x.cost - (x.kind === "scout" ? 10000 : 0) >= reserve);
    if (!a) break;
    tried.add(a.label);
    n.money -= a.cost;
    a.apply();
    done++;
    if (a.kind === "moves" || a.kind === "mint") chooseEntry(state, id);
  }
  trainRoster(state, id, n);
}

function trainRoster(state: GameState, id: string, n: NpcState) {
  const lineup = n.lineup ?? resolveTeam(trainerById(id)!);
  const baseRoster = [
    ...lineup.map((mon, i) => [String(i), mon] as const),
    ...n.legends.map(({ mon }, i) => [`L${i}`, mon] as const),
    ...(n.roster ?? []).map(({ key, mon }) => [key, mon] as const),
  ];
  for (const [key, base] of baseRoster) {
    // Respect a complete data-authored spread (508 is the usual competitive total).
    if (STATS.reduce((sum, stat) => sum + base.evs[stat], 0) >= 508) continue;
    const care = n.care?.[key];
    const target = evTarget({ ...base, nature: care?.nature || base.nature, item: n.items[key] || "" });
    const evs = { ...(care?.evs ?? base.evs) };
    const deficit = (stat: keyof typeof evs) => target[stat] - evs[stat];
    const stat = STATS.filter(k => deficit(k) > 0).sort((a, b) => deficit(b) - deficit(a))[0];
    if (!stat) continue;
    const gain = Math.min(EV_STEP, deficit(stat));
    let room = EV_TOTAL_CAP - STATS.reduce((sum, k) => sum + evs[k], 0);
    for (const surplus of STATS.filter(k => deficit(k) < 0)) {
      if (room >= gain) break;
      const shift = Math.min(-deficit(surplus), gain - room);
      evs[surplus] -= shift;
      room += shift;
    }
    evs[stat] += Math.min(gain, room);
    careOf(n, key).evs = evs;
  }
}

/** Tera to its own first type costs nothing: every member in the six that wants that gets it set. */
function freeTera(state: GameState, id: string) {
  const n = npcOf(state, id);
  for (const { key, mon } of npcMembers(state, id)) {
    if (n.care?.[key]?.tera || n.tera?.key === key) continue;
    const c = teraChoice(mon);
    if (c && c.type === dex.species.get(mon.species).types[0]) careOf(n, key).tera = c.type;
  }
}

/** 새출발: a week of growth for every growing Pokémon (EXP, evolutions, new moves). */
export function freshGrowth(state: GameState, id: string) {
  const n = npcOf(state, id);
  const grow = (key: string, mon: TeamMember, def?: TeamMember) => {
    const was = mon.species;
    if (!growFresh(mon, FRESH_WEEK_EXP, `${id}:${mon.uid}`, n.tms, def)) return;
    // the moves picked for a match give way to the new set (the next match prep arranges them again)
    if (n.care?.[key]) delete n.care[key].moves;
    if (mon.species !== was) note(n, state, `${koSpecies(was)} → ${koSpecies(mon.species)} 진화`);
    n.entry = undefined;
  };
  (n.lineup || []).forEach((m, i) => grow(String(i), m, lineupDefOf(id, String(i))));
  for (const r of n.roster || []) grow(r.key, r.mon);
}

/** Every NPC club's week. */
export function npcAiWeek(state: GameState) {
  for (const id of Object.keys(npcs(state))) {
    if (id === state.player.slotId || !trainerById(id)) continue;
    if (state.fresh) freshGrowth(state, id);
    aiWeek(state, id);
  }
}

/** What the AI means to do next (for the trainer window). */
export function nextGoal(state: GameState, id: string): string | null {
  return planActions(state, id)[0]?.label ?? null;
}
