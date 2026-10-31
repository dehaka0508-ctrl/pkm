import { useEffect, useState } from "preact/hooks";
import type { GameState } from "../game/state";
import { saveGame } from "../game/state";

export type Screen = { name: "title" } | { name: "new" } | { name: "hub"; tab?: string } | { name: "prep" } | { name: "battle"; mode: "manual" | "watch" };

let game: GameState | null = null;
let screen: Screen = { name: "title" };
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  for (const l of listeners) l();
}

export function getGame(): GameState {
  if (!game) throw new Error("no game");
  return game;
}

export function hasGame() {
  return !!game;
}

export function setGame(g: GameState | null) {
  game = g;
  if (g) saveGame(g);
  emit();
}

/** Mutate game state, then save + rerender. */
export function update(fn: (g: GameState) => void) {
  if (!game) return;
  fn(game);
  saveGame(game);
  emit();
}

export function go(s: Screen) {
  screen = s;
  window.scrollTo(0, 0);
  emit();
}

export function useStore(): { game: GameState | null; screen: Screen; v: number } {
  const [, setV] = useState(0);
  useEffect(() => {
    const l = () => setV(x => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { game, screen, v: version };
}

export function refresh() {
  emit();
}

// one-shot flags between screens
let autoAdvance = false;
export function requestAutoAdvance() {
  autoAdvance = true;
}
export function consumeAutoAdvance(): boolean {
  const v = autoAdvance;
  autoAdvance = false;
  return v;
}

export interface MatchCtx {
  picks: number[];
}
export const matchCtx: MatchCtx = { picks: [] };
