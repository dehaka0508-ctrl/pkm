// Squad screen ordering: the entry (up to 6, in battle order) and the reserve, and swapping places between them.
import type { GameState } from "./state";

/** A place in the squad screen: an entry slot (filled or empty), a reserve Pokémon, or the reserve's empty slot. */
export type Place = { kind: "entry"; i: number } | { kind: "bench"; uid: string } | { kind: "out" };

/** Swaps two places (entry order, entry ↔ reserve, reserve order). Returns an error message or null. */
export function swapPlaces(st: GameState, a: Place, b: Place): string | null {
  const p = st.player;
  const e = p.entry;
  const uidAt = (x: Place) => (x.kind === "entry" ? e[x.i] : x.kind === "bench" ? x.uid : undefined);
  const ua = uidAt(a);
  const ub = uidAt(b);
  if (!ua) return null;
  const inEntry = (u: string | undefined) => !!u && e.includes(u);
  if (b.kind === "out") {
    if (!inEntry(ua)) return null;
    if (e.length <= Math.min(4, p.squad.length)) return "엔트리는 최소 4마리입니다. (지방 컵 더블배틀)";
    p.entry = e.filter(x => x !== ua);
    return null;
  }
  if (!ub) {
    // an empty entry slot: a reserve Pokémon joins the entry, an entry Pokémon moves to the last place
    if (inEntry(ua)) p.entry = [...e.filter(x => x !== ua), ua];
    else {
      if (e.length >= 6) return "엔트리는 최대 6마리입니다.";
      e.push(ua);
    }
    return null;
  }
  if (ua === ub) return null;
  const ia = e.indexOf(ua);
  const ib = e.indexOf(ub);
  if (ia >= 0 && ib >= 0) [e[ia], e[ib]] = [e[ib], e[ia]];
  else if (ia >= 0) e[ia] = ub;
  else if (ib >= 0) e[ib] = ua;
  // the reserve keeps the squad's order: swap the two in the squad list as well
  const sa = p.squad.findIndex(m => m.uid === ua);
  const sb = p.squad.findIndex(m => m.uid === ub);
  if (sa >= 0 && sb >= 0) [p.squad[sa], p.squad[sb]] = [p.squad[sb], p.squad[sa]];
  return null;
}
