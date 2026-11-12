// Item / move / key-item forms, the items that come and go with a Pokémon, and the picker's form rules.
import { describe, expect, it } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers } from "../src/game/lineups";
import { formSpecies, listedInPicker, pickItems, formGroup, genderForm } from "../src/data/forms";
import { simulateMatch, toShowdownSet } from "../src/battle/engine";
import { awardTicket, endLoans, ticketsOf, useTicket } from "../src/game/legend";
import { bagCount, sell, equip, addItem, catalog, isHoldable } from "../src/game/shop";
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
  it.each(["Tornadus", "Thundurus", "Landorus", "Enamorus"])("%s brings a reusable Reveal Glass that toggles species and ability", species => {
    const st = game();
    st.player.squad = st.player.squad.slice(0, 4);
    awardTicket(st, "both", "all", "PWT");
    const t = ticketsOf(st)[0];
    t.choices = [species];
    expect(useTicket(st, t.id, species)).toBeNull();
    const m = st.player.squad.at(-1)!;
    const ability = m.ability;
    expect(bagCount(st, "key:revealglass")).toBe(1);
    expect(isHoldable("key:revealglass")).toBe(false);
    expect(usableKeyItems(st, m)).toEqual(["key:revealglass"]);
    expect(useKeyItem(st, m, "key:revealglass").err).toBeUndefined();
    expect(m.species).toBe(`${species}-Therian`);
    expect(m.ability).not.toBe(ability);
    expect(useKeyItem(st, m, "key:revealglass").err).toBeUndefined();
    expect(m.species).toBe(species);
    expect(m.ability).toBe(ability);
    expect(bagCount(st, "key:revealglass")).toBe(1);
    expect(m.item).toBe("");
  });

  it.each([
    ["Zacian", "Rusted Sword"], ["Zamazenta", "Rusted Shield"],
    ["Kyogre", "Blue Orb"], ["Groudon", "Red Orb"],
  ])("%s brings %s, which is also sold as a held item", (species, item) => {
    const st = game();
    st.player.squad = st.player.squad.slice(0, 4);
    awardTicket(st, "both", "all", "PWT");
    const t = ticketsOf(st)[0]; t.choices = [species];
    expect(useTicket(st, t.id, species)).toBeNull();
    const m = st.player.squad.at(-1)!;
    expect(bagCount(st, item)).toBe(1);
    expect(catalog().find(i => i.key === item)?.cat).toBe("held");
    expect(equip(st, m, item)).toBeNull();
    expect(toShowdownSet(m, 0).item).toBe(item);
  });

  it("supplies missing form items to existing saves once", () => {
    const st = game();
    st.player.squad = ["Tornadus-Therian", "Zacian", "Zamazenta", "Kyogre", "Groudon"].map(s => mon(st, s));
    st.player.bag = {};
    const loaded = migrate(JSON.parse(JSON.stringify(st)));
    const items = ["key:revealglass", "Rusted Sword", "Rusted Shield", "Blue Orb", "Red Orb"];
    items.forEach(i => expect(bagCount(loaded, i)).toBe(1));
    const again = migrate(JSON.parse(JSON.stringify(loaded)));
    items.forEach(i => expect(bagCount(again, i)).toBe(1));
  });

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

describe("evolution items", () => {
  it("trade evolutions use the Linking Cord; trade / hold items are just used; Gimmighoul's coins", () => {
    const one = (sp: string) => evolutionOptions(sp, 5).map(e => `${e.id}:${e.item}:${e.ready}`);
    for (const sp of ["kadabra", "machoke", "graveler", "haunter", "gurdurr", "boldore", "phantump", "karrablast", "shelmet"]) expect(one(sp)[0], sp).toMatch(/:evo:linkingcord:true$/);
    expect(one("pumpkaboosuper")).toEqual(["gourgeistsuper:evo:linkingcord:true"]);
    expect(one("poliwhirl")).toContain("politoed:King's Rock:true");
    expect(one("slowpoke")).toContain("slowking:King's Rock:true");
    expect(one("porygon2")).toEqual(["porygonz:Dubious Disc:true"]);
    expect(one("clamperl")).toEqual(["huntail:Deep Sea Tooth:true", "gorebyss:Deep Sea Scale:true"]);
    expect(one("sneasel")).toEqual(["weavile:Razor Claw:true"]);
    expect(one("gligar")).toEqual(["gliscor:Razor Fang:true"]);
    expect(one("gimmighoulroaming")).toEqual(["gholdengo:evo:coins:true"]);
  });
  it("shop: Linking Cord and coins with the evolution items; Razor Claw held tab, Razor Fang evolution tab", async () => {
    const { catalog, itemName } = await import("../src/game/shop");
    const cat = (k: string) => catalog().find(i => i.key === k)?.cat;
    expect(cat("evo:linkingcord")).toBe("evo");
    expect(cat("evo:coins")).toBe("evo");
    expect(cat("Razor Claw")).toBe("held");
    expect(cat("Razor Fang")).toBe("evo");
    expect(itemName("evo:linkingcord")).toBe("연결의 끈");
    for (const k of ["King's Rock", "Metal Coat", "Dragon Scale", "Up-Grade", "Dubious Disc", "Deep Sea Tooth", "Deep Sea Scale", "Protector", "Electirizer", "Magmarizer", "Reaper Cloth", "Prism Scale", "Whipped Dream", "Sachet"]) expect(cat(k), k).toBeTruthy();
    expect(listedInPicker("Dudunsparce-Three-Segment")).toBe(false);
    expect(listedInPicker("Gimmighoul-Roaming")).toBe(false);
    expect(formGroup("Gimmighoul-Roaming")).toBe("Gimmighoul");
  });
});

describe("regional evolutions", () => {
  it("every regional evolution can be chosen; one that breaks a registration's homegrown count is blocked", async () => {
    const { evolutionBreaksRegistration, registerTeam, registrationProblems } = await import("../src/game/registration");
    expect(evolutionOptions("quilava", 36).map(e => e.id)).toEqual(["typhlosion", "typhlosionhisui"]);
    expect(evolutionOptions("petilil", 5).map(e => e.id)).toEqual(["lilligant", "lilliganthisui"]);
    expect(evolutionOptions("goomy", 40).map(e => e.id)).toEqual(["sliggoo", "sliggoohisui"]);
    const st = game(); // Kanto: Kanto Pokémon are homegrown
    const sq = st.player.squad;
    sq[0].species = "Exeggcute";
    sq[0].shiny = false;
    sq[0].fromTrainer = false;
    const others = sq.slice(1, 4);
    for (const o of others) { o.species = "Garchomp"; o.shiny = false; o.fromTrainer = false; }
    sq[4].species = "Bulbasaur";
    sq[4].shiny = false;
    sq[4].fromTrainer = false;
    const uids = [sq[0].uid, ...others.map(o => o.uid), sq[4].uid];
    expect(registrationProblems(st, "league", uids)).toEqual([]);
    expect(registerTeam(st, "league", uids)).toBeNull();
    // Exeggcute → Alolan Exeggutor would leave only one homegrown (Bulbasaur): blocked; plain Exeggutor is fine
    expect(evolutionBreaksRegistration(st, sq[0], "exeggutoralola")).toEqual(["league"]);
    expect(evolutionBreaksRegistration(st, sq[0], "exeggutor")).toEqual([]);
    expect(sq[0].species).toBe("Exeggcute");
  });
});

describe("Kyurem and Necrozma fusions", () => {
  it("Kyurem + DNA Splicers takes the first Reshiram / Zekrom; Necrozma fuses with no item", async () => {
    const { fusionPartner, toggleFusion } = await import("../src/game/formitems");
    const st = game();
    st.player.squad = st.player.squad.slice(0, 4);
    const k = mon(st, "Kyurem", { ability: "Pressure" });
    const z = mon(st, "Zekrom");
    const r = mon(st, "Reshiram");
    st.player.squad.push(k, z, r);
    grantFormItems(st, k);
    expect(usableKeyItems(st, k)).toEqual(["key:dnasplicers"]);
    expect(useKeyItem(st, k, "key:dnasplicers").ok).toBeTruthy();
    expect(k.species).toBe("Kyurem-Black");
    expect(k.ability).toBe("Teravolt");
    expect(st.player.squad.includes(z)).toBe(false);
    expect(useKeyItem(st, k, "key:dnasplicers").ok).toBeTruthy();
    expect(k.species).toBe("Kyurem");
    expect(st.player.squad.includes(z)).toBe(true);
    const n = mon(st, "Necrozma", { ability: "Prism Armor" });
    const l = mon(st, "Lunala");
    st.player.squad.push(n, l);
    expect(usableKeyItems(st, n)).toEqual([]);
    expect(fusionPartner(st, n)).toBe(l);
    expect(toggleFusion(st, n).ok).toBeTruthy();
    expect(n.species).toBe("Necrozma-Dawn-Wings");
    for (const hidden of ["Kyurem-Black", "Kyurem-White", "Necrozma-Dusk-Mane", "Necrozma-Dawn-Wings"]) expect(listedInPicker(hidden), hidden).toBe(false);
    expect(listedInPicker("Kyurem")).toBe(true);
    expect(listedInPicker("Necrozma")).toBe(true);
  });
});

describe("banned", () => {
  it("Eternamax Eternatus can't be had anywhere", async () => {
    const { legendPools } = await import("../src/game/legend");
    const { basePools } = await import("../src/game/scouting");
    expect(listedInPicker("Eternatus-Eternamax")).toBe(false);
    expect(Object.values(legendPools().legend).flat()).not.toContain("eternatuseternamax");
    expect(Object.values(basePools()).flat()).not.toContain("eternatuseternamax");
    expect(listedInPicker("Eternatus")).toBe(true);
  });
});

describe("picker duplicates", () => {
  it("no species shows twice in one generation except regional forms; Therian forms by drop-down", async () => {
    const { dex, formParts } = await import("../src/data/dex");
    const { pickableSpecies } = await import("../src/data/forms");
    const list = dex.species.all().filter((s: any) => pickableSpecies(s) && listedInPicker(s.name));
    const seen = new Map<string, string>();
    for (const s of list) {
      if (/(Alola|Galar|Hisui|Paldea)/.test(s.forme)) continue;
      const key = `${s.gen}:${formParts(s.id).name}`;
      expect(seen.get(key), `${s.name} vs ${seen.get(key)}`).toBeUndefined();
      seen.set(key, s.name);
    }
    for (const sp of ["Tornadus", "Thundurus", "Landorus", "Enamorus"]) {
      expect(listedInPicker(sp)).toBe(true);
      expect(listedInPicker(`${sp}-Therian`)).toBe(false);
      expect(formGroup(`${sp}-Therian`)).toBe(sp);
    }
    expect(genderForm("Indeedee", "F")).toBe("Indeedee-F");
  });
});
