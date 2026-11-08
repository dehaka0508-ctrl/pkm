// Trainer profiles: how a trainer spends money (by role, one step either way for some trainers).
import { hashStr } from "../rng";
import { trainerById } from "../lineups";
import type { TrainerDef } from "../types";
import type { SpendingStyle, TrainerProfile } from "./models";

const STYLE_BY_ROLE: Record<string, SpendingStyle> = {
  챔피언: "aggressive", 보스: "aggressive", 사천왕: "balanced", 관장: "balanced", 라이벌: "balanced", 주인공: "balanced", 박사: "frugal", 기타: "frugal", 트레이너: "frugal",
};
const STYLES: SpendingStyle[] = ["frugal", "balanced", "aggressive"];

const cache = new Map<string, TrainerProfile>();

/** A trainer's profile, worked out from its role (same every time). */
export function profileOf(t: TrainerDef | string): TrainerProfile {
  const def = typeof t === "string" ? trainerById(t) : t;
  if (!def) return { id: String(t), style: "balanced" };
  const hit = cache.get(def.id);
  if (hit) return hit;
  const base = STYLES.indexOf(STYLE_BY_ROLE[def.role] ?? "balanced");
  const shift = [0, 0, 0, 1, -1][hashStr(def.id) % 5];
  const p: TrainerProfile = { id: def.id, style: STYLES[Math.max(0, Math.min(2, base + shift))] };
  cache.set(def.id, p);
  return p;
}
