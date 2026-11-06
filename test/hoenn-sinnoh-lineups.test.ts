import { describe, it, expect } from "vitest";
import { allTrainers, resolveTeam, roleSkill } from "../src/game/lineups";
import { dex } from "../src/data/dex";
import { simulateMatch } from "../src/battle/engine";
import hoenn from "../data/lineups/trainer_lineups_hoenn.json";
import sinnoh from "../data/lineups/trainer_lineups_sinnoh.json";

const names = new Set([...hoenn.trainers, ...sinnoh.trainers].map(t => t.name));
const updated = allTrainers().filter(t => ["hoenn", "sinnoh"].includes(t.region) && names.has(t.name));
const get = (name: string) => updated.find(t => t.name === name)!;
const moveIds = (name: string, slot: number) => resolveTeam(get(name))[slot].moves.map(m => dex.moves.get(m).id);

describe("curated Hoenn and Sinnoh lineups", () => {
  it("loads all 29 six-Pokémon teams without placeholders or Mega forms (Hoenn: Mega gimmick, stones held in base form)", () => {
    expect(updated).toHaveLength(29);
    expect(updated.filter(t => t.region === "hoenn")).toHaveLength(20);
    expect(updated.filter(t => t.region === "sinnoh")).toHaveLength(9);
    for (const trainer of updated) {
      expect(trainer.gimmick).toBe(trainer.region === "hoenn" ? "mega" : null);
      expect(trainer.team).toHaveLength(6);
      expect(trainer.team.filter(m => m?.item && dex.items.get(m.item).megaStone).length).toBeLessThanOrEqual(1);
      const team = resolveTeam(trainer);
      for (const mon of team) {
        const sp = dex.species.get(mon.species);
        expect(mon.placeholder, `${trainer.name}: ${mon.species}`).toBe(false);
        expect(sp.exists).toBe(true);
        expect(sp.isMega).not.toBe(true);
        // only the Mega Stones the user assigned (one per Hoenn trainer at most)
        if (dex.items.get(mon.item).megaStone) expect(trainer.region).toBe("hoenn");
        expect(Object.values(sp.abilities)).toContain(mon.ability);
        expect(mon.level).toBe(50);
        expect(mon.moves.length).toBeGreaterThan(0);
        expect(mon.moves.every(m => dex.moves.get(m).exists)).toBe(true);
      }
    }
  });

  it("keeps requested replacements, distinct duplicate slots, and source moves when completing gaps", () => {
    expect(get("성호").team[5]?.species).toBe("Metagross");
    expect(get("성호").team[5]?.ability).toBe("Clear Body");
    expect(moveIds("성호", 5)).toEqual(["bulletpunch", "zenheadbutt", "meteormash", "gigaimpact"]);
    expect(get("혁진").team[1]?.species).toBe("Scrafty");
    expect(get("원규").team[5]?.species).toBe("Probopass");
    expect(get("암페어").team[0]?.species).toBe("Electivire");
    expect(get("암페어").team[4]?.species).toBe("Magnezone");
    expect(get("민진").team[5]?.species).toBe("Swampert");
    expect(get("민진").team[5]?.gender).toBe("F");
    expect(get("종길").team.filter(m => m?.species === "Slaking")).toHaveLength(2);
    expect(get("마적").team.filter(m => m?.species === "Weezing")).toHaveLength(2);
    expect(get("아강").team.filter(m => m?.species === "Muk")).toHaveLength(2);
    expect(get("난천").team[5]?.ability).toBe("Sand Veil");
    expect(get("충호").team[1]?.ability).toBe("Technician");
    // Yanmega is an ordinary species despite its Korean name starting with 메가.
    expect(get("충호").team[0]?.species).toBe("Yanmega");
    expect(moveIds("강석", 5)).toEqual(["headsmash", "waterfall", "earthquake", "doubleedge"]);
    expect(moveIds("유채", 5)).toEqual(["solarbeam", "earthpower", "sludgebomb", "gigadrain"]);
  });

  it("completes professor sets from usage data without inventing unknown genders", () => {
    expect(get("털보박사").team.map(m => m?.species)).toEqual([
      "Azumarill", "Ludicolo", "Linoone", "Breloom", "Pelipper", "Flygon",
    ]);
    for (const mon of get("털보박사").team) {
      expect(mon?.gender).toBeNull();
      expect(mon?.ability).toBeTruthy();
      expect(mon?.item).toBeTruthy();
      expect(mon?.nature).toBeTruthy();
      expect(mon?.moves).toHaveLength(4);
      expect(mon?.moves.every(Boolean)).toBe(true);
    }
    expect(get("자두").team[5]?.gender).toBeNull();
    expect(get("자두").team[5]?.ability).toBe("Dry Skin");
    expect(get("자두").team[5]?.item).toBe("Petaya Berry");
    expect(get("난천").team[4]?.nature).toBe("Adamant");
    expect(get("난천").team[5]?.nature).toBe("Bold");
    // 휘웅·봄이 later took user-picked Pokémon without full sets (role-based moves fill them in)
    for (const trainer of updated.filter(t => !['휘웅', '봄이'].includes(t.name))) for (const mon of trainer.team) {
      expect(mon?.moves.filter(Boolean)).toHaveLength(4);
      expect(mon?.nature).toBeTruthy();
    }
  });

  it("simulates battles with the imported champion and gym teams", () => {
    for (const [a, b] of [["성호", "난천"], ["털보박사", "맥실러"]]) {
      const side = (name: string) => {
        const t = get(name);
        return { name, team: resolveTeam(t), gimmick: null, skill: roleSkill(t.role) };
      };
      const result = simulateMatch(side(a), side(b), `regional:${a}:${b}`);
      expect(result.turns).toBeGreaterThan(0);
    }
  });
});
