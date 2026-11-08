// 새출발 (fresh start): every trainer's six from Lv.5 first stages, rookie fame and ground, growing week by week.
import { describe, it, expect } from "vitest";
import { createGame, migrate } from "../src/game/state";
import { allTrainers, resolveTeam, trainerById } from "../src/game/lineups";
import { npcGimmick, npcOf, npcTeam } from "../src/game/npc";
import { evoChain, freshTeam, growFresh, isFirstStage, nextEvolution, freshMon } from "../src/game/fresh";
import { freshGrowth } from "../src/game/ai/controller";
import { Rng } from "../src/game/rng";
import { dex } from "../src/data/dex";

const champ = allTrainers().find(t => t.role === "챔피언")!;
const other = allTrainers().find(t => t.id !== champ.id && t.role === "관장")!;

describe("fresh start", () => {
  it("NPCs start from Lv.5 first stages with a rookie's means", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    expect(st.fresh).toBe("seed1");
    for (const t of allTrainers()) {
      if (t.id === champ.id) continue;
      const n = npcOf(st, t.id);
      expect(n.lineup!.length).toBe(resolveTeam(t).length);
      expect(n.money).toBe(90000);
      expect(n.reputation).toBe(10);
      expect(n.seats).toBe(0);
      expect(Object.values(n.items).filter(Boolean)).toEqual([]);
      expect(n.tera).toBeNull();
      expect(npcGimmick(st, t.id)).toBeNull();
      n.lineup!.forEach((m, i) => {
        expect(m.level).toBe(5);
        expect(isFirstStage(m.species)).toBe(true);
        // it grows into the lineup's own Pokémon
        expect(evoChain(m.target!)).toContain(dex.species.get(m.species).name);
        expect(dex.species.get(m.target!).name).toBe(dex.species.get(resolveTeam(t)[i].species).name);
        expect(m.moves.length).toBeGreaterThan(0);
      });
    }
    // the same seed gives the same six (the start screen shows them before the game is made)
    expect(npcOf(st, other.id).lineup).toEqual(freshTeam(other, "seed1"));
    // and another start rolls new ones
    expect(freshTeam(other, "seed2").map(m => m.nature + m.ability + JSON.stringify(m.ivs))).not.toEqual(freshTeam(other, "seed1").map(m => m.nature + m.ability + JSON.stringify(m.ivs)));
  });

  it("taking over a trainer on a fresh start gives its Lv.5 six and a rookie's fame and ground", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    const p = st.player;
    expect(p.squad.map(m => m.species)).toEqual(freshTeam(trainerById(champ.id)!, "seed1").map(m => m.species));
    for (const m of p.squad) {
      expect(m.level).toBe(5);
      expect(m.item).toBe("");
      expect(m.teraType).toBeNull();
      expect((m as any).target).toBeUndefined();
    }
    expect(p.reputation).toBe(10);
    expect(p.facilities.seats).toBe(0);
    expect(p.gimmick).toBeNull();
    // without 새출발 the champion keeps its finished six and its fame
    const done = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    expect(done.fresh).toBeUndefined();
    expect(done.player.reputation).toBeGreaterThan(10);
    expect(npcOf(done, other.id).lineup).toBeUndefined();
  });

  it("growing: levels, evolutions toward the target, new moves", () => {
    const m = freshMon("Charizard", "x#0", new Rng("g"));
    expect(m.species).toBe("Charmander");
    expect(nextEvolution(m)).toEqual({ species: "Charmeleon", level: 16 });
    for (let w = 0; w < 30; w++) growFresh(m, 200, "s");
    expect(m.species).toBe("Charizard");
    expect(m.level).toBeGreaterThanOrEqual(36);
    // regional and item evolutions follow the lineup's line (Pichu → Pikachu → Alolan Raichu)
    const r = freshMon("Raichu-Alola", "x#1", new Rng("g"));
    expect(r.species).toBe("Pichu");
    for (let w = 0; w < 30; w++) growFresh(r, 200, "s");
    expect(r.species).toBe("Raichu-Alola");
    // a female-only evolution comes from a female
    expect(freshMon("Froslass", "x#2", new Rng("g")).gender).toBe("F");
  });

  it("NPC weeks grow their six", () => {
    const st = createGame({ mode: "trainer", slotId: champ.id, name: "나", fresh: "seed1" });
    const before = npcTeam(st, other.id).map(m => m.level);
    for (let w = 0; w < 12; w++) freshGrowth(st, other.id);
    const n = npcOf(st, other.id);
    expect(n.lineup!.every(m => m.level > 5)).toBe(true);
    expect(npcTeam(st, other.id).map(m => m.level)).not.toEqual(before);
    // the save keeps the growing six
    const back = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcOf(back, other.id).lineup).toEqual(n.lineup);
  });

  it("rookie and custom starts in a fresh world", () => {
    const st = createGame({ mode: "custom", slotId: other.id, name: "나", fresh: "s", customTeam: [{ species: "Bulbasaur", level: 5, ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 }, nature: "Bold", ability: "Overgrow", moves: ["tackle"] }] });
    expect(st.fresh).toBe("s");
    expect(st.player.squad[0].level).toBe(5);
    expect(npcOf(st, champ.id).lineup!.every(m => m.level === 5)).toBe(true);
  });
});

describe("start settings", () => {
  const mon = { species: "Bulbasaur", level: 50, ivs: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 }, nature: "Bold", ability: "Overgrow", moves: ["tackle"] };
  it("새출발: every player start is a rookie's (fame, rented ground, ₽90,000)", () => {
    for (const mode of ["trainer", "scout", "custom"] as const) {
      const st = createGame({ mode, slotId: champ.id, name: "나", fresh: "s", customTeam: [mon], scoutPicks: [], ownGround: true });
      expect(st.player.money).toBe(90000);
      expect(st.player.reputation).toBe(10);
      expect(st.player.facilities.seats).toBe(0);
    }
  });
  it("완성: rookie and custom starts are a rookie's; custom may own its 1,000-seat ground; a trainer keeps its own", () => {
    const rookie = createGame({ mode: "scout", slotId: champ.id, name: "나", scoutPicks: [] });
    expect([rookie.player.money, rookie.player.reputation, rookie.player.facilities.seats]).toEqual([90000, 10, 0]);
    const rent = createGame({ mode: "custom", slotId: champ.id, name: "나", customTeam: [mon] });
    expect([rent.player.money, rent.player.reputation, rent.player.facilities.seats]).toEqual([90000, 10, 0]);
    const own = createGame({ mode: "custom", slotId: champ.id, name: "나", customTeam: [mon], ownGround: true });
    expect(own.player.facilities.seats).toBe(1000);
    const t = createGame({ mode: "trainer", slotId: champ.id, name: "나" });
    expect(t.player.money).toBe(60000);
    expect(t.player.reputation).toBeGreaterThan(10);
  });
});

describe("nicknames", () => {
  it("are trimmed, capped, and cleared by an empty name", async () => {
    const { setNickname, NICKNAME_MAX } = await import("../src/game/training");
    const { nickOr } = await import("../src/data/dex");
    const m: any = { species: "Pikachu" };
    setNickname(m, "  번개돌이  ");
    expect(m.nickname).toBe("번개돌이");
    expect(nickOr(m)).toBe("번개돌이");
    setNickname(m, "가".repeat(20));
    expect([...m.nickname].length).toBe(NICKNAME_MAX);
    setNickname(m, " ");
    expect(m.nickname).toBeUndefined();
    expect(nickOr(m)).toBe("피카츄");
  });
});

describe("올림박사 / 투로박사 on a fresh start", () => {
  const sp = (s: string) => dex.species.get(s).name;
  it("start as the modern relatives of their Paradox Pokémon", () => {
    const olim = freshTeam(trainerById("paldea-올림박사")!, "p").map(m => m.species).sort();
    const turo = freshTeam(trainerById("paldea-투로박사")!, "p").map(m => m.species).sort();
    expect(olim).toEqual(["Bagon", "Foongus", "Igglybuff", "Larvesta", "Magnemite", "Misdreavus"].sort());
    expect(turo).toEqual(["Deino", "Delibird", "Larvesta", "Makuhita", "Larvitar", "Ralts"].sort());
  });

  it("become the Paradox form at the relative's last step: moves it can't have go, nature stays, Protosynthesis / Quark Drive", () => {
    const moon = freshMon("Roaring Moon", "o#5", new Rng("p"));
    const nature = moon.nature;
    for (let w = 0; w < 40 && moon.species !== "Roaring Moon"; w++) growFresh(moon, 200, "s");
    expect(moon.species).toBe("Roaring Moon");
    expect(moon.level).toBeGreaterThanOrEqual(50);
    expect([moon.ability, moon.gender, moon.nature]).toEqual(["Protosynthesis", "", nature]);
    // 코일 skips 레어코일: 모래털가죽 at Lv.30
    const shocks = freshMon("Sandy Shocks", "o#4", new Rng("p"));
    expect(nextEvolution(shocks)).toEqual({ species: "Sandy Shocks", level: 30 });
    // 딜리버드 at Lv.36
    expect(nextEvolution(freshMon("Iron Bundle", "t#1", new Rng("p")))).toEqual({ species: "Iron Bundle", level: 36 });
    const valiant = freshMon("Iron Valiant", "t#5", new Rng("p"));
    valiant.moves = ["confusion", "growl", "teleport", "doubleteam"];
    for (let w = 0; w < 20 && valiant.species !== "Iron Valiant"; w++) growFresh(valiant, 200, "s");
    expect(valiant.species).toBe("Iron Valiant");
    expect(valiant.ability).toBe("Quark Drive");
  });

  it("the player taking one over evolves them by hand into the Paradox forms", async () => {
    const { evolutionOptions } = await import("../src/game/moves");
    const { evolve } = await import("../src/game/training");
    const st = createGame({ mode: "trainer", slotId: "paldea-투로박사", name: "나", fresh: "p" });
    const deino = st.player.squad.find(m => m.species === "Deino")!;
    expect(deino.target).toBe("Iron Jugulis");
    deino.level = 50;
    expect(evolutionOptions(deino.species, deino.level, false, deino.target)).toEqual([{ id: "zweilous", how: "Lv.50", ready: true }]);
    evolve(deino, "zweilous");
    expect(evolutionOptions(deino.species, 63, false, deino.target)[0]).toMatchObject({ id: "ironjugulis", ready: false });
    deino.level = 64;
    const keep = deino.nature;
    deino.moves = ["darkpulse", "tackle", "dragonbreath", "bite"];
    evolve(deino, "ironjugulis");
    expect(deino.species).toBe("Iron Jugulis");
    expect([deino.ability, deino.nature, deino.gender]).toEqual(["Quark Drive", keep, ""]);
    const { allLearnableMoves } = await import("../src/game/moves");
    const can = new Set(allLearnableMoves("Iron Jugulis"));
    expect(deino.moves.every(m => can.has(m))).toBe(true);
    // without 새출발 they keep their finished six
    expect(createGame({ mode: "trainer", slotId: "paldea-투로박사", name: "나" }).player.squad.every(m => !m.target)).toBe(true);
  });

  it("the note: researching → bringing them → none", async () => {
    const { paradoxNote } = await import("../src/game/fresh");
    const six = freshTeam(trainerById("paldea-올림박사")!, "p");
    expect(paradoxNote("paldea-올림박사", six, six)).toBe("고대의 포켓몬에 대해 연구 중");
    expect(paradoxNote("paldea-투로박사", six, six)).toBe("미래의 포켓몬에 대해 연구 중");
    const some = six.map((m, i) => (i === 0 ? { ...m, species: m.target! } : m));
    expect(paradoxNote("paldea-올림박사", some, some)).toBe("고대의 포켓몬 데려오는 중");
    const all = six.map(m => ({ ...m, species: m.target! }));
    expect(paradoxNote("paldea-올림박사", all, all)).toBeNull();
    expect(paradoxNote(champ.id, six, six)).toBeNull();
  });
});
