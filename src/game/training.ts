// Leveling, EV training and evolution for player-owned Pokémon.
import { nickOr, dex, koSpecies, koMove } from "../data/dex";
import type { OwnedMon, StatId } from "./types";
import { STATS, STAT_KO } from "./types";
import { movesLearnedAt } from "./moves";
import { becomeParadox, isParadoxTarget } from "./fresh";

export const LEVEL_CAP = 100;
export const EV_STAT_CAP = 252;
export const EV_TOTAL_CAP = 510;

/** EXP needed to go from `level` to `level + 1`. */
export const expToNext = (level: number) => 10 + 4 * level;

/** Total EXP at the start of `level` (level 1 = 0). */
export function expForLevel(level: number): number {
  let t = 0;
  for (let l = 1; l < level; l++) t += expToNext(l);
  return t;
}

export function levelProgress(m: OwnedMon): number {
  if (m.level >= LEVEL_CAP) return 1;
  return (m.exp - expForLevel(m.level)) / expToNext(m.level);
}

export const PLAN_KO: Record<string, string> = {
  level: "레벨 훈련",
  rest: "휴식",
  hp: "HP 강화",
  atk: "공격 강화",
  def: "방어 강화",
  spa: "특공 강화",
  spd: "특방 강화",
  spe: "스피드 강화",
  "-hp": "HP 노력치 감소",
  "-atk": "공격 노력치 감소",
  "-def": "방어 노력치 감소",
  "-spa": "특공 노력치 감소",
  "-spd": "특방 노력치 감소",
  "-spe": "스피드 노력치 감소",
};

export interface TrainResult {
  logs: string[];
}

/** Weekly training: returns log lines. */
export function trainWeek(m: OwnedMon, plan: string, facility: number, logs: string[]) {
  if (plan === "rest") {
    m.fatigue = Math.max(0, (m.fatigue || 0) - 3);
    return;
  }
  const baseExp = 100 + 25 * facility;
  if (plan === "level") gainExp(m, Math.round(baseExp * 1.6), logs);
  else {
    gainExp(m, Math.round(baseExp * 0.5), logs);
    const lower = plan.startsWith("-");
    const stat = (lower ? plan.slice(1) : plan) as StatId;
    if (lower && STATS.includes(stat)) {
      m.evs[stat] = Math.max(0, m.evs[stat] - (8 + facility * 3) * 2);
    } else if (STATS.includes(stat)) {
      const total = STATS.reduce((a, k) => a + m.evs[k], 0);
      const add = Math.min(8 + facility * 3, EV_STAT_CAP - m.evs[stat], EV_TOTAL_CAP - total);
      if (add > 0) m.evs[stat] += add;
    }
  }
}

/** Adds EXP and handles level ups and new moves (evolving is the manager's call). */
export function gainExp(m: OwnedMon, amount: number, logs: string[]) {
  if (m.level >= LEVEL_CAP) return;
  m.exp += amount;
  while (m.level < LEVEL_CAP && m.exp >= expForLevel(m.level + 1)) {
    m.level++;
    const name = nickOr(m);
    logs.push(`${name} Lv.${m.level} 달성`);
    for (const mv of movesLearnedAt(m.species, m.level)) {
      if (m.moves.includes(mv)) continue;
      if (m.moves.length < 4) {
        m.moves.push(mv);
        logs.push(`${name}: ${koMove(mv)}을(를) 배웠다`);
      } else {
        logs.push(`${name}: ${koMove(mv)}을(를) 배울 수 있다 (기술 편집에서 교체)`);
      }
    }
    // level evolutions wait for the manager: [진화] in the squad (the next day summary says when one is possible)
  }
  if (m.level >= LEVEL_CAP) m.exp = expForLevel(LEVEL_CAP);
}

export function evolve(m: OwnedMon, target: string) {
  const t = dex.species.get(target);
  // 새출발 올림박사 / 투로박사: the modern relative becomes its Paradox form
  if (isParadoxTarget(t.name)) return becomeParadox(m, t.name);
  const oldAbilities = Object.values(dex.species.get(m.species).abilities);
  const idx = Math.max(0, oldAbilities.indexOf(m.ability));
  const newAbilities = Object.values(t.abilities);
  m.species = t.name;
  m.ability = (newAbilities[idx] as string) || (newAbilities[0] as string);
  for (const mv of movesLearnedAt(t.id, 0).concat(movesLearnedAt(t.id, 1))) {
    if (!m.moves.includes(mv) && m.moves.length < 4) m.moves.push(mv);
  }
}

export function evText(m: OwnedMon): string {
  return STATS.filter(k => m.evs[k] > 0).map(k => `${STAT_KO[k]} ${m.evs[k]}`).join(" · ") || "없음";
}

/** Longest nickname (the trainer name's limit). */
export const NICKNAME_MAX = 10;
/** Names a Pokémon; an empty name gives it back its species name. */
export function setNickname(m: { nickname?: string }, name: string) {
  const v = [...name.trim()].slice(0, NICKNAME_MAX).join("");
  if (v) m.nickname = v;
  else delete m.nickname;
}
