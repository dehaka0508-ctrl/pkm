export type MatchRules = "league" | "singles" | "doubles";

export const MATCH_SIZE: Record<MatchRules, number> = { league: 6, singles: 3, doubles: 4 };
