import { koSpecies } from "../data/dex";
import type { GoldenMasterBallAward } from "./golden-master-ball";
import { displayName, displaySprite, type GameState } from "./state";
import { AWARD_KO, type Award } from "./stats";
import type { Tie } from "./tie";

interface TrainerPlace {
  rank: number;
  name: string;
  sprite: string;
}

export type Ceremony =
  | { kind: "team"; competition: string; showPodium: boolean; places: TrainerPlace[] }
  | { kind: "individual"; competition: string; prize: string; name: string; species: string; detail: string };

function enqueue(g: GameState, ceremony: Ceremony) {
  (g.ceremonies ??= []).push(ceremony);
}

export function queueTeamCeremony(g: GameState, competition: string, ranks: (string | undefined)[], entered: boolean) {
  if (!entered || !ranks[0]) return;
  enqueue(g, {
    kind: "team", competition, showPodium: ranks.includes(g.player.slotId),
    places: ranks.flatMap((id, index) => id ? [{ rank: index + 1, name: displayName(g, id), sprite: displaySprite(g, id) }] : []),
  });
}

/** Bronze is present only when its own deciding match was completed. */
export function podiumRanks(final: Tie | undefined | null, bronze?: Tie | null) {
  if (!final?.winner) return [];
  return [final.winner, final.winner === final.a ? final.b : final.a, bronze?.winner];
}

export function queueIndividualCeremonies(g: GameState, competition: string, awards: Award[]) {
  for (const award of awards) {
    if (award.owner !== g.player.slotId) continue;
    const mon = g.player.squad.find(m => m.uid === award.uid);
    enqueue(g, {
      kind: "individual", competition, prize: AWARD_KO[award.kind],
      name: mon?.nickname || koSpecies(award.species), species: mon?.species ?? award.species,
      detail: `${award.value.toLocaleString()} ${award.kind === "k" ? "KO" : "HP"}`,
    });
  }
}

export function queueGoldenCeremony(g: GameState, competition: string, prize: string, award: GoldenMasterBallAward) {
  if (award.owner !== g.player.slotId) return;
  enqueue(g, {
    kind: "individual", competition, prize, name: award.pokemonName, species: award.species,
    detail: `${award.appearances}경기 · ${award.kos}KO`,
  });
}
