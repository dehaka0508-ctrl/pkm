// Day-based calendar. A season runs Aug 1 → Jul 31 (365 days, no leap years).
// August is the preseason. Day 0 = season 1, Aug 1, a Friday (so Sep 1 is a Monday).

export const SEASON_DAYS = 365;
const MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];
const MONTH_LEN = [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31];
const MONTH_START: number[] = [];
{
  let acc = 0;
  for (const n of MONTH_LEN) {
    MONTH_START.push(acc);
    acc += n;
  }
}
export const WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"];

export const seasonOf = (day: number) => Math.floor(day / SEASON_DAYS) + 1;
export const seasonStart = (season: number) => (season - 1) * SEASON_DAYS;
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (day: number) => (((day + 4) % 7) + 7) % 7;

export function dateOf(day: number): { season: number; month: number; date: number; weekday: number } {
  const season = seasonOf(day);
  const doy = day - seasonStart(season);
  let i = MONTH_START.length - 1;
  while (MONTH_START[i] > doy) i--;
  return { season, month: MONTHS[i], date: doy - MONTH_START[i] + 1, weekday: weekdayOf(day) };
}

export function dateLabel(day: number, withWeekday = true): string {
  const d = dateOf(day);
  return `${d.month}월 ${d.date}일${withWeekday ? ` (${WEEKDAY_KO[d.weekday]})` : ""}`;
}

/** Absolute day of a calendar date inside a season. */
export function dayOf(season: number, month: number, date: number): number {
  return seasonStart(season) + MONTH_START[MONTHS.indexOf(month)] + date - 1;
}

/** n-th (1-based) given weekday of a month. */
export function nthWeekday(season: number, month: number, weekday: number, n: number): number {
  const first = dayOf(season, month, 1);
  return first + ((weekday - weekdayOf(first) + 7) % 7) + 7 * (n - 1);
}

/** Wednesday of the month's n-th week (weeks start on the month's Mondays). */
export const weekWed = (season: number, month: number, n: number) => nthWeekday(season, month, 0, n) + 2;

// ---- season schedule ----

export type CalEvent =
  | { day: number; kind: "po" } // PWT 4th-place playoff (for this season in season 1, otherwise for next season)
  | { day: number; kind: "groupDraw" }
  | { day: number; kind: "league"; round: number }
  | { day: number; kind: "group"; md: number }
  | { day: number; kind: "cupDraw" }
  | { day: number; kind: "cup"; round: number; leg: number }
  | { day: number; kind: "koDraw" }
  | { day: number; kind: "ko"; round: number; leg: number }
  | { day: number; kind: "cupFinal" }
  | { day: number; kind: "pwtFinal" }
  | { day: number; kind: "pctDraw" }
  | { day: number; kind: "pctGroup"; md: number }
  | { day: number; kind: "pctKoDraw" }
  | { day: number; kind: "pctKo"; round: number; leg: number }
  | { day: number; kind: "pctFinal" }
  // third tier (internal "ect", shown as PCT): same Thursdays as the PST
  | { day: number; kind: "ectDraw" }
  | { day: number; kind: "ectGroup"; md: number }
  | { day: number; kind: "ectKoDraw" }
  | { day: number; kind: "ectKo"; round: number; leg: number }
  | { day: number; kind: "ectFinal" }
  // knockout playoffs: PWT 3rd vs PST runners-up, PST 3rd vs PCT runners-up (two legs, before the round of 16)
  | { day: number; kind: "kpoDraw" }
  | { day: number; kind: "kpo"; leg: number }
  | { day: number; kind: "cupThird" } // regional cup 3rd-place match, the day before the final
  | { day: number; kind: "koThird"; tier: "pwt" | "pct" | "ect" } // 3rd-place match, the Tuesday of the final's week
  | { day: number; kind: "psb"; round: number } // PSB: league champions, rounds 0–2 and the final (3)
  | { day: number; kind: "worldSemi" } // last season's PST winner vs PCT winner; the winner meets the PWT winner
  | { day: number; kind: "superCup" } // regional super cup: last season's league winner vs cup winner
  | { day: number; kind: "worldSuper" } // last season's PWT winner vs the world-semi winner
  | { day: number; kind: "goldenMasterBall" }
  | { day: number; kind: "sponsorOffers" }; // first Monday of August

export const LEAGUE_ROUNDS = 38;
export const CUP_ROUND_NAMES = ["1라운드", "2라운드", "3라운드", "윙 결승"];
export const KO_ROUND_NAMES = ["16강", "8강", "4강"];

const cache = new Map<number, CalEvent[]>();
export function seasonEvents(season: number): CalEvent[] {
  const hit = cache.get(season);
  if (hit) return hit;
  const ev: CalEvent[] = [];
  const s = season;
  // August preseason: sponsor offers, PWT playoff, super cups (from season 2)
  ev.push({ day: nthWeekday(s, 8, 0, 1), kind: "sponsorOffers" });
  ev.push({ day: weekWed(s, 8, 3), kind: "po" });
  if (s > 1) {
    const aug31 = dayOf(s, 8, 31);
    ev.push({ day: aug31 - ((weekdayOf(aug31) - 6 + 7) % 7), kind: "superCup" });
    const world = aug31 - ((weekdayOf(aug31) - 2 + 7) % 7);
    ev.push({ day: world - 6, kind: "worldSemi" }); // Thursday before: August's Wednesdays hold the PWT playoff
    ev.push({ day: world, kind: "worldSuper" });
  }
  ev.push({ day: nthWeekday(s, 9, 0, 1), kind: "groupDraw" });
  const opener = nthWeekday(s, 9, 6, 1);
  for (let r = 0; r < LEAGUE_ROUNDS; r++) ev.push({ day: opener + 7 * r, kind: "league", round: r });
  ev.push({ day: nthWeekday(s, 9, 0, 1), kind: "pctDraw" });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 9, i + 1), kind: "group", md: i });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 11, i + 1), kind: "group", md: 3 + i });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 9, i + 1) + 1, kind: "pctGroup", md: i });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 11, i + 1) + 1, kind: "pctGroup", md: 3 + i });
  ev.push({ day: nthWeekday(s, 9, 0, 1), kind: "ectDraw" });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 9, i + 1) + 1, kind: "ectGroup", md: i });
  for (let i = 0; i < 3; i++) ev.push({ day: weekWed(s, 11, i + 1) + 1, kind: "ectGroup", md: 3 + i });
  // knockout playoffs: drawn on December's first Monday, played on the Wednesdays two and one weeks before the round of 16
  ev.push({ day: nthWeekday(s, 12, 0, 1), kind: "kpoDraw" });
  ev.push({ day: weekWed(s, 1, 1) - 14, kind: "kpo", leg: 0 });
  ev.push({ day: weekWed(s, 1, 1) - 7, kind: "kpo", leg: 1 });
  ev.push({ day: nthWeekday(s, 10, 0, 1), kind: "cupDraw" });
  // regional cup (doubles, single games): rounds 1–3 and the wing final, then the final after the league
  [10, 12, 2, 3].forEach((m, round) => ev.push({ day: weekWed(s, m, 2), kind: "cup", round, leg: 0 }));
  ev.push({ day: nthWeekday(s, 1, 0, 1), kind: "koDraw" });
  ev.push({ day: nthWeekday(s, 1, 0, 1), kind: "pctKoDraw" });
  ev.push({ day: nthWeekday(s, 1, 0, 1), kind: "ectKoDraw" });
  [1, 2, 3].forEach((m, round) => {
    ev.push({ day: weekWed(s, m, 1), kind: "ko", round, leg: 0 });
    ev.push({ day: weekWed(s, m, 3), kind: "ko", round, leg: 1 });
    ev.push({ day: weekWed(s, m, 1) + 1, kind: "pctKo", round, leg: 0 });
    ev.push({ day: weekWed(s, m, 3) + 1, kind: "pctKo", round, leg: 1 });
    ev.push({ day: weekWed(s, m, 1) + 1, kind: "ectKo", round, leg: 0 });
    ev.push({ day: weekWed(s, m, 3) + 1, kind: "ectKo", round, leg: 1 });
  });
  const lastRound = opener + 7 * (LEAGUE_ROUNDS - 1);
  // finals: one week each, a 3rd-place match on the Tuesday before — regional cup, then PST / PCT, then PWT
  ev.push({ day: lastRound + 2, kind: "cupThird" });
  ev.push({ day: lastRound + 3, kind: "cupFinal" });
  ev.push({ day: lastRound + 9, kind: "koThird", tier: "pct" });
  ev.push({ day: lastRound + 9, kind: "koThird", tier: "ect" });
  ev.push({ day: lastRound + 16, kind: "koThird", tier: "pwt" });
  ev.push({ day: lastRound + 11, kind: "pctFinal" });
  ev.push({ day: lastRound + 12, kind: "ectFinal" });
  ev.push({ day: lastRound + 17, kind: "pwtFinal" });
  // PSB: Sunday and Wednesday, Sunday and Wednesday after the PWT final (the last game ends the season before June 30)
  [21, 24, 28, 31].forEach((d, round) => ev.push({ day: lastRound + d, kind: "psb", round }));
  ev.push({ day: dayOf(s, 6, 30), kind: "goldenMasterBall" });
  const order: Record<string, number> = { po: 0, groupDraw: 1, pctDraw: 2, ectDraw: 3, cupDraw: 1, koDraw: 1, pctKoDraw: 2, ectKoDraw: 3, kpoDraw: 1, pctGroup: 5, ectGroup: 6, pctKo: 5, ectKo: 6 };
  ev.sort((a, b) => a.day - b.day || (order[a.kind] ?? 5) - (order[b.kind] ?? 5));
  cache.set(season, ev);
  return ev;
}

export const eventsOn = (day: number) => seasonEvents(seasonOf(day)).filter(e => e.day === day);

export function leagueRoundDay(season: number, round: number): number {
  return nthWeekday(season, 9, 6, 1) + 7 * round;
}

export type Phase = "preseason" | "season" | "offseason";
export function phaseOf(day: number): Phase {
  const s = seasonOf(day);
  const ev = seasonEvents(s);
  const first = ev.find(e => e.kind === "league")!.day;
  const end = Math.max(...ev.filter(e => e.kind === "pwtFinal" || e.kind === "psb").map(e => e.day));
  if (day < first) return "preseason";
  if (day <= end) return "season";
  return "offseason";
}
export const PHASE_KO: Record<Phase, string> = { preseason: "프리시즌", season: "시즌 중", offseason: "휴식기" };
