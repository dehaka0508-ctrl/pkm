// No trainer ever plays twice on one day: two match events share a day only when no trainer can be in both
// (the PST and the PCT: a club plays in one of them).
import { describe, expect, it } from "vitest";
import { dateLabel, dateOf, seasonEvents, type CalEvent } from "../src/game/calendar";

const MATCH = (e: CalEvent) => !/Draw$/.test(e.kind) && e.kind !== "sponsorOffers" && e.kind !== "goldenMasterBall";
const SHAREABLE = (kinds: string[]) => kinds.every(k => ["pctGroup", "ectGroup"].includes(k)) || kinds.every(k => ["pctKo", "ectKo"].includes(k)) || kinds.every(k => k === "koThird:pct" || k === "koThird:ect");

describe("calendar", () => {
  it("12 seasons: no day with two matches one trainer could both play; everything ends by June 30", () => {
    for (let s = 1; s <= 12; s++) {
      const byDay = new Map<number, string[]>();
      for (const e of seasonEvents(s).filter(MATCH)) byDay.set(e.day, [...(byDay.get(e.day) || []), e.kind === "koThird" ? `koThird:${(e as any).tier}` : e.kind]);
      for (const [day, kinds] of byDay) if (kinds.length > 1) expect(SHAREABLE(kinds), `시즌 ${s} ${dateLabel(day)}: ${kinds.join(" + ")}`).toBe(true);
      const last = Math.max(...[...byDay.keys()]);
      const d = dateOf(last);
      expect(d.month === 6 || d.month === 5, `시즌 ${s} 마지막 경기 ${dateLabel(last)}`).toBe(true);
    }
  });
});
