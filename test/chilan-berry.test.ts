import { expect, it } from "vitest";
import { Battle } from "@pkmn/sim";
import { applyLeagueItems } from "../src/battle/items";

function fight(move: string, item = "Chilan Berry", ability = "Synchronize") {
  const battle = new Battle({ formatid: "gen9customgame", seed: [1, 2, 3, 4] });
  applyLeagueItems(battle);
  battle.setPlayer("p1", { team: [{ species: "Mew", ability, moves: [move], level: 100 }] });
  battle.setPlayer("p2", { team: [{ species: "Meganium", ability: "Overgrow", item, moves: ["Splash"], level: 100 }] });
  if (battle.requestState === "teampreview") battle.makeChoices("team 1", "team 1");
  const defender = battle.p2!.active[0];
  return { battle, defender, hit() { const before = defender.hp; battle.makeChoices("move 1", "move 1"); return before - defender.hp; } };
}

for (const move of ["Flamethrower", "Ice Beam", "Sludge Bomb"]) {
  it("halves a super-effective " + move + " once", () => {
    const plain = fight(move, ""), berry = fight(move);
    expect(Math.abs(berry.hit() - plain.hit() / 2)).toBeLessThanOrEqual(1);
    expect(berry.defender.item).toBe("");
    expect(berry.battle.log.some(line => line.includes("Chilan Berry") && line.includes("[weaken]"))).toBe(true);
    expect(berry.hit()).toBe(plain.hit());
  });
}
for (const move of ["Swift", "Surf"]) {
  it("does not consume or reduce neutral/resisted " + move, () => {
    const plain = fight(move, ""), berry = fight(move);
    expect(berry.hit()).toBe(plain.hit());
    expect(berry.defender.item).toBe("chilanberry");
  });
}
it("respects substitutes and Unnerve", () => {
  const sub = fight("Flamethrower");
  sub.defender.addVolatile("substitute");
  sub.hit();
  expect(sub.defender.item).toBe("chilanberry");
  const blocked = fight("Flamethrower", "Chilan Berry", "Unnerve");
  const plain = fight("Flamethrower", "", "Unnerve");
  expect(blocked.hit()).toBe(plain.hit());
  expect(blocked.defender.item).toBe("chilanberry");
});
