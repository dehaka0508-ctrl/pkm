// Battle fuzzer: random teams (species, moves, abilities, items, natures, EVs/IVs, Tera types) in singles and
// doubles, one side making random human-style choices (gimmicks, switches, targets). Every finished battle's
// log is then replayed through the battle director against a stand-in scene, to catch log-handling errors.
// FUZZ_BATTLES raises the count.
import { describe, it, expect } from "vitest";
import { BattleSession, type SideConfig } from "../src/battle/engine";
import { BattleDirector } from "../src/render/director";
import { dex } from "../src/data/dex";
import { allLearnableMoves } from "../src/game/moves";
import { catalog, isHoldable } from "../src/game/shop";
import { Rng } from "../src/game/rng";
import type { TeamMember } from "../src/game/types";

const N = Number(process.env.FUZZ_BATTLES || 40);

let speciesPool: string[] | null = null;
function pool() {
  return (speciesPool ||= dex.species
    .all()
    .filter(s => s.exists && s.num > 0 && s.num <= 1025 && !s.battleOnly && !["CAP", "LGPE", "Custom", "Future"].includes(s.isNonstandard as string) && !/Gmax|Totem/.test(s.forme))
    .map(s => s.id));
}
const holdables = () => catalog().filter(i => isHoldable(i.key)).map(i => i.key);
const NATURES = ["Adamant", "Modest", "Jolly", "Timid", "Bold", "Calm", "Impish", "Careful", "Brave", "Quiet", "Serious"];
const TYPES = ["Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];

function randomMon(rng: Rng, i: number): TeamMember {
  const s = dex.species.get(rng.pick(pool()));
  const learn = allLearnableMoves(s.id);
  const moves = rng.shuffle(learn.slice()).slice(0, 4);
  const abilities = Object.values(s.abilities).filter(Boolean) as string[];
  const ev = () => rng.pick([0, 4, 84, 252]);
  const iv = () => rng.int(0, 31);
  return {
    uid: `f${i}`,
    species: s.name,
    level: rng.int(5, 100),
    ability: rng.pick(abilities),
    item: rng.chance(0.8) ? rng.pick(holdables()) : "",
    nature: rng.pick(NATURES),
    moves: moves.length ? moves : ["tackle"],
    evs: { hp: ev(), atk: ev(), def: ev(), spa: ev(), spd: ev(), spe: ev() },
    ivs: { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() },
    gender: "",
    teraType: rng.chance(0.4) ? rng.pick(TYPES) : null,
    shiny: rng.chance(0.05),
  };
}

const TARGETED = new Set(["normal", "any", "adjacentFoe", "adjacentAlly", "adjacentAllyOrSelf"]);

/** A random but well-formed choice for one side, like the battle screen builds them. */
function randomChoice(req: any, rng: Rng, doubles: boolean): string {
  const side = req.side?.pokemon || [];
  const benchFree = (taken: number[]) => side.map((p: any, i: number) => i).filter((i: number) => !side[i].active && !side[i].condition.endsWith(" fnt") && !taken.includes(i));
  if (req.forceSwitch) {
    const taken: number[] = [];
    return req.forceSwitch
      .map((need: boolean) => {
        if (!need) return "pass";
        const free = benchFree(taken);
        if (!free.length) return "pass";
        const i = rng.pick(free);
        taken.push(i);
        return `switch ${i + 1}`;
      })
      .join(", ");
  }
  if (!req.active) return "default";
  const taken: number[] = [];
  let gimmickUsed = false;
  return req.active
    .map((a: any, slot: number) => {
      const me = side[slot];
      if (!a || !me || me.condition.endsWith(" fnt")) return "pass";
      const free = benchFree(taken);
      if (free.length && !a.trapped && rng.chance(0.12)) {
        const i = rng.pick(free);
        taken.push(i);
        return `switch ${i + 1}`;
      }
      const usable = a.moves.map((m: any, i: number) => ({ m, i })).filter(({ m }: any) => !m.disabled && (m.pp === undefined || m.pp > 0));
      if (!usable.length) return "move 1";
      const { m, i } = rng.pick(usable);
      let c = `move ${i + 1}`;
      if (doubles && TARGETED.has(m.target) && a.moves.length > 1) {
        const t = m.target === "adjacentAlly" ? -(2 - slot) : m.target === "adjacentAllyOrSelf" ? -(slot + 1) : rng.pick([1, 2]);
        c += ` ${t}`;
      }
      if (!gimmickUsed && rng.chance(0.3)) {
        if (a.canMegaEvo) (c += " mega"), (gimmickUsed = true);
        else if (a.canTerastallize) (c += " terastallize"), (gimmickUsed = true);
        else if (a.canZMove?.[i]) (c += " zmove"), (gimmickUsed = true);
      }
      return c;
    })
    .join(", ");
}

/** A stand-in for the Phaser scene: every member exists and every call resolves at once. */
function anything(): any {
  const fn: any = function () {
    return proxy;
  };
  const proxy: any = new Proxy(fn, {
    get: (_t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : k === "skipping" ? false : proxy),
    apply: () => Promise.resolve(proxy),
  });
  return proxy;
}

describe("battle fuzz", () => {
  it(`${N} random battles + log replay`, async () => {
    const rng = new Rng("battlefuzz");
    let turns = 0;
    let replayed = 0;
    for (let b = 0; b < N; b++) {
      const doubles = rng.chance(0.4);
      const size = rng.int(doubles ? 4 : 3, 6);
      const team = (k: number) => Array.from({ length: size }, (_, i) => randomMon(rng, k * 10 + i));
      const human = rng.chance(0.6);
      const p1: SideConfig = { name: "A", team: team(1), gimmick: rng.pick(["mega", "z", "tera", "none"]) as any, skill: rng.next(), human };
      const p2: SideConfig = { name: "B", team: team(2), gimmick: rng.pick(["mega", "z", "tera", "none"]) as any, skill: rng.next() };
      const desc = () => `battle ${b} (${doubles ? "doubles" : "singles"}): ${p1.team.map(m => `${m.species}@${m.item}`).join(", ")} vs ${p2.team.map(m => `${m.species}@${m.item}`).join(", ")}`;
      try {
        const s = new BattleSession(p1, p2, `bf${b}`, { doubles });
        if (human) p1.picks = rng.shuffle(p1.team.map((_, i) => i)).slice(0, doubles ? 4 : 3);
        s.start();
        let guard = 0;
        while (!s.ended && guard++ < 600) {
          if (human && s.humanPending() === 0) {
            const req = s.request(0);
            if (!s.choose(0, randomChoice(req, rng, doubles))) s.choose(0, "default");
          }
          s.stepAI(false);
        }
        if (!s.ended) s.runToEnd();
        const r = s.result();
        expect([0, 1, -1]).toContain(r.winner);
        turns += r.turns;
        // replay the log through the director
        const d = new BattleDirector(anything(), s, [{ trainerName: "A", trainerSprite: null, team: p1.team }, { trainerName: "B", trainerSprite: null, team: p2.team }], async () => "__ai__", () => false);
        const errors: string[] = [];
        const warn = console.warn;
        console.warn = (...a: any[]) => errors.push(a.map(String).join(" "));
        try {
          await d.playLines(s.battle.log.slice());
        } finally {
          console.warn = warn;
        }
        if (errors.length) throw new Error(`director failed on: ${errors.slice(0, 3).join(" | ")}`);
        replayed++;
      } catch (e: any) {
        throw new Error(`${desc()}\n${e?.stack || e}`);
      }
    }
    console.log({ battles: N, turns, replayed });
  }, 900000);
});
