// Exercise the registration decision that the UI now requires while existing season tests run.
import { advance, recordPlayerGame } from "../src/game/season";
import { registerTeam, registrationOf, suggestedRegistration, withdrawRegistration, pendingCompetition } from "../src/game/registration";

export const advanceWithRegistration: typeof advance = async (state, sim, progress, opts) => {
  for (let guard = 0; guard < 200; guard++) {
    const result = await advance(state, sim, progress, opts);
    if (result.type === "registration") {
      const uids = suggestedRegistration(state, result.competition);
      if (uids.length) {
        const err = registerTeam(state, result.competition, uids);
        if (err) throw new Error(err);
      } else withdrawRegistration(state, result.competition);
      continue;
    }
    const comp = pendingCompetition(state.pending);
    if (result.type === "match" && comp && registrationOf(state, comp)?.withdrawn) {
      recordPlayerGame(state, { winner: 1, remaining: [0, result.pending.doubles ? 4 : 3], turns: 0, picks: [[], []], kos: [{}, {}] });
      continue;
    }
    return result;
  }
  throw new Error("registration advance guard exhausted");
};
