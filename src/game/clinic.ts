// Treatment after battles: lost HP% × the Pokémon's weekly food + ₽50 per PP used.
// A club that cannot pay sends its Pokémon out with the HP and PP they have left.
import { dex, koSpecies } from "../data/dex";
import { foodCost, weeklyCosts } from "./finance";
import type { GameState } from "./state";
import { pushMsg } from "./state";
import type { MonCondition, OwnedMon } from "./types";

export const PP_FEE = 50;
/** Nurse Pokémon in the squad halve every bill (Happiny/Chansey/Blissey, Audino, Igglybuff/Jigglypuff/Wigglytuff, Comfey, Indeedee). */
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

export interface TreatResult {
  paid: number;
  healed: string[];
  left: string[];
}

const nameOf = (m: OwnedMon) => m.nickname || koSpecies(m.species);

/**
 * Pays for every hurt Pokémon the club can afford, entry order first.
 * `reserve`: money to keep back (the daily retry keeps this week's food and upkeep).
 */
export function treatSquad(state: GameState, reserve = 0): TreatResult {
  const p = state.player;
  const order = [...p.entry.map(u => p.squad.find(m => m.uid === u)).filter(Boolean), ...p.squad.filter(m => !p.entry.includes(m.uid))] as OwnedMon[];
  const out: TreatResult = { paid: 0, healed: [], left: [] };
  for (const m of order) {
    if (!m.cond) continue;
    const cost = treatmentCost(state, m);
    if (p.money - cost >= reserve) {
      p.money -= cost;
      out.paid += cost;
      delete m.cond;
      out.healed.push(nameOf(m));
    } else out.left.push(nameOf(m));
  }
  return out;
}

/** Lines describing a treatment for the match report. */
export function treatLines(state: GameState, r: TreatResult): string[] {
  const lines: string[] = [];
  if (r.healed.length) lines.push(`치료비 ₽${r.paid.toLocaleString()}: ${r.healed.join(", ")}${hasNurse(state) ? " (간호사 포켓몬 덕분에 반값)" : ""}`);
  if (r.left.length) lines.push(`돈이 모자라 치료 못 함: ${r.left.join(", ")} — 남은 체력과 PP 그대로 다음 경기에 나섭니다.`);
  return lines;
}

/** After a player battle: record the damage, then treat whoever the club can pay for. */
export function afterBattle(state: GameState, after: Record<string, MonCondition> | undefined): TreatResult {
  if (after) {
    for (const [uid, c] of Object.entries(after)) {
      const m = state.player.squad.find(x => x.uid === uid);
      if (!m) continue;
      const used = Object.values(c.pp).some(v => v > 0);
      if (c.hp >= 1 && !used) delete m.cond;
      else m.cond = { hp: c.hp, pp: c.pp };
    }
  }
  return treatSquad(state); // reported in the match message (season.recordPlayerGame)
}

/** Daily: treat leftover injuries once money comes in, keeping this week's food and upkeep aside. */
export function treatDaily(state: GameState) {
  if (!state.player.squad.some(m => m.cond)) return;
  const r = treatSquad(state, weeklyCosts(state).total);
  if (r.healed.length) pushMsg(state, "money", "포켓몬 치료", treatLines(state, r).join("\n"));
}

/** Short label for the UI ("HP 45%", "기절", "PP 소모"). */
export function condLabel(m: { cond?: MonCondition }): string | null {
  if (!m.cond) return null;
  if (m.cond.hp <= 0) return "기절";
  if (m.cond.hp < 1) return `HP ${Math.max(1, Math.round(m.cond.hp * 100))}%`;
  return "PP 소모";
}
