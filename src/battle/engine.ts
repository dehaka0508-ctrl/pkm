// Wraps the Showdown simulator into a league match: 6 shown, 3 picked, Lv50 singles.
import { Battle } from "@pkmn/sim";
import { dex } from "../data/dex";
import type { Gimmick, TeamMember } from "../game/types";
import { Rng } from "../game/rng";
import { chooseAction, pickThree, type AiMemory } from "./ai";

export const FORMAT = "gen9nationaldexag@@@Picked Team Size = 3";
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

export interface MatchResult {
  winner: 0 | 1 | -1;
  remaining: [number, number];
  turns: number;
  picks: [number[], number[]];
  /** per side: team index -> KOs scored */
  kos: [Record<number, number>, Record<number, number>];
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
    level: m.level,
    gender: m.gender || "",
    shiny: !!m.shiny,
    teraType: m.teraType || s.types[0],
  };
}

export class BattleSession {
  battle: any;
  sides: [SideConfig, SideConfig];
  rng: Rng;
  private logIndex = 0;
  private memory: [AiMemory, AiMemory] = [{ lastSwitchTurn: -9 }, { lastSwitchTurn: -9 }];
  picks: [number[], number[]] = [[], []];
  kos: [Record<number, number>, Record<number, number>] = [{}, {}];
  private koScanIndex = 0;

  constructor(p1: SideConfig, p2: SideConfig, seed: number | string) {
    this.sides = [p1, p2];
    this.rng = new Rng(seed);
    this.battle = new Battle({ formatid: FORMAT as any, seed: this.rng.seed4() as any });
    this.battle.setPlayer("p1", { name: p1.name || "P1", team: p1.team.map(toShowdownSet) as any });
    this.battle.setPlayer("p2", { name: p2.name || "P2", team: p2.team.map(toShowdownSet) as any });
  }

  /** Resolves team preview. Human sides must have `picks` set before calling. */
  start() {
    for (let i = 0; i < 2; i++) {
      const cfg = this.sides[i];
      const other = this.sides[1 - i];
      let picks = cfg.picks;
      if (!picks || picks.length === 0) picks = pickThree(cfg.team, other.team, cfg.skill, this.rng);
      const size = Math.min(3, cfg.team.length);
      picks = picks.slice(0, size);
      // pad with remaining in order so Showdown gets a full ordering
      const order = [...picks, ...cfg.team.map((_, j) => j).filter(j => !picks!.includes(j))];
      this.picks[i] = picks;
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

  /** Submit a human choice. Returns false if rejected. */
  choose(i: number, choice: string): boolean {
    const ok = this.battle.choose(i === 0 ? "p1" : "p2", choice);
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
      const choice = chooseAction(this.battle, i, {
        skill: this.sides[i].skill,
        gimmick: this.sides[i].gimmick,
        rng: this.rng,
        memory: this.memory[i],
        teraNames: new Set(this.sides[i].team.map((m, j) => (m.teraType ? `m${j}` : "")).filter(Boolean)),
      });
      if (!choice) continue;
      if (!this.battle.choose(i === 0 ? "p1" : "p2", choice)) {
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
    for (let i = this.koScanIndex; i < log.length; i++) {
      const parts = log[i].split("|");
      if (parts[1] === "move") {
        const m = parts[2]?.match(/^p([12])a: m(\d)/);
        if (m) lastMover = { side: Number(m[1]) - 1, slot: Number(m[2]) };
      } else if (parts[1] === "faint") {
        const f = parts[2]?.match(/^p([12])a/);
        if (f && lastMover && Number(f[1]) - 1 !== lastMover.side) {
          const k = this.kos[lastMover.side];
          k[lastMover.slot] = (k[lastMover.slot] || 0) + 1;
        }
      } else if (parts[1] === "turn") lastMover = null;
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
    return { winner, remaining: left, turns: b.turn, picks: this.picks, kos: this.kos };
  }
}

/** Headless AI vs AI match. */
export function simulateMatch(p1: SideConfig, p2: SideConfig, seed: number | string): MatchResult {
  const s = new BattleSession({ ...p1, human: false }, { ...p2, human: false }, seed);
  s.start();
  return s.runToEnd();
}
