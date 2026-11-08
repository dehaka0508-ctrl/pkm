import { HISUI_DEX, dex, isUltraOrParadox, speciesRegion } from "../data/dex";
import { trainerById } from "./lineups";
import type { GameState, PendingMatch } from "./state";
import { dateOf, seasonEvents } from "./calendar";
import type { OwnedMon } from "./types";

export type Competition = "league" | "cup" | "pwt" | "pct" | "ect";
export const COMPETITION_NAMES: Record<Competition, string> = { league: "리그", cup: "지방 컵", pwt: "PWT", pct: "PST", ect: "PCT" };
export interface SeasonRegistration {
  season: number;
  uids: string[];
  withdrawn?: boolean;
  /** league / cup roster confirmed again when January's change window closed (Feb 1) */
  winterConfirmed?: boolean;
}
export const REGISTRATION_MAX = 8;

/** The region whose generation first brought this Pokémon (same rule as scouting pools). */
export const debutRegion = (species: string) => speciesRegion(species);

/** First seen in the region's generation — except Ultra Beasts and Paradox Pokémon, which never count as homegrown. */
/**
 * Homegrown for a region. 레전드 depends on the trainer's side: the Legends Z-A half counts 6th-gen Pokémon,
 * the Legends: Arceus half the 242 of the Hisui Pokédex (pass the trainer id for that).
 */
export const isHomegrown = (species: string, region: string, trainerId?: string) => {
  if (isUltraOrParadox(species)) return false;
  if (region === "legend") {
    const num = dex.species.get(species).num;
    const side = trainerId ? trainerById(trainerId)?.homegrownDex : undefined;
    if (side === "hisui") return HISUI_DEX.has(num);
    if (side === "gen6") return num >= 650 && num <= 721;
    return HISUI_DEX.has(num) || (num >= 650 && num <= 721);
  }
  return debutRegion(species) === region;
};

/** Counts toward the homegrown minimum: shiny, a trainer-start Pokémon from the lineup's first six, or homegrown. */
export const countsHomegrown = (m: OwnedMon, region: string, trainerId?: string) => !!m.shiny || !!m.fromTrainer || isHomegrown(m.species, region, trainerId);
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
  if (team.filter(m => countsHomegrown(m, state.player.region, state.player.slotId)).length < need) out.push(`홈그로운(이로치 포함)이 ${need}마리 이상이어야 합니다.`);
  if (team.filter(m => !m.shiny && !m.notLegend && isRegistrationLegend(m.species)).length > 1) out.push("전설·환상은 합쳐서 최대 1마리입니다. (이로치 예외)");
  return out;
}

/** Last day to register: the league opener, the regional cup draw, the PWT playoff / group draw, the PCT draw. */
export function registrationDeadline(season: number, comp: Competition): number {
  const kinds: Record<Competition, string[]> = { league: ["league"], cup: ["cupDraw", "cup"], pwt: ["groupDraw"], pct: ["pctDraw"], ect: ["ectDraw"] };
  const days = seasonEvents(season).filter(e => kinds[comp].includes(e.kind)).map(e => e.day);
  return Math.min(...days);
}

export function registrationOf(state: GameState, comp: Competition) {
  const reg = state.player.registrations?.[comp];
  return reg?.season === state.season ? reg : undefined;
}

export function registerTeam(state: GameState, comp: Competition, uids: string[]): string | null {
  if (registrationOf(state, comp)) return "이번 시즌 등록은 이미 확정되었습니다.";
  if (state.day > registrationDeadline(state.season, comp) && state.registrationDue !== comp) return "등록 기한이 지났습니다.";
  const errors = registrationProblems(state, comp, uids);
  if (errors.length) return errors.join(" ");
  (state.player.registrations ??= {})[comp] = { season: state.season, uids: uids.slice() };
  if (state.registrationDue === comp) delete state.registrationDue;
  return null;
}

/** January (1월 1일~31일): the league and regional cup rosters can be changed; Feb 1 confirms them again. */
export const WINTER_COMPS: Competition[] = ["league", "cup"];
export const inWinterWindow = (state: GameState) => dateOf(state.day).month === 1;
/** Feb 1, before its fixtures: the moment January's changes are confirmed. */
export const isWinterConfirmDay = (state: GameState) => {
  const d = dateOf(state.day);
  return d.month === 2 && d.date === 1;
};

/** A roster that may be changed now: January, or the Feb 1 confirmation itself. */
export function canChangeRegistration(state: GameState, comp: Competition): boolean {
  const reg = registrationOf(state, comp);
  if (!reg || reg.withdrawn || !WINTER_COMPS.includes(comp)) return false;
  return inWinterWindow(state) || (isWinterConfirmDay(state) && state.registrationDue === comp && !reg.winterConfirmed);
}

/** Changes a registered league / cup roster in January; on Feb 1 this also confirms it. */
export function changeRegistration(state: GameState, comp: Competition, uids: string[]): string | null {
  if (!canChangeRegistration(state, comp)) return "등록 명단은 1월에만 바꿀 수 있습니다.";
  const errors = registrationProblems(state, comp, uids);
  if (errors.length) return errors.join(" ");
  const reg = registrationOf(state, comp)!;
  reg.uids = uids.slice();
  if (state.registrationDue === comp) {
    reg.winterConfirmed = true;
    delete state.registrationDue;
  }
  return null;
}

/** A club unable to register can forfeit this competition rather than freeze the calendar. */
export function withdrawRegistration(state: GameState, comp: Competition) {
  if (registrationOf(state, comp)) return;
  if (state.registrationDue !== comp && state.day > registrationDeadline(state.season, comp)) return;
  (state.player.registrations ??= {})[comp] = { season: state.season, uids: [], withdrawn: true };
  if (state.registrationDue === comp) delete state.registrationDue;
}

export function pendingCompetition(p: PendingMatch | null): Competition | null {
  if (!p || p.friendly) return null; // preseason friendlies need no season roster
  if (p.comp === "fx") return p.label.startsWith("PST") ? "pct" : p.label.startsWith("PCT") ? "ect" : p.label.startsWith("PWT") ? "pwt" : "league";
  switch (p.tie?.kind) {
    case "cup": return "cup";
    case "po": case "ko": case "pwtFinal": return "pwt";
    case "pctKo": case "pctFinal": return "pct";
    case "ectKo": case "ectFinal": return "ect";
    case "kpo": return p.tie.tier;
    case "psb": return "cup"; // doubles: the regional cup roster
    case "third": return p.tie.tier;
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

/** This season's competitions whose registration an evolution would break (too few homegrown afterwards). */
export function evolutionBreaksRegistration(state: GameState, m: OwnedMon, target: string): Competition[] {
  const out: Competition[] = [];
  for (const comp of Object.keys(COMPETITION_NAMES) as Competition[]) {
    const reg = registrationOf(state, comp);
    if (!reg?.uids.includes(m.uid)) continue;
    const before = registrationProblems(state, comp, reg.uids).length;
    const species = m.species;
    m.species = dex.species.get(target).name;
    const after = registrationProblems(state, comp, reg.uids).length;
    m.species = species;
    if (after > before) out.push(comp);
  }
  return out;
}
