// Draft-only integration. The release/main branch does not include this module.
import { staminaMultiplier } from "../game/stamina";
import type { MonSet } from "../game/types";

const raw = new WeakMap<object, { atk: number; spa: number }>();

/** Apply a fixed entry-time multiplier without altering IVs, EVs, species data or stat stages. */
export function installStaminaStats(pk: any, mon: MonSet) {
  const factor = staminaMultiplier(mon);
  const scale = (n: number) => Math.max(1, Math.floor(n * factor + 1e-8));
  const rememberAndScale = () => {
    raw.set(pk, { atk: pk.storedStats.atk, spa: pk.storedStats.spa });
    pk.storedStats.atk = scale(pk.storedStats.atk);
    pk.storedStats.spa = scale(pk.storedStats.spa);
  };
  pk.maxhp = pk.baseMaxhp = scale(pk.maxhp);
  pk.hp = pk.maxhp; // untreated HP/PP ratios are restored by BattleSession afterwards
  rememberAndScale();
  // Terapagos can change its HP base stat. Preserve the penalty on native HP recalculation too.
  pk.updateMaxHp = () => {
    const newBase = scale(pk.battle.statModify(pk.species.baseStats, pk.set, "hp"));
    if (newBase === pk.baseMaxhp) return;
    pk.baseMaxhp = newBase;
    const newMax = pk.volatiles.dynamax ? 2 * newBase : newBase;
    pk.hp = pk.hp <= 0 ? 0 : Math.max(1, newMax - (pk.maxhp - pk.hp));
    pk.maxhp = newMax;
    if (pk.hp) pk.battle.add("-heal", pk, pk.getHealth, "[silent]");
  };

  // Mega evolution and switching recalculate stored stats. Reapply once to the fresh values.
  const setSpecies = pk.setSpecies.bind(pk);
  pk.setSpecies = (...args: any[]) => {
    const species = setSpecies(...args);
    if (species) rememberAndScale();
    return species;
  };
  // Transform copies stats after setSpecies. It retains the user's own fatigue multiplier.
  const transform = pk.transformInto.bind(pk);
  pk.transformInto = (target: any, effect: any) => {
    const targetStats = raw.get(target) ?? target.storedStats;
    const ok = transform(target, effect);
    if (ok) {
      raw.set(pk, { atk: targetStats.atk, spa: targetStats.spa });
      pk.storedStats.atk = scale(targetStats.atk);
      pk.storedStats.spa = scale(targetStats.spa);
    }
    return ok;
  };
}
