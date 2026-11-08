// PSB (Pokémon Super Bowl): the ten league champions, single doubles games after the PWT final.
// East (관동·성도·호연·신오·레전드) and West (하나·알로라·칼로스·가라르·팔데아) each play their own bracket:
//  round 1: the two champions with the fewest points (then goal difference, then lot) of each conference;
//  round 2: the round-1 winner and the other three, drawn into semifinals;
//  round 3: the conference finals; final: East vs West — the last game of the season.
import { newTie, type Tie } from "./tie";
import { hashStr, Rng } from "./rng";
import { standings } from "./league";
import type { GameState } from "./state";

export type Conf = "east" | "west";
export const CONF_REGIONS: Record<Conf, string[]> = {
  east: ["kanto", "johto", "hoenn", "sinnoh", "legend"],
  west: ["unova", "alola", "kalos", "galar", "paldea"],
};
export const CONF_KO: Record<Conf, string> = { east: "동부", west: "서부" };
export const PSB_ROUND_KO = ["1라운드", "4강", "지구 결승", "결승"];

export interface PsbState {
  season: number;
  /** each conference's champions, region order */
  champs: Record<Conf, string[]>;
  /** "east:1", "east:2a", "east:2b", "east:3", the same for "west", and "final" */
  ties: Record<string, Tie>;
  champion?: string;
}

/** Round 1 from the final league tables: the two champions with the fewest points in each conference meet. */
export function startPsb(state: GameState): PsbState {
  const champs: Record<Conf, string[]> = { east: [], west: [] };
  const rows: Record<Conf, { id: string; pts: number; diff: number }[]> = { east: [], west: [] };
  for (const conf of ["east", "west"] as Conf[])
    for (const r of CONF_REGIONS[conf]) {
      const top = standings(state.leagues[r])[0];
      if (!top) continue;
      champs[conf].push(top.id);
      rows[conf].push({ id: top.id, pts: top.pts, diff: top.diff });
    }
  const ties: Record<string, Tie> = {};
  for (const conf of ["east", "west"] as Conf[]) {
    const lot = (id: string) => hashStr(`psb${state.season}:${id}`);
    const low = rows[conf].slice().sort((a, b) => a.pts - b.pts || a.diff - b.diff || lot(a.id) - lot(b.id)).slice(0, 2);
    if (low.length === 2) ties[`${conf}:1`] = newTie(low[0].id, low[1].id, "single");
  }
  return { season: state.season, champs, ties };
}

/** Round 2: the round-1 winner and the other three of the conference, drawn into two semifinals. */
export function psbSemis(psb: PsbState, rng: Rng) {
  for (const conf of ["east", "west"] as Conf[]) {
    if (psb.ties[`${conf}:2a`]) continue;
    const r1 = psb.ties[`${conf}:1`];
    const field = psb.champs[conf].filter(id => !r1 || (id !== r1.a && id !== r1.b));
    if (r1?.winner) field.push(r1.winner);
    const order = rng.shuffle(field.slice());
    if (order.length >= 4) {
      psb.ties[`${conf}:2a`] = newTie(order[0], order[1], "single");
      psb.ties[`${conf}:2b`] = newTie(order[2], order[3], "single");
    }
  }
}

/** Round 3: the conference finals. */
export function psbConfFinals(psb: PsbState) {
  for (const conf of ["east", "west"] as Conf[]) {
    const a = psb.ties[`${conf}:2a`]?.winner;
    const b = psb.ties[`${conf}:2b`]?.winner;
    if (a && b && !psb.ties[`${conf}:3`]) psb.ties[`${conf}:3`] = newTie(a, b, "single");
  }
}

/** The final: East's winner against West's. */
export function psbFinal(psb: PsbState) {
  const e = psb.ties["east:3"]?.winner;
  const w = psb.ties["west:3"]?.winner;
  if (e && w && !psb.ties.final) psb.ties.final = newTie(e, w, "single");
}

/** Keys of a round (0–3). */
export const psbKeys = (round: number): string[] => (round === 3 ? ["final"] : (["east", "west"] as Conf[]).flatMap(c => (round === 0 ? [`${c}:1`] : round === 1 ? [`${c}:2a`, `${c}:2b`] : [`${c}:3`])));

export const psbLabel = (key: string): string => {
  if (key === "final") return "PSB 결승 (더블배틀)";
  const [conf, r] = key.split(":");
  return `PSB ${CONF_KO[conf as Conf]} ${PSB_ROUND_KO[Number(r[0]) - 1]} (더블배틀)`;
};

export const confOf = (id: string, psb: PsbState): Conf | null => (psb.champs.east.includes(id) ? "east" : psb.champs.west.includes(id) ? "west" : null);
