// Move PP. A move starts at its base PP; 포인트업 adds a fifth of it (up to three times), 포인트맥스 all three.
import { toID } from "@pkmn/sim";
import { dex } from "../data/dex";

/** PP Ups a Pokémon has on a move (0–3). */
export function movePPUps(m: { ppUps?: Record<string, number> } | undefined, moveId: string): number {
  const id = toID(moveId);
  const ups = m?.ppUps || {};
  // typed Hidden Power ("hiddenpowerfire") is "hiddenpower" inside the simulator
  const n = ups[id] ?? (id === "hiddenpower" ? Object.entries(ups).find(([k]) => k.startsWith("hiddenpower"))?.[1] : undefined) ?? 0;
  return Math.max(0, Math.min(3, n));
}

/** A move's PP with that many PP Ups (base PP with none; ×1.6 with three). */
export function movePP(moveId: string, ups = 0): number {
  const mv = dex.moves.get(moveId);
  if (!mv.exists) return 0;
  return mv.noPPBoosts ? mv.pp : Math.floor((mv.pp * (5 + ups)) / 5);
}
