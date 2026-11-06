import { describe, expect, it } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { dex, koAbility, koMove, koSpecies } from "../src/data/dex";
import { createGame, migrate } from "../src/game/state";
import { itemWishes, npcOf, npcTeam, ROLE_START_ITEMS, startingTera } from "../src/game/npc";
import { simulateMatch } from "../src/battle/engine";

const trainer = () => allTrainers().find(t => t.id === "paldea-네모")!;
const expected = [
  ["루가루암", "F", "모래헤치기", ["드릴라이너", "스톤에지", "스텔스록", "액셀록"]],
  ["꿈트렁", "M", "흙먹기", ["지진", "아이언테일", "록블라스트", "바디프레스"]],
  ["미끄래곤", "F", "초식", ["용의파동", "냉동빔", "오물폭탄", "탁류"]],
  ["빠르모트", "M", "축전", ["인파이트", "전광쌍격", "냉동펀치", "전광석화"]],
  ["노고고치", "M", "하늘의은총", ["똬리틀기", "하이퍼드릴", "드래곤다이브", "드릴라이너"]],
  ["웨이니발", "M", "급류", ["깨트리기", "아쿠아스텝", "제비반환", "아이스스피너"]],
];
const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "레드")!.id, name: "검증" });

describe("Nemona image lineup", () => {
  it("matches all six species, genders, abilities and 24 Korean move names in order", () => {
    const team = resolveTeam(trainer());
    expect(team.map(m => [koSpecies(m.species), m.gender, koAbility(m.ability), m.moves.map(koMove)])).toEqual(expected);
    expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
    for (const m of team) {
      expect(dex.abilities.get(m.ability).exists).toBe(true);
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      expect(m.moves.every(move => dex.moves.get(move).exists)).toBe(true);
    }
    expect(team[5].teraType).toBe("Water");
  });
  it("leaves items to the built-in NPC budget and wish rules rather than fixing six empty items", () => {
    const t = trainer(), st = game(), n = npcOf(st, t.id), team = npcTeam(st, t.id);
    expect(t.team.every(m => m && m.item === null && m.nature === null)).toBe(true);
    const equipped = team.filter(m => !!m.item);
    expect(equipped.length).toBe(ROLE_START_ITEMS[t.role] - (startingTera(t) ? 1 : 0));
    team.forEach((m, i) => {
      if (m.item) {
        expect(dex.items.get(m.item).exists).toBe(true);
        expect(itemWishes(t, String(i), m)).toContain(m.item);
      }
    });
    expect(Object.keys(n.items).length).toBeGreaterThan(0);
  });
  it.each(["species-only", "no-slots"])("updates existing NPC saves with %s slot history and preserves subsequent training", mode => {
    const st = game(), id = trainer().id, n = npcOf(st, id);
    if (mode === "species-only") n.slots = ["Lycanroc", "Goodra", "Dudunsparce", "Orthworm", "Pawmot", "Quaquaval"];
    else delete n.slots;
    n.care = { "0": { moves: ["Protect"] }, "2": { moves: ["Flamethrower"] } };
    const restored = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcTeam(restored, id).map(m => [koSpecies(m.species), m.gender, koAbility(m.ability), m.moves.map(koMove)])).toEqual(expected);
    const current = npcOf(restored, id);
    current.care = { "0": { evs: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } };
    migrate(restored);
    expect(npcOf(restored, id).care!["0"].evs!.hp).toBe(32);
  });
  it.each([false, true])("runs the image sets through the actual simulator (doubles=%s)", doubles => {
    const t = trainer(), foe = allTrainers().find(t => t.name === "テサ" || t.name === "테사")!;
    for (let i = 0; i < 3; i++) {
      const r = simulateMatch({ name: t.name, team: resolveTeam(t), gimmick: t.gimmick, skill: 0.75 }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: 0.95 }, "nemona" + i, { doubles });
      expect(r.picks[0]).toHaveLength(doubles ? 4 : 3);
      expect(r.turns).toBeGreaterThan(0);
      expect([-1, 0, 1]).toContain(r.winner);
    }
  });
});
