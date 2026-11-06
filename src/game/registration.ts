import { dex, isUltraOrParadox } from "../data/dex";
import type { GameState, PendingMatch } from "./state";
import type { OwnedMon } from "./types";

export type Competition = "league" | "cup" | "pwt" | "pct";
export const COMPETITION_NAMES: Record<Competition, string> = { league: "리그", cup: "지방 컵", pwt: "PWT", pct: "PCT" };
export interface SeasonRegistration { season: number; uids: string[]; withdrawn?: boolean; }
export const REGISTRATION_MAX = 8;

/** National dex numbers first introduced with each region's generation (Hisui's Legends: Arceus Pokémon belong to Sinnoh). */
const GEN_RANGES: Record<string, [number, number][]> = {
  kanto: [[1, 151]], johto: [[152, 251]], hoenn: [[252, 386]], sinnoh: [[387, 493], [899, 905]], unova: [[494, 649]],
  kalos: [[650, 721]], alola: [[722, 809]], galar: [[810, 898]], paldea: [[906, 1025]],
};
const FORM_REGION: [string, string][] = [["Alola", "alola"], ["Galar", "galar"], ["Hisui", "sinnoh"], ["Paldea", "paldea"]];

/** The region whose generation first brought this Pokémon (a regional form belongs to the form's region). */
export function debutRegion(species: string): string | null {
  const sp = dex.species.get(species);
  const form = FORM_REGION.find(([f]) => sp.forme?.includes(f) || sp.baseForme?.includes(f));
  if (form) return form[1];
  for (const [r, ranges] of Object.entries(GEN_RANGES)) if (ranges.some(([a, b]) => sp.num >= a && sp.num <= b)) return r;
  return null;
}

/** First seen in the region's generation — except Ultra Beasts and Paradox Pokémon, which never count as homegrown. */
export const isHomegrown = (species: string, region: string) => !isUltraOrParadox(species) && debutRegion(species) === region;

/** Counts toward the homegrown minimum: shiny, a trainer-start Pokémon from the lineup's first six, or homegrown. */
export const countsHomegrown = (m: OwnedMon, region: string) => !!m.shiny || !!m.fromTrainer || isHomegrown(m.species, region);
/** Ultra Beasts and Paradox Pokémon are not legendary or mythical Pokémon. */
export const isRegistrationLegend = (species: string) => dex.species.get(species).tags.some(t => ["Restricted Legendary", "Sub-Legendary", "Mythical"].includes(t));

/** Homegrown needed for a roster of n: up to 6 → 2, 7~8 → 3. */
export const homegrownMin = (n: number) => (n >= 7 ? 3 : 2);

export function registrationProblems(state: GameState, comp: Competition, uids: string[]): string[] {
  const out: string[] = [];
  const min = comp === "cup" ? 4 : 3;
  const team = uids.map(id => state.player.squad.find(m => m.uid === id)).filter((m): m is OwnedMon => !!m);
  if (uids.length < min || uids.length > REGISTRATION_MAX) out.push(`${min}~${REGISTRATION_MAX}마리를 등록하세요.`);
  if (team.length !== uids.length || new Set(uids).size !== uids.length) out.push("보유 중인 서로 다른 포켓몬을 선택하세요.");
  // Shiny Pokémon count as eligible homegrown and are exempt from the legendary limit.
  const need = homegrownMin(team.length);
  if (team.filter(m => countsHomegrown(m, state.player.region)).length < need) out.push(`홈그로운(이로치 포함)이 ${need}마리 이상이어야 합니다.`);
  if (team.filter(m => !m.shiny && isRegistrationLegend(m.species)).length > 1) out.push("전설·환상은 합쳐서 최대 1마리입니다. (이로치 예외)");
  return out;
}

export function registrationOf(state: GameState, comp: Competition) {
  const reg = state.player.registrations?.[comp];
  return reg?.season === state.season ? reg : undefined;
}

export function registerTeam(state: GameState, comp: Competition, uids: string[]): string | null {
  if (registrationOf(state, comp)) return "이번 시즌 등록은 이미 확정되었습니다.";
  if (state.registrationDue !== comp) return "등록 기간이 아닙니다. 대회 시작 직전에 등록합니다.";
  const errors = registrationProblems(state, comp, uids);
  if (errors.length) return errors.join(" ");
  (state.player.registrations ??= {})[comp] = { season: state.season, uids: uids.slice() };
  delete state.registrationDue;
  return null;
}

/** A club unable to register can forfeit this competition rather than freeze the calendar. */
export function withdrawRegistration(state: GameState, comp: Competition) {
  if (state.registrationDue !== comp || registrationOf(state, comp)) return;
  (state.player.registrations ??= {})[comp] = { season: state.season, uids: [], withdrawn: true };
  delete state.registrationDue;
}

export function pendingCompetition(p: PendingMatch | null): Competition | null {
  if (!p || p.friendly) return null; // preseason friendlies need no season roster
  if (p.comp === "fx") return p.label.startsWith("PCT") ? "pct" : p.label.startsWith("PWT") ? "pwt" : "league";
  switch (p.tie?.kind) {
    case "cup": return "cup";
    case "po": case "ko": case "pwtFinal": return "pwt";
    case "pctKo": case "pctFinal": return "pct";
    default: return null; // preseason super cups have no season roster deadline
  }
}

/** Prefer the manager's six, filling the remaining places from the season roster. */
export function registeredEntry(state: GameState, comp: Competition): OwnedMon[] {
  const reg = registrationOf(state, comp);
  if (!reg) return [];
  const order = [...state.player.entry.filter(u => reg.uids.includes(u)), ...reg.uids.filter(u => !state.player.entry.includes(u))];
  return order.map(u => state.player.squad.find(m => m.uid === u)).filter((m): m is OwnedMon => !!m).slice(0, 6);
}

export function suggestedRegistration(state: GameState, comp: Competition): string[] {
  const team = state.player.squad;
  for (let n = Math.min(REGISTRATION_MAX, team.length); n >= (comp === "cup" ? 4 : 3); n--) {
    for (let mask = 0; mask < 1 << team.length; mask++) {
      const uids = team.filter((_, i) => mask & (1 << i)).map(m => m.uid);
      if (uids.length === n && !registrationProblems(state, comp, uids).length) return uids;
    }
  }
  return [];
}
