import { BATTLE_LEVEL } from "../game/types";
// Wraps the Showdown simulator into a league match: 6 shown, 3 picked, Lv50 singles.
import { Battle } from "@pkmn/sim";
import { dex } from "../data/dex";
import type { Gimmick, MonCondition, TeamMember } from "../game/types";
import { Rng } from "../game/rng";
import { chooseAction, chooseDoubles, pickThree, type AiMemory } from "./ai";

export const FORMAT = "gen9nationaldexag@@@Picked Team Size = 3";
/** Regional cup: doubles under Pokémon Champions rules — the registered team is shown, four are picked. */
export const FORMAT_DOUBLES = "gen9doublescustomgame@@@NatDex Mod,Picked Team Size = 4";
export const MAX_TURNS = 120;

export interface SideConfig {
  name: string;
  team: TeamMember[];
  gimmick: Gimmick;
  skill: number;
  human?: boolean;
  /** pre-chosen picks (0-based indices into team, lead first) */
  picks?: number[];
}

export interface BattleOptions {
  /** doubles with the whole team (regional cup) */
  doubles?: boolean;
}

export interface MatchResult {
  winner: 0 | 1 | -1;
  remaining: [number, number];
  turns: number;
  picks: [number[], number[]];
  /** per side: team index -> KOs scored */
  kos: [Record<number, number>, Record<number, number>];
  /** per side: team index -> HP dealt to / taken from the other side (move hits and contact effects) */
  dmg?: [Record<number, { dealt: number; taken: number }>, Record<number, { dealt: number; taken: number }>];
  /** per side: uid -> HP / PP left after the battle (Pokémon that took part) */
  after?: [Record<string, MonCondition>, Record<string, MonCondition>];
}

/** Showdown set from our team member. Battle name is a short slot id ("m0".."m5"). */
export function toShowdownSet(m: TeamMember, slot: number) {
  const s = dex.species.get(m.species);
  return {
    name: `m${slot}`,
    species: s.name,
    item: m.item || "",
    ability: m.ability || s.abilities[0],
    moves: m.moves.slice(0, 4),
    nature: m.nature || "Serious",
    evs: m.evs,
    ivs: m.ivs,
    level: BATTLE_LEVEL,
    gender: m.gender || "",
    shiny: !!m.shiny,
    teraType: m.teraType || s.types[0],
  };
}

/** The request offers a single move without PP (Recharge, a locked move, Struggle): no real choice. */
export function forcedMove(req: any): boolean {
  if (!req || req.forceSwitch || req.wait || req.teamPreview) return false;
  const act = (req.active || []).filter((a: any, i: number) => a && !req.side?.pokemon?.[i]?.condition?.endsWith(" fnt"));
  return act.length > 0 && act.every(slotForced);
}

/** One active Pokémon has nothing to choose (recharge, locked move, Struggle). */
export function slotForced(a: any): boolean {
  const moves = a?.moves;
  return Array.isArray(moves) && moves.length === 1 && moves[0].pp === undefined;
}

export type GimmickKind = "mega" | "z" | "tera";
const GIMMICK_TOKEN: Record<string, GimmickKind> = { mega: "mega", megax: "mega", megay: "mega", zmove: "z", terastallize: "tera" };

/**
 * Gimmicks a side could use in this battle, best first: a Mega Stone holder, then a Z-Crystal holder, then a
 * Pokémon with a chosen Tera Type (bought Tera Shard).
 */
export function gimmickOptions(team: TeamMember[], picks: number[]): GimmickKind[] {
  const mons = picks.map(i => team[i]).filter(Boolean);
  const out: GimmickKind[] = [];
  if (mons.some(m => m.item && dex.items.get(m.item).megaStone)) out.push("mega");
  if (mons.some(m => m.item && dex.items.get(m.item).zMove)) out.push("z");
  if (mons.some(m => !!m.teraType)) out.push("tera");
  return out;
}

export class BattleSession {
  battle: any;
  sides: [SideConfig, SideConfig];
  rng: Rng;
  private logIndex = 0;
  private memory: [AiMemory, AiMemory] = [{ lastSwitchTurn: -9 }, { lastSwitchTurn: -9 }];
  picks: [number[], number[]] = [[], []];
  kos: [Record<number, number>, Record<number, number>] = [{}, {}];
  dmg: [Record<number, { dealt: number; taken: number }>, Record<number, { dealt: number; taken: number }>] = [{}, {}];
  /** exact HP per "side:slot" from the hidden (split) log lines, for damage amounts */
  private hpNow: Record<string, number> = {};
  private splitState: "none" | "secret" | "skip" = "none";
  private koScanIndex = 0;

  doubles: boolean;
  /** gimmicks each side has used (Mega / Z / Tera): at most 1 in singles, 2 different ones in doubles */
  gimmicksUsed: [GimmickKind[], GimmickKind[]] = [[], []];
  /** the AI's plan: which gimmicks it saves its uses for */
  gimmickPlan: [GimmickKind[], GimmickKind[]] = [[], []];
  get gimmickLimit() {
    return this.doubles ? 2 : 1;
  }

  constructor(p1: SideConfig, p2: SideConfig, seed: number | string, opts: BattleOptions = {}) {
    this.sides = [p1, p2];
    this.rng = new Rng(seed);
    this.doubles = !!opts.doubles;
    this.battle = new Battle({ formatid: (this.doubles ? FORMAT_DOUBLES : FORMAT) as any, seed: this.rng.seed4() as any });
    this.battle.setPlayer("p1", { name: p1.name || "P1", team: p1.team.map(toShowdownSet) as any });
    this.battle.setPlayer("p2", { name: p2.name || "P2", team: p2.team.map(toShowdownSet) as any });
    // untreated damage from the last battle: start with that HP and PP
    for (let i = 0; i < 2; i++) {
      for (const pk of this.battle.sides[i].pokemon) {
        const cond = this.sides[i].team[Number(pk.set.name.slice(1))]?.cond;
        if (!cond) continue;
        pk.hp = Math.max(1, Math.min(pk.maxhp, Math.round(pk.maxhp * cond.hp)));
        for (const ms of [...pk.moveSlots, ...(pk.baseMoveSlots || [])]) {
          const used = cond.pp[ms.id] || 0;
          ms.pp = Math.max(0, ms.maxpp - used);
        }
      }
    }
  }

  /** Resolves team preview. Human sides must have `picks` set before calling. */
  start() {
    for (let i = 0; i < 2; i++) {
      const cfg = this.sides[i];
      const other = this.sides[1 - i];
      let picks = cfg.picks;
      // doubles: four of the registered team, the first two lead
      const size = Math.min(this.doubles ? 4 : 3, cfg.team.length);
      if (!picks || picks.length === 0) picks = pickThree(cfg.team, other.team, cfg.skill, this.rng, size);
      picks = picks.slice(0, size);
      // pad with remaining in order so Showdown gets a full ordering
      const order = [...picks, ...cfg.team.map((_, j) => j).filter(j => !picks!.includes(j))];
      this.picks[i] = picks;
      this.gimmickPlan[i] = gimmickOptions(cfg.team, picks).slice(0, this.gimmickLimit);
      this.battle.choose(i === 0 ? "p1" : "p2", `team ${order.map(j => j + 1).join("")}`);
    }
  }

  get ended(): boolean {
    return !!this.battle.ended;
  }

  /** Which human side currently needs input (or -1). */
  humanPending(): number {
    for (let i = 0; i < 2; i++) {
      if (!this.sides[i].human) continue;
      const r = this.battle.sides[i].activeRequest;
      if (r && !r.wait && !this.isChoiceDone(i)) return i;
    }
    return -1;
  }

  private isChoiceDone(i: number) {
    const side = this.battle.sides[i];
    return !!side.choice && side.choice.actions.length > 0 && side.isChoiceDone();
  }

  request(i: number): any {
    return this.battle.sides[i].activeRequest;
  }

  /** May this side still use a gimmick of this kind? (none used twice; 1 per battle in singles, 2 in doubles) */
  gimmickOk(side: number, kind: GimmickKind): boolean {
    const used = this.gimmicksUsed[side];
    return !used.includes(kind) && used.length < this.gimmickLimit;
  }

  /** Drops gimmick requests beyond the battle's limit from a choice string. */
  private limitGimmicks(side: number, choice: string): string {
    const used = this.gimmicksUsed[side].slice();
    return choice
      .split(",")
      .map(part =>
        part.replace(/\s+(mega|megax|megay|zmove|terastallize)\b/g, (m, tok: string) => {
          const kind = GIMMICK_TOKEN[tok];
          if (used.includes(kind) || used.length >= this.gimmickLimit) return "";
          used.push(kind);
          return m;
        }),
      )
      .join(",");
  }

  /** Submit a human choice. Returns false if rejected. */
  choose(i: number, choice: string): boolean {
    const ok = this.battle.choose(i === 0 ? "p1" : "p2", this.limitGimmicks(i, choice));
    this.afterChoice();
    return ok;
  }

  /** Makes AI choices for every non-human side that needs one. */
  stepAI(forceAll = false) {
    for (let i = 0; i < 2; i++) {
      if (this.battle.ended) return;
      if (this.sides[i].human && !forceAll) continue;
      const side = this.battle.sides[i];
      const r = side.activeRequest;
      if (!r || r.wait || this.isChoiceDone(i)) continue;
      const choice = (this.doubles ? chooseDoubles : chooseAction)(this.battle, i, {
        skill: this.sides[i].skill,
        gimmick: this.sides[i].gimmick,
        rng: this.rng,
        memory: this.memory[i],
        teraNames: new Set(this.sides[i].team.map((m, j) => (m.teraType ? `m${j}` : "")).filter(Boolean)),
        allowed: new Set(this.gimmickPlan[i].filter(k => this.gimmickOk(i, k))),
      });
      if (!choice) continue;
      if (!this.battle.choose(i === 0 ? "p1" : "p2", this.limitGimmicks(i, choice))) {
        this.battle.choose(i === 0 ? "p1" : "p2", "default");
      }
    }
    this.afterChoice();
  }

  private afterChoice() {
    if (!this.battle.ended && this.battle.turn > MAX_TURNS) this.forceDecision();
    this.scanKOs();
  }

  /** Over-long battles: decide by remaining Pokémon, then HP. */
  private forceDecision() {
    const score = (s: any) => s.pokemon.filter((p: any) => !p.fainted).length * 10 + s.pokemon.reduce((a: number, p: any) => a + (p.fainted ? 0 : p.hp / p.maxhp), 0);
    const a = score(this.battle.sides[0]);
    const b = score(this.battle.sides[1]);
    if (Math.abs(a - b) < 0.01) this.battle.tie();
    else this.battle.win(a > b ? "p1" : "p2");
  }

  private scanKOs() {
    const log: string[] = this.battle.log;
    let lastMover: { side: number; slot: number } | null = null;
    const who = (id: string | undefined) => {
      const m = id?.match(/^p([12])[ab]?: m(\d)/);
      return m ? { side: Number(m[1]) - 1, slot: Number(m[2]) } : null;
    };
    const hpOf = (txt: string | undefined) => (txt ? (txt.startsWith("0") ? 0 : Number(txt.split("/")[0])) : NaN);
    for (let i = this.koScanIndex; i < log.length; i++) {
      const parts = log[i].split("|");
      // a "|split|" line is followed by the exact (owner) line, then the public one in percent: use the exact one
      if (parts[1] === "split") {
        this.splitState = "secret";
        continue;
      }
      if (this.splitState === "skip") {
        this.splitState = "none";
        continue;
      }
      if (this.splitState === "secret") this.splitState = "skip";
      if (parts[1] === "switch" || parts[1] === "drag" || parts[1] === "replace" || parts[1] === "-heal" || parts[1] === "-sethp") {
        const w = who(parts[2]);
        const hp = hpOf(parts[parts[1] === "-heal" || parts[1] === "-sethp" ? 3 : 4]);
        if (w && !Number.isNaN(hp)) this.hpNow[`${w.side}:${w.slot}`] = hp;
      } else if (parts[1] === "-damage") {
        const t = who(parts[2]);
        const hp = hpOf(parts[3]);
        if (t && !Number.isNaN(hp)) {
          const key = `${t.side}:${t.slot}`;
          const lost = Math.max(0, (this.hpNow[key] ?? hp) - hp);
          this.hpNow[key] = hp;
          // direct hits belong to the move's user; Rocky Helmet / Rough Skin etc. name their holder with [of]
          const from = parts.find(x => x.startsWith("[from]"));
          const of = parts.find(x => x.startsWith("[of]"));
          const by = !from ? lastMover : of ? who(of.slice(5)) : null;
          if (by && by.side !== t.side && lost > 0) {
            const d = (this.dmg[by.side][by.slot] ||= { dealt: 0, taken: 0 });
            d.dealt += lost;
            const r = (this.dmg[t.side][t.slot] ||= { dealt: 0, taken: 0 });
            r.taken += lost;
          }
        }
      }
      if (parts[1] === "move") {
        const m = parts[2]?.match(/^p([12])[ab]: m(\d)/);
        if (m) lastMover = { side: Number(m[1]) - 1, slot: Number(m[2]) };
      } else if (parts[1] === "faint") {
        const f = parts[2]?.match(/^p([12])[ab]/);
        if (f && lastMover && Number(f[1]) - 1 !== lastMover.side) {
          const k = this.kos[lastMover.side];
          k[lastMover.slot] = (k[lastMover.slot] || 0) + 1;
        }
      } else if (parts[1] === "turn") lastMover = null;
      const g = parts[1] === "-mega" ? "mega" : parts[1] === "-zpower" ? "z" : parts[1] === "-terastallize" ? "tera" : null;
      if (g) {
        const sm = parts[2]?.match(/^p([12])/);
        if (sm) {
          const used = this.gimmicksUsed[Number(sm[1]) - 1];
          if (!used.includes(g)) used.push(g);
        }
      }
    }
    this.koScanIndex = log.length;
  }

  /** New log lines since last call. */
  drainLog(): string[] {
    const lines = this.battle.log.slice(this.logIndex);
    this.logIndex = this.battle.log.length;
    return lines;
  }

  /** Runs AI for both sides until the battle ends. */
  runToEnd(): MatchResult {
    let guard = 0;
    while (!this.battle.ended && guard++ < 2000) this.stepAI(true);
    if (!this.battle.ended) this.forceDecision();
    return this.result();
  }

  result(): MatchResult {
    const b = this.battle;
    const left: [number, number] = [b.sides[0].pokemonLeft, b.sides[1].pokemonLeft];
    let winner: 0 | 1 | -1 = -1;
    if (b.winner) winner = b.winner === b.sides[0].name && b.sides[0].name !== b.sides[1].name ? 0 : b.winner === b.sides[1].name && b.sides[0].name !== b.sides[1].name ? 1 : left[0] > left[1] ? 0 : 1;
    const after: [Record<string, MonCondition>, Record<string, MonCondition>] = [{}, {}];
    for (let i = 0; i < 2; i++) {
      this.picks[i].forEach(slot => {
        const pk = b.sides[i].pokemon.find((x: any) => x.set.name === `m${slot}`);
        const uid = this.sides[i].team[slot]?.uid;
        if (!pk || !uid) return;
        const pp: Record<string, number> = {};
        for (const ms of pk.baseMoveSlots || pk.moveSlots) if (ms.maxpp - ms.pp > 0) pp[ms.id] = ms.maxpp - ms.pp;
        after[i][uid] = { hp: pk.fainted ? 0 : pk.hp / pk.maxhp, pp };
      });
    }
    return { winner, remaining: left, turns: b.turn, picks: this.picks, kos: this.kos, dmg: this.dmg, after };
  }
}

/** Headless AI vs AI match. */
export function simulateMatch(p1: SideConfig, p2: SideConfig, seed: number | string, opts: BattleOptions = {}): MatchResult {
  const s = new BattleSession({ ...p1, human: false }, { ...p2, human: false }, seed, opts);
  s.start();
  return s.runToEnd();
}
