// Treatment after battles: lost HP% × the Pokémon's weekly food + ₽50 per PP used.
// A club that cannot pay sends its Pokémon out with the HP and PP they have left.
import { dex, koSpecies } from "../data/dex";
import { foodCost } from "./finance";
import type { GameState } from "./state";
import { pushMsg } from "./state";
import type { MonCondition, OwnedMon } from "./types";

export const PP_FEE = 50;
/** Nurse Pokémon in the squad halve every bill (Chansey line, Audino, Jigglypuff line, Comfey, Indeedee). */
export const NURSES = ["happiny", "chansey", "blissey", "audino", "igglybuff", "jigglypuff", "wigglytuff", "comfey", "indeedee", "indeedeef"];

export function hasNurse(state: GameState): boolean {
  return state.player.squad.some(m => NURSES.includes(dex.species.get(m.species).id));
}

export function treatmentCost(state: GameState, m: OwnedMon, cond: MonCondition | undefined = m.cond): number {
  if (!cond) return 0;
  const pp = Object.values(cond.pp).reduce((a, b) => a + b, 0);
  const raw = (1 - cond.hp) * foodCost(m) + pp * PP_FEE;
  return Math.round(raw * (hasNurse(state) ? 0.5 : 1));
}

/** Pays for every Pokémon the club can afford, entry order first. Returns what was spent and who is still hurt. */
export function treatSquad(state: GameState, quiet = false): { paid: number; healed: string[]; left: string[] } {
  const p = state.player;
  const order = [...p.entry.map(u => p.squad.find(m => m.uid === u)).filter(Boolean), ...p.squad.filter(m => !p.entry.includes(m.uid))] as OwnedMon[];
  let paid = 0;
  const healed: string[] = [];
  const left: string[] = [];
  for (const m of order) {
    if (!m.cond) continue;
    const cost = treatmentCost(state, m);
    if (p.money >= cost) {
      p.money -= cost;
      paid += cost;
      delete m.cond;
      healed.push(m.nickname || koSpecies(m.species));
    } else left.push(m.nickname || koSpecies(m.species));
  }
  if ((!quiet && (healed.length || left.length)) || (quiet && healed.length)) {
    const lines = [];
    if (healed.length) lines.push(`치료 완료: ${healed.join(", ")} (₽${paid.toLocaleString()}${hasNurse(state) ? ", 간호사 포켓몬 덕분에 반값" : ""})`);
    if (left.length) lines.push(`돈이 모자라 치료하지 못함: ${left.join(", ")}\n남은 체력과 PP 그대로 다음 경기에 나섭니다.`);
    pushMsg(state, "money", left.length ? "치료비 부족" : "포켓몬 치료", lines.join("\n"));
  }
  return { paid, healed, left };
}

/** After a player battle: record the damage, then treat whoever the club can pay for. */
export function afterBattle(state: GameState, after: Record<string, MonCondition> | undefined) {
  if (!after) return;
  for (const [uid, c] of Object.entries(after)) {
    const m = state.player.squad.find(x => x.uid === uid);
    if (!m) continue;
    const used = Object.values(c.pp).some(v => v > 0);
    m.cond = c.hp >= 1 && !used ? undefined : { hp: c.hp, pp: c.pp };
  }
  treatSquad(state);
}

/** Short label for the UI ("HP 45%", "기절"). */
export function condLabel(m: { cond?: MonCondition }): string | null {
  if (!m.cond) return null;
  if (m.cond.hp <= 0) return "기절";
  return `HP ${Math.round(m.cond.hp * 100)}%`;
}
