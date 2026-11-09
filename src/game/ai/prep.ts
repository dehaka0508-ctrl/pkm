// Getting ready for the next opponent: every NPC club, the night before each of its matches, quietly.
//
// What a club may know of its opponent — no more than a player can see for themselves:
//   · what anyone can see: the opponent's six as its club info shows them (species, ability, held item, nature,
//     EVs, moves, Tera; IVs as the trainer's) — nothing hidden behind that
//   · its own last meeting with that opponent: who came out and the moves, items, abilities and Tera they showed
//   · the record sheet: appearances, KOs, damage dealt and damage taken of each of the opponent's Pokémon
// What it may change — only what it can change back: held items (from its bag, or bought) and move sets (from
// what each Pokémon knows, or a TM: bought once, usable for good). EVs, natures and abilities are long-term
// development, never match preparation.
// How much it spends: its money above its reserve, more of it against a stronger opponent (expected finish).
import { toID } from "@pkmn/sim";
import { dex } from "../../data/dex";
import type { GameState } from "../state";
import { teamOf } from "../state";
import type { MatchResult } from "../../battle/engine";
import type { StatTable, TeamMember } from "../types";
import { battlerFromSet, estDamage, accuracyOf, moveData, speedOf, typeMultiplier, type Battler } from "../../battle/calc";
import { bagOf, expectedRanks, itemPrice, npcMembers, npcOf, packSeen, putInBag, unpackSeen, type NpcState, type SeenMon } from "../npc";
import { reserveOf } from "./controller";
import { resolveTeam, trainerById, trainerIv } from "../lineups";
import { BANNED, eggMoves, levelUpMoves } from "../moves";
import { isRemovedItem, tmCompatible, tmPrice } from "../shop";
import { leagueRecords, recordsOf } from "../stats";

// ---------- memory of the last meeting ----------

/** A meeting older than about a season is forgotten. */
const MEMORY_DAYS = 400;

/** After a game, each NPC remembers what the other side showed; only the latest meeting is kept. */
export function rememberMeeting(state: GameState, owners: [string, string], teams: [TeamMember[], TeamMember[]], r: MatchResult) {
  if (!r.seen) return;
  for (const side of [0, 1] as const) {
    const me = owners[side];
    const opp = owners[1 - side];
    if (me === state.player.slotId || !trainerById(me)) continue;
    const mons: string[] = [];
    for (const [slot, x] of Object.entries(r.seen[1 - side])) {
      const mon = teams[1 - side][Number(slot)];
      if (!mon) continue;
      const seen: SeenMon = { s: dex.species.get(mon.species).id };
      if (x.moves.length) seen.m = x.moves.slice();
      if (x.item) seen.i = toID(x.item);
      if (x.ability) seen.a = toID(x.ability);
      if (x.tera) seen.t = x.tera;
      mons.push(packSeen(seen));
    }
    const met = (npcOf(state, me).met ||= {});
    met[opp] = { day: state.day, mons };
    for (const [k, v] of Object.entries(met)) if (state.day - v.day > MEMORY_DAYS) delete met[k];
  }
}

// ---------- the opponent as this club sees it ----------

/** The public part of a team member: what its club info shows (hidden base stats and real IVs left out). */
function publicView(m: TeamMember, iv: number): TeamMember {
  const ivs: StatTable = { hp: iv, atk: iv, def: iv, spa: iv, spd: iv, spe: iv };
  return {
    uid: m.uid,
    species: m.species,
    level: m.level,
    ability: m.ability,
    item: m.item || "",
    nature: m.nature,
    moves: m.moves.slice(),
    evs: { ...m.evs },
    ivs,
    gender: m.gender,
    teraType: m.teraType ?? null,
  };
}

/** Everyone's public team as it stands now (taken before anyone gets ready, so no one sees another's changes). */
export function publicTeam(state: GameState, id: string): TeamMember[] {
  const t = trainerById(id);
  const iv = t ? trainerIv(t) : 31;
  return teamOf(state, id).map(m => publicView(m, iv));
}

type Line = { a: number; k: number; d: number; t: number };

/** The record sheet's lines for a club's Pokémon: this season (all competitions), or all-time league when thin. */
function recordLines(state: GameState, id: string): { lines: Map<string, Line>; games: number } {
  const season = new Map<string, Line>();
  const add = (map: Map<string, Line>, uid: string, x: Line) => {
    const cur = map.get(uid) || { a: 0, k: 0, d: 0, t: 0 };
    map.set(uid, { a: cur.a + x.a, k: cur.k + x.k, d: cur.d + x.d, t: cur.t + x.t });
  };
  const prefix = `${id}|`;
  for (const table of Object.values(recordsOf(state).comps)) for (const [key, x] of Object.entries(table)) if (key.startsWith(prefix)) add(season, key.slice(prefix.length), x);
  let lines = season;
  let total = [...season.values()].reduce((s, x) => s + x.a, 0);
  if (total < 9) {
    const region = id === state.player.slotId ? state.player.region : trainerById(id)?.region;
    const all = new Map<string, Line>();
    for (const [key, x] of Object.entries(region ? leagueRecords(state, region).mons : {})) if (key.startsWith(prefix)) add(all, key.slice(prefix.length), x);
    const allTotal = [...all.values()].reduce((s, x) => s + x.a, 0);
    if (allTotal > total) {
      lines = all;
      total = allTotal;
    }
  }
  return { lines, games: Math.max(1, Math.round(total / 3)) };
}

interface Foe {
  b: Battler;
  /** how much this Pokémon matters: how likely it comes out × how dangerous it has been */
  w: number;
}

function foesOf(state: GameState, me: string, opp: string, pub: TeamMember[]): Foe[] {
  const met = npcOf(state, me).met?.[opp];
  const { lines, games } = recordLines(state, opp);
  const out = pub.map(m => {
    const sid = dex.species.get(m.species).id;
    const memo = met?.mons.map(unpackSeen).find(x => x.s === sid);
    // moves it showed last time count as moves it may use, besides the ones listed
    const moves = [...new Set([...m.moves.map(x => toID(x)), ...(memo?.m || [])])];
    const b = battlerFromSet({ ...m, moves });
    const r = lines.get(m.uid);
    let pick = r ? Math.min(1, Math.max(0.15, (r.a + 1) / (games + 2))) : 0.5;
    if (memo) pick = Math.max(pick, 0.7);
    const threat = r && r.a > 0 ? 0.7 + 0.5 * Math.min(1, r.k / r.a) + 0.3 * Math.min(1, r.d / r.a / 200) + 0.2 * Math.min(1, r.t / r.a / 250) : 1;
    return { b, w: pick * threat };
  });
  const sum = out.reduce((s, x) => s + x.w, 0) || 1;
  for (const x of out) x.w = (x.w * 3) / sum; // about three of them face us
  return out.filter(x => x.w >= 0.2); // the ones it hardly expects to see are not worth planning for
}

// ---------- one against one ----------

interface Hit {
  frac: number;
  move: string;
}

function hitWith(att: Battler, def: Battler, move: string): number {
  return (estDamage(att, def, move) * accuracyOf(move)) / Math.max(1, def.hp);
}

function best(att: Battler, def: Battler, moves = att.moves): Hit {
  let out: Hit = { frac: 0, move: moves[0] || "" };
  for (const mv of moves) {
    const frac = hitWith(att, def, mv);
    if (frac > out.frac) out = { frac, move: mv };
  }
  return out;
}

const contactCache = new Map<string, boolean>();
const isContact = (move: string) => {
  let v = contactCache.get(move);
  if (v === undefined) contactCache.set(move, (v = !!moveData(move).flags?.contact));
  return v;
};
const superEffective = (move: string, def: Battler) => {
  if (!move) return false;
  const m = moveData(move);
  return m.exists && m.category !== "Status" && typeMultiplier(m.type, def.types) > 1;
};

/**
 * a against b, turn by turn with each side's best hit: about -1 (b wins easily) .. +1 (a wins easily).
 * Covers what the damage estimate leaves out: Focus Sash, Chilan Berry, Sitrus Berry, Leftovers / Black Sludge,
 * Rocky Helmet and Life Orb recoil.
 */
function duel(a: Battler, b: Battler, A: Hit, B: Hit): number {
  const side = (x: Battler, hit: Hit) => ({ x, hit, hp: 1, sash: x.item === "focussash", chilan: x.item === "chilanberry", sitrus: x.item === "sitrusberry" });
  const s = [side(a, A), side(b, B)];
  const order = speedOf(a) >= speedOf(b) ? [0, 1] : [1, 0];
  for (let turn = 0; turn < 8; turn++) {
    for (const i of order) {
      const att = s[i];
      const def = s[1 - i];
      if (att.hp <= 0 || def.hp <= 0 || att.hit.frac <= 0) continue;
      let dmg = att.hit.frac;
      if (def.chilan && superEffective(att.hit.move, def.x)) {
        dmg /= 2;
        def.chilan = false;
      }
      if (def.sash && def.hp >= 0.999 && dmg >= def.hp) {
        dmg = def.hp - 0.01;
        def.sash = false;
      }
      def.hp -= dmg;
      if (def.hp > 0 && def.sitrus && def.hp < 0.5) {
        def.hp += 0.25;
        def.sitrus = false;
      }
      if (def.x.item === "rockyhelmet" && isContact(att.hit.move)) att.hp -= 1 / 6;
      if (att.x.item === "lifeorb") att.hp -= 0.1;
    }
    for (const x of s) {
      if (x.hp <= 0) continue;
      if (x.x.item === "leftovers") x.hp = Math.min(1, x.hp + 1 / 16);
      if (x.x.item === "blacksludge") x.hp = x.x.types.includes("Poison") ? Math.min(1, x.hp + 1 / 16) : x.hp - 1 / 8;
    }
    if (s[0].hp <= 0 || s[1].hp <= 0) break;
  }
  if (s[0].hp > 0 && s[1].hp > 0) return (s[0].hp - s[1].hp) * 0.5;
  return s[0].hp > 0 ? 0.5 + 0.5 * s[0].hp : -(0.5 + 0.5 * Math.max(0, s[1].hp));
}

// ---------- our side ----------

interface Mine {
  key: string;
  mon: TeamMember;
  item: string;
  moves: string[];
  /** holds a Mega Stone / Z-Crystal, a choice item or Assault Vest: that stays */
  fixed: boolean;
}

const isGimmickItem = (item: string) => {
  const it = dex.items.get(item);
  return !!(it.exists && (it.megaStone || it.zMove));
};
const hasStatus = (moves: string[]) => moves.some(x => moveData(x).category === "Status");
/** Choice items and Assault Vest only suit four attacks. */
const itemFits = (item: string, moves: string[]) => !(hasStatus(moves) && (/^choice/.test(toID(item)) || toID(item) === "assaultvest"));

const attackingCache = new Map<string, boolean>();
/** Moves worth weighing in a matchup (no recharge / charge turns / self-KO, nothing special-purpose). */
function attacking(id: string): boolean {
  let v = attackingCache.get(id);
  if (v === undefined) {
    const m = moveData(id);
    v = m.exists && m.category !== "Status" && !m.isZ && !m.isMax && !["CAP", "LGPE", "Custom", "Future"].includes(m.isNonstandard as string) && !(m.flags?.recharge || m.flags?.charge || m.selfdestruct);
    attackingCache.set(id, v);
  }
  return v;
}

// learnable moves never change: worked out once per species
const levelCache = new Map<string, string[]>();
const tmCache = new Map<string, Set<string>>();
const levelMoves = (species: string, level: number) => {
  const k = `${species}:${level}`;
  let v = levelCache.get(k);
  if (!v) levelCache.set(k, (v = levelUpMoves(dex.species.get(species).id, level).map(x => x.id)));
  return v;
};
const tmMoves = (species: string) => {
  let v = tmCache.get(species);
  if (!v) tmCache.set(species, (v = tmCompatible(species)));
  return v;
};

/** What a member may use: level-up and egg moves, its lineup moves, its current moves, and the club's TMs it can learn. */
function movePool(n: NpcState, base: TeamMember | undefined, mon: TeamMember): string[] {
  const pool = new Set([...levelMoves(mon.species, mon.level), ...eggMoves(mon.species)]);
  for (const x of base?.moves || []) pool.add(toID(x));
  for (const x of mon.moves) pool.add(toID(x));
  const tm = tmMoves(mon.species);
  for (const x of n.tms || []) if (tm.has(x)) pool.add(x);
  // moves nobody builds a set around (비장의무기, 트림, 꿈먹기…) stay out unless the lineup data gives them
  return [...pool].filter(x => moveData(x).exists && (!BANNED.has(x) || (base?.moves || []).some(y => toID(y) === x)));
}

// items that change what a member's hits do, or what hits on it do (others only matter in the duel itself)
const OFFENSE_ITEMS = new Set(["choiceband", "choicespecs", "lifeorb", "expertbelt", "lightball", "silkscarf", "charcoal", "mysticwater", "magnet", "miracleseed", "nevermeltice", "blackbelt", "poisonbarb", "softsand", "sharpbeak", "twistedspoon", "silverpowder", "hardstone", "spelltag", "dragonfang", "blackglasses", "metalcoat", "fairyfeather"]);
const DEFENSE_ITEMS = new Set(["assaultvest", "eviolite"]);
/**
 * Choice items and Assault Vest are left where the club's long-term plan put them: what they cost a Pokémon in a
 * real battle (locked into one move, no status moves) is beyond the duel, and moving them for a match lost games.
 */
const matchItem = (item: string) => !/^(choice|assaultvest)/.test(toID(item));

/** Hits worked out once per preparation: ours by (member, attack item, move), theirs on us by (member, defence item). */
class Calc {
  private mineHits = new Map<string, number[]>();
  private theirHits = new Map<string, Hit[]>();
  private battlers = new Map<string, Battler>();
  constructor(readonly foes: Foe[]) {}
  /** our member holding `item` (its moves are passed to the hit reckoning separately) */
  battler(m: Mine, item: string, moves: string[] = m.moves): Battler {
    const k = `${m.key}|${item}`;
    let b = this.battlers.get(k);
    if (!b) this.battlers.set(k, (b = battlerFromSet({ ...m.mon, item, moves })));
    return b;
  }
  /** our member's hit with `move` on each opponent */
  mine(m: Mine, item: string, move: string): number[] {
    const id = toID(item);
    const k = `${m.key}|${OFFENSE_ITEMS.has(id) ? id : ""}|${move}`;
    let v = this.mineHits.get(k);
    if (!v) {
      const me = this.battler(m, item, [move]);
      this.mineHits.set(k, (v = this.foes.map(f => hitWith(me, f.b, move))));
    }
    return v;
  }
  /** each opponent's best hit on our member */
  theirs(m: Mine, item: string): Hit[] {
    const id = toID(item);
    const k = `${m.key}|${DEFENSE_ITEMS.has(id) ? id : ""}`;
    let v = this.theirHits.get(k);
    if (!v) {
      const me = this.battler(m, item, m.moves);
      this.theirHits.set(k, (v = this.foes.map(f => best(f.b, me))));
    }
    return v;
  }
  /** how well one member does against the opponents, weighted (the sum of its duels) */
  score(m: Mine, item = m.item, moves = m.moves): number {
    const me = this.battler(m, item, moves);
    const theirs = this.theirs(m, item);
    const hits = moves.filter(attacking).map(x => ({ x, v: this.mine(m, item, x) }));
    let s = 0;
    this.foes.forEach((f, i) => {
      let h: Hit = { frac: 0, move: "" };
      for (const { x, v } of hits) if (v[i] > h.frac) h = { frac: v[i], move: x };
      s += f.w * duel(me, f.b, h, theirs[i]);
    });
    return s;
  }
}

/** Items it would consider buying for a match (their effect on a matchup is what the duel measures). */
const SHOP_ITEMS = ["Life Orb", "Expert Belt", "Focus Sash", "Chilan Berry", "Leftovers", "Black Sludge", "Sitrus Berry", "Rocky Helmet"];
/** A held item whose use the duel can't see (Lum Berry, Heavy-Duty Boots …) is still worth a little over nothing. */
const HOLD_BONUS = 0.05;
/** Least gain (weighted duels, about three opponents) worth a free change / a purchase. */
const MIN_FREE = 0.12;
const MIN_BUY = 0.3;
/** The cheapest attacking TM (60 power) */
const MIN_TM_PRICE = 9000;

// ---------- getting ready ----------

/** Spending for this match: money above the reserve, a larger share against a stronger opponent. */
function budgetFor(state: GameState, me: string, opp: string): number {
  const surplus = npcOf(state, me).money - reserveOf(state, me);
  if (surplus <= 0) return 0;
  const region = opp === state.player.slotId ? state.player.region : trainerById(opp)?.region;
  const ranks = region ? expectedRanks(state, region) : {};
  const size = Object.keys(ranks).length || 20;
  const rank = ranks[opp] ?? size / 2;
  const strength = 1 - (rank - 1) / Math.max(1, size - 1); // 1 = the strongest
  return Math.floor(surplus * (0.05 + 0.25 * strength));
}

/** Best single swap of an attacking move for `m` (from `cands`), if it beats its current moves by `min`. */
function bestSwap(c: Calc, m: Mine, cands: string[], min: number): { moves: string[]; gain: number; added: string } | null {
  const fixed = m.moves.filter(x => !attacking(x));
  const cur = m.moves.filter(x => attacking(x));
  const fresh = cands.filter(x => attacking(x) && !m.moves.includes(x));
  if (!fresh.length) return null;
  // a rough look first (power × type × stats); the six best get the full reckoning
  const me = c.battler(m, m.item, m.moves);
  const types = dex.species.get(m.mon.species).types;
  const quick = (x: string) => {
    const mv = moveData(x);
    const bp = (mv.basePower || 60) * (types.includes(mv.type) ? 1.5 : 1) * (mv.multihit ? 2.5 : 1) * accuracyOf(x);
    const phys = mv.category === "Physical";
    const A = me.stats[phys ? "atk" : "spa"];
    return c.foes.reduce((s, f) => s + f.w * Math.min(3, (bp * typeMultiplier(mv.type, f.b.types) * A) / Math.max(1, f.b.stats[phys ? "def" : "spd"]) / 100), 0);
  };
  const top = fresh.map(x => ({ x, q: quick(x) })).sort((a, b) => b.q - a.q).slice(0, 6).map(t => t.x);
  const now = c.score(m);
  // with a free slot the new move just joins; otherwise it takes the place of the attack that adds least now
  let base = cur;
  if (cur.length + fixed.length >= 4) {
    let drop = cur[0];
    let dropScore = -Infinity;
    for (const y of cur) {
      const without = c.score(m, m.item, [...fixed, ...cur.filter(z => z !== y)]);
      if (without > dropScore) {
        dropScore = without;
        drop = y;
      }
    }
    base = cur.filter(z => z !== drop);
  }
  let out: { moves: string[]; gain: number; added: string } | null = null;
  for (const x of top) {
    const moves = [...fixed, ...base, x];
    const gain = c.score(m, m.item, moves) - now;
    if (gain >= min && (!out || gain > out.gain)) out = { moves, gain, added: x };
  }
  return out;
}

/** Moves first (free): up to two swaps per member that clearly help in this matchup. */
function arrangeMoves(c: Calc, mine: Mine[], pools: Map<string, string[]>) {
  for (const m of mine) {
    for (let k = 0; k < 2; k++) {
      const s = bestSwap(c, m, pools.get(m.key) || [], MIN_FREE);
      if (!s) break;
      m.moves = s.moves;
    }
  }
}

/** Held items (free): the club's items — held or in the bag — go where they help most in this matchup. */
function arrangeItems(c: Calc, n: NpcState, mine: Mine[]) {
  const free = mine.filter(m => !m.fixed);
  const pool: Record<string, number> = { ...bagOf(n) };
  for (const m of free) if (m.item) pool[m.item] = (pool[m.item] || 0) + 1;
  const kinds = Object.keys(pool).filter(i => !isGimmickItem(i) && !isRemovedItem(i) && matchItem(i));
  if (!kinds.length) return;
  const value = new Map<string, Map<string, number>>();
  for (const m of free) {
    const v = new Map<string, number>([["", 0]]);
    const bare = c.score(m, "");
    for (const i of kinds) if (matchItem(i) && itemFits(i, m.moves)) v.set(i, c.score(m, i) - bare + HOLD_BONUS);
    value.set(m.key, v);
  }
  const before = free.reduce((s, m) => s + (value.get(m.key)!.get(m.item) ?? 0), 0);
  // greedy: the biggest gains first, each copy of an item once
  const left = { ...pool };
  const pick = new Map<string, string>();
  const pairs = free.flatMap(m => [...value.get(m.key)!.entries()].filter(([i]) => i).map(([i, g]) => ({ key: m.key, i, g })));
  for (const p of pairs.sort((a, b) => b.g - a.g)) {
    if (pick.has(p.key) || !(left[p.i] > 0) || p.g <= 0) continue;
    pick.set(p.key, p.i);
    left[p.i]--;
  }
  const after = free.reduce((s, m) => s + (value.get(m.key)!.get(pick.get(m.key) || "") ?? 0), 0);
  if (after - before < MIN_FREE) return; // not worth the shuffle
  for (const m of free) m.item = pick.get(m.key) || "";
  const bag: Record<string, number> = {};
  for (const [i, k] of Object.entries(left)) if (k > 0) bag[i] = k;
  n.bag = bag;
}

/** TM moves worth a closer look for a member: same-type or super-effective on one of the likely opponents. */
function tmCandidates(c: Calc, m: Mine, owned: string[]): string[] {
  const types = dex.species.get(m.mon.species).types;
  const heavy = c.foes.filter(f => f.w >= 0.4);
  return [...tmMoves(m.mon.species)].filter(x => {
    if (owned.includes(x) || !attacking(x)) return false;
    const mv = moveData(x);
    if ((mv.basePower || 0) < 60) return false;
    return types.includes(mv.type) || heavy.some(f => typeMultiplier(mv.type, f.b.types) > 1);
  });
}


/** One NPC gets ready for one opponent (once per match day). */
export function prepareFor(state: GameState, me: string, opp: string, oppPublic: TeamMember[]) {
  if (me === state.player.slotId) return;
  const t = trainerById(me);
  if (!t) return;
  const n = npcOf(state, me);
  const tag = `${state.day}:${opp}`;
  if (n.prepped === tag) return;
  n.prepped = tag;
  const foes = foesOf(state, me, opp, oppPublic);
  if (!foes.length) return;
  const c = new Calc(foes);
  const lineup = n.lineup ?? resolveTeam(t);
  const mine: Mine[] = npcMembers(state, me).map(({ key, mon }) => {
    const item = n.items[key] || "";
    return { key, mon, item, moves: mon.moves.map(x => toID(x)), fixed: isGimmickItem(item) || (!!item && !matchItem(item)) };
  });
  const pools = new Map(mine.map(m => [m.key, movePool(n, lineup[Number(m.key)], m.mon)]));
  const startMoves = new Map(mine.map(m => [m.key, m.moves.join()]));
  // a move it may not use (비장의무기 saved by an older preparation) leaves the set; the free slot is filled below
  for (const m of mine) {
    const ok = new Set(pools.get(m.key));
    const keep = m.moves.filter(x => ok.has(x));
    if (keep.length) m.moves = keep;
  }

  // 1. free changes: moves, then held items
  arrangeMoves(c, mine, pools);
  arrangeItems(c, n, mine);

  // 2. one purchase at most, within the budget: the best gain per ₽
  let budget = budgetFor(state, me, opp);
  for (let bought = 0; bought < 1 && budget >= 5000; bought++) {
    let pickBuy: { cost: number; gain: number; apply: () => void } | null = null;
    const consider = (cost: number, gain: number, apply: () => void) => {
      if (gain >= MIN_BUY && cost <= budget && (!pickBuy || gain / cost > pickBuy.gain / pickBuy.cost)) pickBuy = { cost, gain, apply };
    };
    // the four doing best now are the likeliest to play: purchases are weighed for them
    const now = new Map(mine.map(m => [m.key, c.score(m)]));
    for (const m of mine.slice().sort((a, b) => now.get(b.key)! - now.get(a.key)!).slice(0, 4)) {
      // a TM for a move that clearly helps
      if (budget >= MIN_TM_PRICE) {
        const s = bestSwap(c, m, tmCandidates(c, m, pools.get(m.key) || []), MIN_BUY);
        if (s) consider(tmPrice(s.added), s.gain, () => (n.tms ||= []).push(s.added));
      }
      // an item it doesn't have
      if (m.fixed) continue;
      const types = dex.species.get(m.mon.species).types;
      const attacks = m.moves.filter(attacking).length;
      for (const name of SHOP_ITEMS) {
        if (name === "Black Sludge" && !types.includes("Poison")) continue;
        if (OFFENSE_ITEMS.has(toID(name)) && attacks < 2) continue;
        if (!itemFits(name, m.moves) || (bagOf(n)[name] || 0) > 0 || mine.some(x => x.item === name)) continue;
        consider(itemPrice(name), c.score(m, name) - now.get(m.key)!, () => putInBag(n, name));
      }
    }
    const buy = pickBuy as { cost: number; gain: number; apply: () => void } | null;
    if (!buy) break;
    n.money -= buy.cost;
    budget -= buy.cost;
    buy.apply();
    for (const m of mine) pools.set(m.key, movePool(n, lineup[Number(m.key)], m.mon));
    arrangeMoves(c, mine, pools);
    arrangeItems(c, n, mine);
  }

  // 3. that is simply its team from now on (no note, no message: nobody is told)
  for (const m of mine) {
    if (!m.fixed) n.items[m.key] = m.item;
    if (m.moves.join() !== startMoves.get(m.key)) ((n.care ||= {})[m.key] ||= {}).moves = m.moves.slice();
  }
}

/** The clubs of these pairings get ready, each from the other's public team as it is before anyone changes. */
export function prepareMatches(state: GameState, pairs: [string, string][]) {
  const due = (me: string, opp: string) => me !== state.player.slotId && !!trainerById(me) && npcOf(state, me).prepped !== `${state.day}:${opp}`;
  const todo = pairs.filter(([a, b]) => due(a, b) || due(b, a));
  if (!todo.length) return;
  const seen = new Map<string, TeamMember[]>();
  for (const id of new Set(todo.flat())) seen.set(id, publicTeam(state, id));
  for (const [a, b] of todo) {
    prepareFor(state, a, b, seen.get(b)!);
    prepareFor(state, b, a, seen.get(a)!);
  }
}
