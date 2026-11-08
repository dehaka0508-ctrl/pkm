// Item / move / key-item forms, the items that come and go with a Pokémon, and the picker's form rules.
import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { formSpecies, listedInPicker, pickItems, formGroup, genderForm } from "../src/data/forms";
import { simulateMatch, toShowdownSet } from "../src/battle/engine";
import { awardTicket, endLoans, ticketsOf, useTicket } from "../src/game/legend";
import { bagCount, sell, equip, addItem } from "../src/game/shop";
import { useKeyItem, usableKeyItems, grantFormItems } from "../src/game/formitems";
import { evolutionOptions } from "../src/game/moves";
import { calcStats } from "../src/battle/calc";
import { registerTeam, suggestedRegistration } from "../src/game/registration";
import type { OwnedMon } from "../src/game/types";

const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.region === "kanto" && t.role === "관장")!.id, name: "검증" });
const mon = (st: any, species: string, extra: Partial<OwnedMon> = {}): OwnedMon => ({ ...st.player.squad[0], uid: species + Math.random(), species, item: "", moves: ["tackle"], bound: undefined, ...extra });

describe("held-item and move forms", () => {
  it("plates, memories, masks, orbs, Gracidea, Secret Sword", () => {
    expect(formSpecies({ species: "Arceus", item: "Flame Plate" })).toBe("Arceus-Fire");
    expect(formSpecies({ species: "Silvally", item: "Water Memory" })).toBe("Silvally-Water");
    expect(formSpecies({ species: "Genesect", item: "Douse Drive" })).toBe("Genesect-Douse");
    expect(formSpecies({ species: "Ogerpon", item: "Hearthflame Mask" })).toBe("Ogerpon-Hearthflame");
    expect(formSpecies({ species: "Giratina", item: "Griseous Core" })).toBe("Giratina-Origin");
    expect(formSpecies({ species: "Shaymin", item: "key:gracidea" })).toBe("Shaymin-Sky");
    expect(formSpecies({ species: "Shaymin", item: "" })).toBe("Shaymin");
    expect(formSpecies({ species: "Keldeo", moves: ["surf", "secretsword"] })).toBe("Keldeo-Resolute");
    expect(formSpecies({ species: "Arceus-Ghost", item: "" })).toBe("Arceus-Ghost"); // lineup data keeps its form
    const set = toShowdownSet({ species: "Shaymin", item: "key:gracidea", moves: ["seedflare"], ability: "", nature: "Timid", evs: {} as any, ivs: {} as any, gender: "", teraType: null } as any, 0);
    expect(set.species).toBe("Shaymin-Sky");
    expect(set.item).toBe("");
    const og = toShowdownSet({ species: "Ogerpon", item: "Wellspring Mask", moves: ["ivycudgel"], ability: "", nature: "Jolly", evs: {} as any, ivs: {} as any, gender: "", teraType: "Fire" } as any, 0);
    expect(og.teraType).toBe("Water");
    expect(calcStats({ species: "Giratina", item: "Griseous Core", nature: "Serious" } as any).atk).toBeGreaterThan(calcStats({ species: "Giratina", item: "", nature: "Serious" } as any).atk);
  });
  it("battles run with them", () => {
    const st = game();
    const base = st.player.squad[0];
    const team = [
      { ...base, species: "Arceus", item: "Flame Plate", ability: "Multitype", moves: ["judgment", "recover", "calmmind", "earthpower"] },
      { ...base, species: "Calyrex-Ice", item: "", ability: "As One (Glastrier)", moves: ["glaciallance", "highhorsepower", "protect", "trickroom"] },
      { ...base, species: "Zygarde-Complete", item: "Zygardite", ability: "Power Construct", moves: ["thousandarrows", "dragondance", "protect", "extremespeed"] },
      { ...base, species: "Keldeo", item: "", ability: "Justified", moves: ["secretsword", "surf", "protect", "calmmind"] },
    ];
    for (const doubles of [false, true]) {
      const picks = doubles ? [0, 1, 2, 3] : [0, 1, 2];
      const r = simulateMatch({ name: "a", team, gimmick: "mega", skill: 0.9, picks }, { name: "b", team: team.slice().reverse(), gimmick: null as any, skill: 0.9, picks }, "forms" + doubles, { doubles });
      expect(r.turns).toBeGreaterThan(0);
    }
  });
});

describe("items that come with a Pokémon", () => {
  it("a ticket legend brings the picked plate; it can't be sold and leaves with it", () => {
    const st = game();
    st.player.squad = st.player.squad.slice(0, 5);
    awardTicket(st, "both", st.player.region, "관동 리그");
    const t = ticketsOf(st)[0];
    t.choices = ["arceus", "giratina", "deoxys"];
    expect(pickItems("Arceus")).toContain("Flame Plate");
    expect(useTicket(st, t.id, "arceus", "Flame Plate")).toBeNull();
    const arceus = st.player.squad[st.player.squad.length - 1];
    expect(arceus.bound).toEqual(["Flame Plate"]);
    expect(bagCount(st, "Flame Plate")).toBe(1);
    expect(sell(st, "Flame Plate", 1000)).toMatch(/팔 수 없습니다/);
    expect(equip(st, arceus, "Flame Plate")).toBeNull();
    expect(formSpecies(arceus)).toBe("Arceus-Fire");
    st.season = arceus.loanUntil! + 1;
    endLoans(st);
    expect(st.player.squad.includes(arceus)).toBe(false);
    expect(bagCount(st, "Flame Plate")).toBe(0);
  });
  it("Deoxys' Meteorite cycles its forms; Hoopa's mirror toggles; neither is used up", () => {
    const st = game();
    const d = mon(st, "Deoxys");
    st.player.squad.push(d);
    grantFormItems(st, d);
    expect(usableKeyItems(st, d)).toEqual(["key:meteorite"]);
    const seen = [d.species];
    for (let i = 0; i < 4; i++) {
      useKeyItem(st, d, "key:meteorite");
      seen.push(d.species);
    }
    expect(seen).toEqual(["Deoxys", "Deoxys-Attack", "Deoxys-Defense", "Deoxys-Speed", "Deoxys"]);
    expect(bagCount(st, "key:meteorite")).toBe(1);
    const h = mon(st, "Hoopa");
    st.player.squad.push(h);
    grantFormItems(st, h);
    useKeyItem(st, h, "key:prisonbottle");
    expect(h.species).toBe("Hoopa-Unbound");
    useKeyItem(st, h, "key:prisonbottle");
    expect(h.species).toBe("Hoopa");
  });
  it("Calyrex rides the first horse in squad order and lets it go again", () => {
    const st = game();
    st.player.squad = st.player.squad.slice(0, 4);
    const c = mon(st, "Calyrex", { ability: "Unnerve" });
    const spectrier = mon(st, "Spectrier");
    const glastrier = mon(st, "Glastrier");
    st.player.squad.push(c, spectrier, glastrier);
    grantFormItems(st, c);
    expect(useKeyItem(st, c, "key:reins").ok).toBeTruthy();
    expect(c.species).toBe("Calyrex-Shadow");
    expect(c.ability).toBe("As One (Spectrier)");
    expect(st.player.squad.includes(spectrier)).toBe(false);
    expect(useKeyItem(st, c, "key:reins").ok).toBeTruthy();
    expect(c.species).toBe("Calyrex");
    expect(c.ability).toBe("Unnerve");
    expect(st.player.squad.includes(spectrier)).toBe(true);
    // a registered horse stays out
    st.player.squad = st.player.squad.filter(x => x !== spectrier);
    registerTeam(st, "league", [...suggestedRegistration(st, "league").filter(u => u !== c.uid && u !== glastrier.uid).slice(0, 5), glastrier.uid]);
    expect(useKeyItem(st, c, "key:reins").err).toMatch(/등록/);
  });
});

describe("evolutions and pickers", () => {
  it("Kubfu by scroll, Rockruff to three Lycanroc, Zygarde 10% → 50% → 100%", () => {
    expect(evolutionOptions("kubfu", 50).map(e => e.item)).toEqual(["key:scrolldark", "key:scrollwater"]);
    expect(evolutionOptions("rockruff", 25).map(e => [e.id, e.ready])).toEqual([["lycanroc", true], ["lycanrocmidnight", true], ["lycanrocdusk", true]]);
    expect(evolutionOptions("zygarde10", 24)[0]).toMatchObject({ id: "zygarde", ready: false });
    expect(evolutionOptions("zygarde", 50)[0]).toMatchObject({ id: "zygardecomplete", ready: true });
  });
  it("picker: one entry per Pokémon for these, forms by drop-down / gender / items", () => {
    for (const hidden of ["Arceus-Fire", "Silvally-Bug", "Genesect-Douse", "Ogerpon-Wellspring", "Dialga-Origin", "Shaymin-Sky", "Deoxys-Attack", "Hoopa-Unbound", "Calyrex-Ice", "Keldeo-Resolute", "Rockruff-Dusk", "Meowstic-F", "Oinkologne-F", "Pichu-Spiky-eared", "Greninja-Bond", "Zygarde", "Zygarde-Complete", "Vivillon-Polar", "Tauros-Paldea-Blaze", "Urshifu-Rapid-Strike", "Maushold-Four"])
      expect(listedInPicker(hidden), hidden).toBe(false);
    for (const shown of ["Arceus", "Zygarde-10%", "Tauros", "Tauros-Paldea-Combat", "Vivillon", "Urshifu", "Rockruff", "Meowstic", "Greninja", "Pichu"]) expect(listedInPicker(shown), shown).toBe(true);
    expect(formGroup("Tauros-Paldea-Aqua")).toBe("Tauros-Paldea");
    expect(formGroup("Tauros")).toBeNull();
    expect(genderForm("Meowstic", "F")).toBe("Meowstic-F");
    expect(genderForm("Oinkologne-F", "M")).toBe("Oinkologne");
    void addItem;
  });
});
