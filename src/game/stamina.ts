import type { GameState } from "./state";
import type { MonCondition, TeamMember } from "./types";
import type { MatchResult } from "../battle/engine";
import { josa, monName } from "../data/dex";

export const STAMINA_MAX = 100;
export const STAMINA_MIN = 50;
export const staminaOf = (m: { stamina?: number }) => Math.max(0, Math.min(STAMINA_MAX, m.stamina ?? STAMINA_MAX));
export const canField = (m: { stamina?: number }) => staminaOf(m) >= STAMINA_MIN;
export const staminaMultiplier = (m: { stamina?: number }) => (100 - 5 * Math.max(0, Math.ceil((90 - staminaOf(m)) / 10))) / 100;
export const exhaustedMessage = (m: { species: string; nickname?: string }) => `${josa(monName(m), "은는")} 매우 지쳐 있다!`;

/** Completed 10% HP-loss bands, with a minimum of one; fainting costs fifteen. */
export function staminaCost(hp: number): number {
  if (hp <= 0) return 15;
  return Math.max(1, Math.floor((1 - Math.min(1, hp)) * 10 + 1e-8));
}

export function spendStamina(m: TeamMember, day: number, condition: MonCondition) {
  m.stamina = Math.max(0, staminaOf(m) - staminaCost(condition.hp));
  m.lastPlayedDay = day;
}

/** Called before incrementing the date: playing today prevents today's recovery. */
export function recoverStamina(state: GameState) {
  for (const m of state.player.squad) {
    if (m.lastPlayedDay !== state.day) m.stamina = Math.min(STAMINA_MAX, staminaOf(m) + 1);
  }
  for (const m of Object.values(state.npcStamina ?? {})) {
    if (m.lastPlayedDay !== state.day) m.stamina = Math.min(STAMINA_MAX, staminaOf(m) + 1);
  }
}

/** Results carry actual field appearances, not merely the team-preview selections. */
export function applyStamina(state: GameState, team: TeamMember[], result: MatchResult, side: 0 | 1, npc = false) {
  const appeared = new Set(result.appeared?.[side] ?? []);
  for (const m of team) {
    if (!appeared.has(m.uid)) continue;
    const cond = result.after?.[side]?.[m.uid];
    if (!cond) continue;
    if (npc) {
      const record = ((state.npcStamina ??= {})[m.uid] ??= { stamina: STAMINA_MAX });
      record.stamina = Math.max(0, staminaOf(record) - staminaCost(cond.hp));
      record.lastPlayedDay = state.day;
    } else spendStamina(m, state.day, cond);
  }
}
