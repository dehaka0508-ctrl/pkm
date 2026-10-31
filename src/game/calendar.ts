// 52-week season calendar.
export const MONTH_WEEKS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]; // Jan..Dec = 52
export const WEEKS_PER_SEASON = 52;

export function monthOf(week: number): { month: number; weekOfMonth: number } {
  let w = week;
  for (let m = 0; m < 12; m++) {
    if (w <= MONTH_WEEKS[m]) return { month: m + 1, weekOfMonth: w };
    w -= MONTH_WEEKS[m];
  }
  return { month: 12, weekOfMonth: 5 };
}

export function weekLabel(week: number): string {
  const { month, weekOfMonth } = monthOf(week);
  return `${month}월 ${weekOfMonth}주`;
}

export const LEAGUE_FIRST_WEEK = 5; // Feb week 1
export const LEAGUE_LAST_WEEK = 39; // Sep last week
export const DOUBLE_ROUND_WEEKS = [14, 24, 34]; // midweek rounds
export const PWT_SWISS_WEEKS = [44, 45, 46, 47, 47]; // round 5 is midweek of week 47
export const PWT_KO_WEEKS = [48, 49, 50, 51]; // R16, QF, SF, Final
export const SEASON_REVIEW_WEEK = 52;

/** Week numbers for each league round (length = rounds). */
export function roundWeeks(rounds: number): number[] {
  const out: number[] = [];
  for (let w = LEAGUE_FIRST_WEEK; w <= LEAGUE_LAST_WEEK; w++) {
    out.push(w);
    if (DOUBLE_ROUND_WEEKS.includes(w)) out.push(w);
  }
  while (out.length < rounds) out.push(LEAGUE_LAST_WEEK);
  return out.slice(0, rounds);
}

export type Phase = "preseason" | "league" | "offseason" | "pwt-swiss" | "pwt-ko" | "review";

export function phaseOf(week: number): Phase {
  if (week < LEAGUE_FIRST_WEEK) return "preseason";
  if (week <= LEAGUE_LAST_WEEK) return "league";
  if (week < PWT_SWISS_WEEKS[0]) return "offseason";
  if (week <= PWT_SWISS_WEEKS[PWT_SWISS_WEEKS.length - 1]) return "pwt-swiss";
  if (week <= PWT_KO_WEEKS[PWT_KO_WEEKS.length - 1]) return "pwt-ko";
  return "review";
}

export const PHASE_KO: Record<Phase, string> = {
  preseason: "프리시즌",
  league: "지방 리그",
  offseason: "휴식기",
  "pwt-swiss": "PWT 스위스 스테이지",
  "pwt-ko": "PWT 토너먼트",
  review: "시즌 결산",
};
