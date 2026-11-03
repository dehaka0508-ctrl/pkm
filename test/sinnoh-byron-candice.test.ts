import { it, expect } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";

it("신오 동관·무청·멜리사: user lineups", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  expect(team("sinnoh-동관").map(m => m.species)).toEqual(["Skarmory", "Steelix", "Magnezone", "Bastiodon", "Aggron", "Forretress"]);
  expect(team("sinnoh-무청").map(m => m.species)).toEqual(["Weavile", "Mamoswine", "Abomasnow", "Froslass", "Glaceon", "Glalie"]);
  for (const id of ["sinnoh-동관", "sinnoh-무청", "sinnoh-멜리사"]) expect(team(id).every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
  expect(team("sinnoh-멜리사")[4].item).toBe("Sitrus Berry");
  expect(team("sinnoh-무청")[5].item).toBe("Rock Gem");
  expect(team("sinnoh-전진").map(m => m.species)).toEqual(["Jolteon", "Raichu", "Luxray", "Lanturn", "Electivire", "Electrode"]);
  expect(team("sinnoh-전진").every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});

it("신오 빛나·용식: user lineups (빛나: 6V, natures, EVs)", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  const dawn = team("sinnoh-빛나");
  expect(dawn.map(m => m.species)).toEqual(["Wormadam-Trash", "Magmortar", "Froslass", "Milotic", "Clefable", "Torterra"]);
  expect(dawn.every(m => Object.values(m.ivs).every(v => v === 31))).toBe(true);
  expect(dawn[5].evs).toEqual({ hp: 128, atk: 252, def: 128, spa: 0, spd: 0, spe: 0 });
  expect(dawn[1].nature).toBe("Modest");
  expect(team("sinnoh-용식").map(m => m.species)).toEqual(["Staraptor", "Heracross", "Snorlax", "Rapidash", "Roserade", "Empoleon"]);
  for (const id of ["sinnoh-빛나", "sinnoh-용식"]) expect(team(id).every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});

it("신오 광휘: DP 국룰 조합, every DP HM somewhere on the team", () => {
  const team = resolveTeam(allTrainers().find(x => x.id === "sinnoh-광휘")!);
  expect(team.map(m => m.species)).toEqual(["Infernape", "Bibarel", "Staraptor", "Luxray", "Gyarados", "Weavile"]);
  const id = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const moves = team.flatMap(m => m.moves.map(id));
  for (const hm of ["cut", "fly", "surf", "strength", "defog", "rocksmash", "waterfall", "rockclimb"]) expect(moves).toContain(hm);
  expect(team[1].moves.map(id)).toEqual(["cut", "surf", "strength", "rockclimb"]);
  expect(team[4].moves.map(id)).toContain("waterfall");
});

it("5세대 명희, 6~9세대 남자 주인공: fire-starter playthrough teams", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  const starters: Record<string, string> = { "unova-명희": "Samurott", "kalos-칼름": "Greninja", "alola-영태": "Incineroar", "galar-승재": "Cinderace", "paldea-보민": "Skeledirge" };
  for (const [id, sp] of Object.entries(starters)) {
    const t = team(id);
    expect(t[0].species).toBe(sp);
    expect(t.every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4 && m.item && m.nature)).toBe(true);
  }
});

it("하나 노간주: user lineup", () => {
  const team = resolveTeam(allTrainers().find(x => x.id === "unova-노간주")!);
  expect(team.map(m => m.species)).toEqual(["Accelgor", "Bouffalant", "Escavalier", "Vanilluxe", "Druddigon", "Volcarona"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});

it("하나 아이리스: user lineup (B2W2 champion)", () => {
  const team = resolveTeam(allTrainers().find(x => x.id === "unova-아이리스")!);
  expect(team.map(m => m.species)).toEqual(["Hydreigon", "Salamence", "Aggron", "Archeops", "Lapras", "Haxorus"]);
  expect(team.map(m => m.item)).toEqual(["Wise Glasses", "Life Orb", "Muscle Band", "Flying Gem", "Zoom Lens", "Focus Sash"]);
});

it("신오 태홍: user lineup", () => {
  const team = resolveTeam(allTrainers().find(x => x.id === "sinnoh-태홍")!);
  expect(team.map(m => m.species)).toEqual(["Houndoom", "Crobat", "Gyarados", "Honchkrow", "Weavile", "Rotom-Heat"]);
  expect(team[5].evs).toEqual({ hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 });
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});

it("신오 마박사: user lineup and own sprite; 태홍's Heat Rotom holds Choice Specs", () => {
  const t = allTrainers().find(x => x.id === "sinnoh-마박사")!;
  expect(t.sprite).toBe("rowan");
  const team = resolveTeam(t);
  expect(team.map(m => m.species)).toEqual(["Clefable", "Golem", "Heracross", "Snorlax", "Probopass", "Ursaluna"]);
  expect(team.every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
  expect(resolveTeam(allTrainers().find(x => x.id === "sinnoh-태홍")!)[5].item).toBe("Choice Specs");
});

it("신오 베테랑 트레이너·포켓몬 레인저: user-picked Pokémon, full sets", () => {
  const t = (n: string) => resolveTeam(allTrainers().find(x => x.region === "sinnoh" && x.name === n)!);
  expect(t("베테랑 트레이너").map(m => m.species)).toEqual(["Staraptor", "Hippowdon", "Drapion", "Golem", "Gengar", "Empoleon"]);
  expect(t("포켓몬 레인저").map(m => m.species)).toEqual(["Skarmory", "Torkoal", "Exeggutor", "Azumarill", "Floatzel", "Ursaring"]);
  for (const n of ["베테랑 트레이너", "포켓몬 레인저"]) expect(t(n).every(m => !m.placeholder && !m.autoMoves && m.item && m.nature)).toBe(true);
});

it("하나 사천왕: user lineups", () => {
  const team = (id: string) => resolveTeam(allTrainers().find(x => x.id === id)!);
  expect(team("unova-망초").map(m => m.species)).toEqual(["Cofagrigus", "Mismagius", "Froslass", "Drifblim", "Golurk", "Chandelure"]);
  expect(team("unova-블래리").map(m => m.species)).toEqual(["Sharpedo", "Scrafty", "Krookodile", "Liepard", "Drapion", "Bisharp"]);
  expect(team("unova-카를레야").map(m => m.species)).toEqual(["Musharna", "Sigilyph", "Gothitelle", "Gallade", "Reuniclus", "Metagross"]);
  expect(team("unova-연무").map(m => m.species)).toEqual(["Throh", "Sawk", "Lucario", "Mienshao", "Medicham", "Conkeldurr"]);
  expect(team("unova-망초")[3].item).toBe("Flying Gem");
  for (const id of ["unova-망초", "unova-블래리", "unova-카를레야", "unova-연무"]) expect(team(id).every(m => !m.placeholder && !m.autoMoves && m.moves.length === 4)).toBe(true);
});
