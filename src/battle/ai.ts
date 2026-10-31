// Battle AI: team preview picks and per-turn decisions for simulator sides.
import { dex, toID } from "../data/dex";
import type { Gimmick, MonSet } from "../game/types";
import { Rng } from "../game/rng";
import { battlerFromPokemon, battlerFromSet, bestHit, estDamage, accuracyOf, matchup, speedOf, type Battler } from "./calc";

export interface AiMemory {
  lastSwitchTurn: number;
}

export interface AiOptions {
  skill: number; // 0..1
  gimmick: Gimmick;
  rng: Rng;
  teraNames?: Set<string>; // battle names allowed to terastallize
  memory: AiMemory;
}

/** Choose 3 of 6 (returns 0-based indices; first is the lead). */
export function pickThree(own: MonSet[], opp: MonSet[], skill: number, rng: Rng, size = 3): number[] {
  if (own.length <= size) {
    const idx = own.map((_, i) => i);
    return orderLead(idx, own, opp);
  }
  const ob = own.map(battlerFromSet);
  const pb = opp.map(battlerFromSet);
  const noise = (1 - skill) * 0.6;
  const value = ob.map((b, i) => {
    let v = 0;
    for (const o of pb) v += matchup(b, o);
    v /= Math.max(1, pb.length);
    v += dex.species.get(own[i].species).bst / 3000;
    v += own[i].level / 200;
    return v + (rng.next() - 0.5) * noise;
  });
  const chosen = value
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, size)
    .map(x => x[1]);
  return orderLead(chosen, own, opp);
}

function orderLead(idx: number[], own: MonSet[], opp: MonSet[]): number[] {
  const pb = opp.map(battlerFromSet);
  let best = idx[0];
  let bestV = -Infinity;
  for (const i of idx) {
    const b = battlerFromSet(own[i]);
    let v = 0;
    for (const o of pb) v += matchup(b, o);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return [best, ...idx.filter(i => i !== best)];
}

const SETUP_MOVES = new Set([
  "swordsdance", "dragondance", "bulkup", "shiftgear", "coil", "victorydance", "tidyup", "howl", "honeclaws",
  "nastyplot", "calmmind", "quiverdance", "tailglow", "shellsmash", "growth", "workup", "agility", "rockpolish",
  "autotomize", "irondefense", "amnesia", "cosmicpower", "curse", "bellydrum", "geomancy", "clangoroussoul", "noretreat",
]);
const RECOVER = new Set(["recover", "roost", "slackoff", "softboiled", "milkdrink", "moonlight", "morningsun", "synthesis", "shoreup", "strengthsap", "healorder", "rest", "junglehealing", "lifedew"]);
const SELF_KO = new Set(["explosion", "selfdestruct", "mistyexplosion", "finalgambit", "memento", "healingwish", "lunardance"]);
const HAZARDS: Record<string, string> = { stealthrock: "stealthrock", spikes: "spikes", toxicspikes: "toxicspikes", stickyweb: "stickyweb" };

function canStatus(foe: any, status: string, moveId: string): boolean {
  if (foe.status) return false;
  const types: string[] = foe.getTypes();
  const ab = foe.getAbility().id;
  if (ab === "goodasgold" || ab === "magicbounce" || ab === "comatose" || ab === "purifyingsalt") return false;
  const m = dex.moves.get(moveId);
  if (m.flags.powder && (types.includes("Grass") || ab === "overcoat" || foe.item === "safetygoggles")) return false;
  if (!dex.getImmunity(m.type, types) && m.id === "thunderwave") return false;
  switch (status) {
    case "par": return !types.includes("Electric") && ab !== "limber";
    case "brn": return !types.includes("Fire") && ab !== "waterveil" && ab !== "waterbubble";
    case "tox": case "psn": return !types.includes("Poison") && !types.includes("Steel") && ab !== "immunity";
    case "slp": return !["insomnia", "vitalspirit", "sweetveil"].includes(ab);
    case "frz": return !types.includes("Ice");
  }
  return true;
}

/** Returns a Showdown choice string for the side, or "" if nothing is needed. */
export function chooseAction(battle: any, sideIdx: number, opts: AiOptions): string {
  const side = battle.sides[sideIdx];
  const req = side.activeRequest;
  if (!req || req.wait) return "";
  const foeSide = side.foe;
  const foe = foeSide.active[0];
  const weather = battle.field.weather || "";
  const bench = side.pokemon
    .map((p: any, i: number) => ({ p, i }))
    .filter(({ p }: any) => !p.fainted && !p.isActive);

  if (req.forceSwitch) {
    if (!bench.length) return "pass";
    return `switch ${bestSwitch(bench, foe, opts).i + 1}`;
  }

  const me = side.active[0];
  const act = req.active?.[0];
  if (!me || !act) return "default";
  const mb = battlerFromPokemon(me);
  const fb = foe && !foe.fainted ? battlerFromPokemon(foe) : null;
  const rng = opts.rng;
  const skill = opts.skill;

  const foeBest = fb ? bestHit(fb, mb, weather) : null;
  const foeBestVsMe = foeBest ? foeBest.frac : 0;
  const iAmFaster = fb ? speedOf(mb) >= speedOf(fb) : true;
  const hpFrac = mb.hp / mb.maxhp;

  const scored: { idx: number; score: number; z?: boolean }[] = [];
  act.moves.forEach((mv: any, i: number) => {
    if (mv.disabled || mv.pp === 0) return;
    const id = toID(mv.id);
    const m = dex.moves.get(id);
    let score = 0;
    if (!fb) score = 0.1;
    else if ((id === "counter" || id === "mirrorcoat" || id === "metalburst") && foeBest) {
      // reflect damage: worth it when the foe's best hit matches the category and we survive it
      const fm = dex.moves.get(foeBest.move);
      const matches = id === "metalburst" ? fm.category !== "Status" : fm.category === (id === "counter" ? "Physical" : "Special");
      if (matches && foeBestVsMe < 0.95 && foeBestVsMe > 0) {
        const back = (id === "metalburst" ? 1.5 : 2) * foeBestVsMe * mb.hp;
        score = Math.min(1, back / Math.max(1, fb.hp)) * 0.8 + (back >= fb.hp ? 0.4 : 0);
      } else score = 0.02;
    } else if (m.category !== "Status") {
      const dmg = estDamage(mb, fb, id, weather);
      const acc = accuracyOf(id);
      const frac = dmg / Math.max(1, fb.hp);
      score = Math.min(frac, 1) * acc;
      if (dmg * acc >= fb.hp * 0.95) score += 0.6;
      if (m.priority > 0 && !iAmFaster && dmg >= fb.hp) score += 0.5;
      if (m.priority > 0 && foeBestVsMe >= 1 && !iAmFaster) score += 0.25;
      if (SELF_KO.has(id)) score = hpFrac < 0.3 ? score : score * 0.15;
      if ((m.recoil || m.mindBlownRecoil) && hpFrac < 0.3) score *= 0.8;
      if (m.self?.boosts && Object.values(m.self.boosts).some((v: any) => v < 0)) score *= 0.95;
      if (m.flags.charge && !(me.item === "powerherb")) score *= 0.5;
      if (m.flags.recharge) score *= frac >= 1 ? 1 : 0.4;
      if (id === "fakeout") score = me.activeTurns <= 0 ? score + 0.3 : 0;
      // Z-move upgrade
      if (opts.gimmick === "z" && act.canZMove?.[i] && m.zMove?.basePower && m.basePower) {
        const z = (dmg * (m.zMove.basePower / m.basePower)) / Math.max(1, fb.hp);
        if (z > 0.6 && z > frac) scored.push({ idx: i, score: Math.min(z, 1) + (z >= 1 ? 0.65 : 0.1), z: true });
      }
    } else {
      const boosts = m.boosts || (m.self && m.self.boosts);
      if (SETUP_MOVES.has(id)) {
        const cur = Math.max(me.boosts.atk || 0, me.boosts.spa || 0, me.boosts.def || 0);
        score = hpFrac > 0.7 && foeBestVsMe < 0.45 && cur < 2 ? 0.55 : 0.04;
        if (id === "bellydrum") score = hpFrac > 0.8 && foeBestVsMe < 0.35 && !me.boosts.atk ? 0.6 : 0;
      } else if (RECOVER.has(id)) {
        score = hpFrac < 0.5 && foeBestVsMe < 0.55 ? 0.65 : 0.02;
        if (id === "rest" && me.status) score += 0.2;
      } else if (m.status && fb) {
        const ok = canStatus(foe, m.status, id);
        score = ok ? ({ slp: 0.58, brn: fb.stats.atk > fb.stats.spa ? 0.5 : 0.3, par: iAmFaster ? 0.32 : 0.45, tox: 0.38, psn: 0.25 } as Record<string, number>)[m.status] ?? 0.3 : 0;
        score *= accuracyOf(id);
      } else if (HAZARDS[id]) {
        const set = !!foeSide.sideConditions[HAZARDS[id]];
        score = !set && foeSide.pokemonLeft > 1 ? 0.33 : 0;
      } else if (id === "protect" || id === "detect" || id === "kingsshield" || id === "spikyshield" || id === "banefulbunker" || id === "silktrap") {
        score = me.volatiles.stall ? 0 : 0.08;
      } else if (id === "destinybond") {
        score = !me.volatiles.destinybond && iAmFaster && foeBestVsMe >= 1 ? 0.75 : hpFrac < 0.3 && iAmFaster ? 0.5 : 0.03;
      } else if (id === "encore") {
        const last = foe.lastMove;
        score = last && last.category === "Status" && !foe.volatiles.encore ? 0.55 : 0.05;
      } else if (id === "leechseed") {
        score = fb && !fb.types.includes("Grass") && !foe.volatiles.leechseed ? 0.3 : 0;
      } else if (id === "substitute") {
        score = hpFrac > 0.5 && !me.volatiles.substitute ? 0.2 : 0;
      } else if (boosts && Object.values(boosts).some((v: any) => v < 0)) {
        score = 0.12; // stat-lowering on the foe
      } else {
        score = 0.12;
      }
    }
    scored.push({ idx: i, score });
  });

  if (!scored.length) return "move 1";
  const noise = (1 - skill) * 0.8;
  for (const s of scored) s.score *= 1 + (rng.next() - 0.5) * noise;
  scored.sort((a, b) => b.score - a.score);
  let pick = scored[0];
  if (rng.chance((1 - skill) * 0.2)) pick = rng.pick(scored);

  // switching
  const trapped = act.trapped || act.maybeTrapped;
  if (fb && !trapped && bench.length && skill >= 0.55 && battle.turn - opts.memory.lastSwitchTurn > 1) {
    const cur = matchup(mb, fb);
    const alt = bestSwitch(bench, foe, opts);
    if (pick.score < 0.3 && foeBestVsMe > 0.5 && alt.v > cur + 0.6 && rng.chance(skill)) {
      opts.memory.lastSwitchTurn = battle.turn;
      return `switch ${alt.i + 1}`;
    }
  }

  let choice = `move ${pick.idx + 1}`;
  if (pick.z) choice += " zmove";
  else if (opts.gimmick === "mega" && act.canMegaEvo) choice += " mega";
  else if (opts.gimmick === "mega" && act.canMegaEvoX) choice += " megax";
  else if (opts.gimmick === "mega" && act.canMegaEvoY) choice += " megay";
  else if (opts.gimmick === "tera" && act.canTerastallize && (!opts.teraNames || opts.teraNames.has(me.name))) {
    if (pick.score >= 0.25 || hpFrac < 0.6 || foeSide.pokemonLeft <= 1) choice += " terastallize";
  }
  return choice;
}

function bestSwitch(bench: { p: any; i: number }[], foe: any, opts: AiOptions): { i: number; v: number } {
  let best = { i: bench[0].i, v: -Infinity };
  const fb: Battler | null = foe && !foe.fainted ? battlerFromPokemon(foe) : null;
  for (const { p, i } of bench) {
    const b = battlerFromPokemon(p);
    let v = fb ? matchup(b, fb) : 0;
    v += (b.hp / b.maxhp) * 0.3;
    v += (opts.rng.next() - 0.5) * (1 - opts.skill) * 0.5;
    if (v > best.v) best = { i, v };
  }
  return best;
}
