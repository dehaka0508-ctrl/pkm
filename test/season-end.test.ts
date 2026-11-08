// June 30 ends the season officially: loans and sponsor contracts end on July 1, next season's offers arrive then
// (open until Aug 31; a contract signed in July starts with the next season and pays from Aug 1).
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { endDay } from "../src/game/season";
import { dayOf } from "../src/game/calendar";
import { signOffer, sponsorOf } from "../src/game/sponsor";

const game = () => createGame({ mode: "scout", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "트레이너")!.id, name: "검증", scoutPicks: [] as any });

describe("June 30 season end", () => {
  it("loans leave and contracts end on July 1; July offers are for next season", () => {
    const st = game();
    st.player.squad = [{ ...(createGame({ mode: "trainer", slotId: allTrainers()[0].id, name: "x" }).player.squad[0]), loanUntil: 1 } as any];
    const sp = sponsorOf(st);
    sp.contract = { name: "테스트", size: "small", region: "kanto", monthly: 1000, bonus: 0, objectives: [], fromSeason: 1, toSeason: 1, log: [], paidTotal: 0 } as any;
    st.day = dayOf(1, 6, 30);
    st.dayStep = 0;
    const logs: string[] = [];
    const money = st.player.money;
    endDay(st, logs); // → July 1
    expect(st.player.squad.length).toBe(0);
    expect(sp.contract).toBeNull();
    expect(st.player.money).toBe(money); // no July pay for the ended contract
    expect(sp.offers.length).toBeGreaterThan(0);
    expect(sp.offersSeason).toBe(2);
    expect(sp.offersUntil).toBe(dayOf(2, 8, 31));
    expect(signOffer(st, 0)).toBeNull();
    expect(sp.contract!.fromSeason).toBe(2);
    expect(st.player.money).toBe(money); // paid from Aug 1, not at signing
  });
});
