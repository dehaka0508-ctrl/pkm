import { koSpecies, regionById } from "../data/dex";
import { dayOf } from "./calendar";
import { standings } from "./league";
import { displayName, type GameState } from "./state";
import { keyParts, recordsOf, statKey } from "./stats";

export const GOLDEN_MASTER_BALL = "골든 마스터볼";
export const GOLDEN_MASTER_BALL_PUBLISHER = "매크로코스모스 스포츠";

export interface GoldenMasterBallAward {
  season: number;
  day: number;
  owner: string;
  uid: string;
  species: string;
  pokemonName: string;
  trainerName: string;
  appearances: number;
  kos: number;
  damage: number;
  trophies: string[];
}

interface Competition {
  name: string;
  champion?: string | null;
  /** Performance multiplier, trophy bonus, and appearances needed for the full trophy bonus. */
  weight: number;
  bonus: number;
  games: number;
}

function competitionFor(g: GameState, comp: string): Competition | undefined {
  const [kind, region] = comp.split(":");
  switch (kind) {
    case "league": {
      const league = g.leagues[region];
      if (!league) return;
      const champion = league.nextRound >= league.rounds.length ? standings(league)[0]?.id : undefined;
      return { name: `${regionById(region).name} 리그`, champion, weight: 1, bonus: 40, games: Math.max(1, league.rounds.length / 2) };
    }
    case "cup":
      return { name: `${regionById(region).name} 컵`, champion: g.cups?.[region]?.champion, weight: 1, bonus: 24, games: 3 };
    case "pwt":
      return { name: "PWT", champion: g.pwt?.champion, weight: 1.5, bonus: 64, games: 7 };
    case "pct":
      return { name: "PST", champion: g.pct?.champion, weight: 1.2, bonus: 36, games: 7 };
    case "ect":
      return { name: "PCT", champion: g.ect?.champion, weight: 1.1, bonus: 28, games: 7 };
    case "psb":
      return { name: "PSB", champion: g.psb?.champion, weight: 1.5, bonus: 40, games: 2 };
    case "super":
      return { name: `${regionById(region).name} 슈퍼컵`, champion: g.supers?.regional?.[region]?.winner, weight: 1, bonus: 8, games: 1 };
    case "worldSuper":
      return { name: "전국 슈퍼컵", champion: g.supers?.world?.winner, weight: 1.2, bonus: 12, games: 1 };
  }
}

/** Select once on June 30 from the official records of all clubs. No participation means no candidate. */
export function awardGoldenMasterBall(g: GameState): GoldenMasterBallAward | undefined {
  if (g.day !== dayOf(g.season, 6, 30) || g.goldenMasterBalls?.some(a => a.season === g.season)) return;
  const records = recordsOf(g);
  type Candidate = Pick<GoldenMasterBallAward, "owner" | "uid" | "species" | "appearances" | "kos" | "damage" | "trophies"> & { score: number };
  const candidates = new Map<string, Candidate>();
  for (const [comp, table] of Object.entries(records.comps)) {
    const competition = competitionFor(g, comp);
    if (!competition) continue;
    for (const [key, line] of Object.entries(table)) {
      if (line.a <= 0) continue;
      const candidate = candidates.get(key) ?? { ...keyParts(key), species: line.s, appearances: 0, kos: 0, damage: 0, trophies: [], score: 0 };
      candidate.appearances += line.a;
      candidate.kos += line.k;
      candidate.damage += line.d;
      candidate.score += competition.weight * (line.a * 0.5 + line.k * 4 + line.d / 180 + line.t / 360);
      if (candidate.owner === competition.champion) {
        candidate.trophies.push(competition.name);
        candidate.score += competition.bonus * Math.min(1, line.a / competition.games);
      }
      candidates.set(key, candidate);
    }
  }
  for (const award of records.awards) {
    if (award.season !== g.season) continue;
    const candidate = candidates.get(statKey(award.owner, award.uid));
    if (candidate) candidate.score += 5;
  }
  const best = [...candidates.values()].sort((a, b) => b.score - a.score || b.kos - a.kos || b.damage - a.damage ||
    a.owner.localeCompare(b.owner) || a.uid.localeCompare(b.uid))[0];
  if (!best) return;

  const owned = best.owner === g.player.slotId ? g.player.squad.find(m => m.uid === best.uid) : undefined;
  const species = owned?.species ?? best.species;
  const award: GoldenMasterBallAward = {
    season: g.season, day: g.day, owner: best.owner, uid: best.uid, species,
    trainerName: displayName(g, best.owner), pokemonName: owned?.nickname || koSpecies(species),
    appearances: best.appearances, kos: best.kos, damage: best.damage, trophies: best.trophies,
  };
  (g.goldenMasterBalls ||= []).push(award);
  return award;
}

/** UIDs carry a player's award through form changes and evolution. */
export function goldenMasterBallCount(g: GameState | null | undefined, owner: string, uid: string, species?: string): number {
  return g?.goldenMasterBalls?.filter(a => a.owner === owner && a.uid === uid &&
    // The NPC's static lineup UID identifies a slot, which can be replaced by a data update.
    (!species || owner === g.player.slotId || !uid.startsWith(owner + "#") || a.species === species)).length ?? 0;
}
