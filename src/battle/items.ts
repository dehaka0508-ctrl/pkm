import type { Battle, Pokemon, ActiveMove } from "@pkmn/sim";

/** League rule: Chilan replaces the separate type-resistance berries. */
export function applyLeagueItems(battle: Battle) {
  const berry = battle.dex.items.get("Chilan Berry");
  Object.assign(berry, { onSourceModifyDamage(this: Battle, damage: number, source: Pokemon, target: Pokemon, move: ActiveMove) {
    if (target.getMoveHitData(move).typeMod <= 0) return;
    const hitsSub = target.volatiles.substitute && !move.flags.bypasssub && !(move.infiltrates && this.gen >= 6);
    if (hitsSub || !target.eatItem()) return;
    this.add("-enditem", target, this.effect, "[weaken]");
    return this.chainModify(0.5);
  } });
}
