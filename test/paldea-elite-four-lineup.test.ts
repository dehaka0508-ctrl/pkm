import { describe, expect, it } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { dex, koAbility, koMove } from "../src/data/dex";
import { createGame, migrate } from "../src/game/state";
import { itemWishes, npcOf, npcTeam, ROLE_START_ITEMS, startingTera, slotMarks } from "../src/game/npc";
import { simulateMatch } from "../src/battle/engine";
import rankings from "../src/data/npc-items.json";

const expected: Record<string, [string, string, string, string[]][]> = {
  "칠리": [
    ["Whiscash", "M", "둔감", ["탁류", "대지의힘", "냉동빔", "스텔스록"]],
    ["Torterra", "F", "심록", ["지진", "씨폭탄", "아이언헤드", "바디프레스"]],
    ["Camerupt", "F", "마그마의무장", ["대지의힘", "분연", "러스터캐논", "하품"]],
    ["Donphan", "F", "옹골참", ["지진", "스톤에지", "아이언헤드", "독찌르기"]],
    ["Dugtrio", "M", "모래숨기", ["지진", "스톤샤워", "기습", "모래바람"]],
    ["Clodsire", "M", "저수", ["지진", "아쿠아브레이크", "맹독", "방어"]],
  ],
  "뽀삐": [
    ["Copperajah", "F", "우격다짐", ["10만마력", "치근거리기", "헤비봄버", "스텔스록"]],
    ["Bastiodon", "F", "옹골참", ["철벽", "메탈버스트", "바디프레스", "리플렉터"]],
    ["Corviknight", "M", "프레셔", ["더블윙", "철벽", "바디프레스", "아이언헤드"]],
    ["Magnezone", "", "옹골참", ["빛의장막", "트라이어택", "러스터캐논", "방전"]],
    ["Bronzong", "", "부유", ["지진", "아이언헤드", "사념의박치기", "아이스스피너"]],
    ["Tinkaton", "F", "틀깨기", ["거대해머", "치근거리기", "스톤에지", "깨트리기"]],
  ],
  "청목": [
    ["Tropius", "M", "엽록소", ["쾌청", "에어슬래시", "용의파동", "솔라빔"]],
    ["Altaria", "F", "자연회복", ["화염방사", "용의파동", "문포스", "냉동빔"]],
    ["Staraptor", "M", "위협", ["인파이트", "브레이브버드", "객기", "도둑질"]],
    ["Oricorio-Pom-Pom", "F", "무희", ["흔들흔들댄스", "잠재댄스", "에어슬래시", "얼어붙은바람"]],
    ["Flamigo", "M", "배짱", ["인파이트", "브레이브버드", "지옥찌르기", "아쿠아브레이크"]],
    ["Braviary", "M", "날카로운눈", ["인파이트", "브레이브버드", "암석봉인", "브레이크클로"]],
  ],
  "팔자크": [
    ["Noivern", "F", "틈새포착", ["분노의앞니", "용의파동", "에어슬래시", "하이퍼보이스"]],
    ["Dragalge", "M", "독가시", ["오물폭탄", "용의파동", "하이드로펌프", "10만볼트"]],
    ["Flapple", "F", "숙성", ["씨뿌리기", "드래곤다이브", "제비반환", "씨폭탄"]],
    ["Haxorus", "M", "틀깨기", ["드래곤클로", "아이언헤드", "깨물어부수기", "암석봉인"]],
    ["Dragonite", "M", "정신력", ["신속", "드래곤다이브", "불꽃펀치", "스톤에지"]],
    ["Baxcalibur", "M", "열교환", ["대검돌격", "고드름떨구기", "깨트리기", "아이언헤드"]],
  ],
};
const names = Object.keys(expected);
const trainer = (name: string) => allTrainers().find(t => t.id === "paldea-" + name)!;
const game = () => createGame({ mode: "trainer", slotId: "kanto-레드", name: "검증" });

describe("Paldea Elite Four image lineups", () => {
  it.each(names)("matches %s's six species, genders, abilities and 24 moves", name => {
    const team = resolveTeam(trainer(name));
    expect(team.map(m => [m.species, m.gender, koAbility(m.ability), m.moves.map(koMove)])).toEqual(expected[name]);
    team.forEach(m => {
      expect(m.placeholder || m.autoMoves).toBe(false);
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      expect(m.moves.every(x => dex.moves.get(x).exists)).toBe(true);
    });
  });
  it("keeps the pictured Tera aces and Larry's Electric/Flying Oricorio plus added Braviary", () => {
    for (const [name, slot, type] of [["칠리", 5, "Ground"], ["뽀삐", 5, "Steel"], ["청목", 4, "Flying"], ["팔자크", 5, "Dragon"]] as const) {
      expect(resolveTeam(trainer(name)).map(m => m.teraType)).toEqual(Array.from({ length: 6 }, (_, i) => i === slot ? type : null));
    }
    expect(dex.species.get(resolveTeam(trainer("청목"))[3].species).types).toEqual(["Electric", "Flying"]);
  });
  it.each(names)("uses the existing item rules and budget for %s with refreshed rankings", name => {
    const t = trainer(name), team = resolveTeam(t);
    expect(t.team.every(m => m?.item === null && m.nature === null)).toBe(true);
    team.forEach((m, i) => {
      const pre = (rankings as Record<string, { sp: string; items: string[] }>)[`${t.id}#${i}`];
      expect(pre.sp).toBe(dex.species.get(m.species).id);
      expect(pre.items.length).toBeGreaterThan(0);
      expect(itemWishes(t, String(i), m).slice(0, pre.items.length)).toEqual(pre.items);
    });
    expect(npcTeam(game(), t.id).filter(m => m.item)).toHaveLength(ROLE_START_ITEMS[t.role] - (startingTera(t) ? 1 : 0));
  });
  it.each(names)("refreshes %s's legacy saves once and preserves new training", name => {
    const t = trainer(name);
    for (const legacy of ["missing", "species"]) {
      const st = game(), n = npcOf(st, t.id);
      if (legacy === "missing") delete n.slots;
      else n.slots = resolveTeam(t).map(m => m.species);
      n.care = { "0": { moves: ["Protect"] } };
      const fresh = migrate(JSON.parse(JSON.stringify(st)));
      expect(npcOf(fresh, t.id).care?.["0"]).toBeUndefined();
      expect(npcOf(fresh, t.id).slots).toEqual(slotMarks(t));
      expect(npcTeam(fresh, t.id).map(m => m.moves)).toEqual(resolveTeam(t).map(m => m.moves));
      npcOf(fresh, t.id).care = { "0": { evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } } };
      expect(npcOf(migrate(JSON.parse(JSON.stringify(fresh))), t.id).care?.["0"]?.evs?.hp).toBe(252);
    }
  });
  it.each(names)("runs every %s slot through actual singles and doubles matches", name => {
    const t = trainer(name), foe = trainer(name === "칠리" ? "팔자크" : "칠리");
    for (const doubles of [false, true]) for (const second of [false, true]) {
      const picks = doubles ? (second ? [3, 4, 5, 0] : [0, 1, 2, 3]) : (second ? [3, 4, 5] : [0, 1, 2]);
      const result = simulateMatch({ name, team: resolveTeam(t), gimmick: t.gimmick, skill: 0.85, picks },
        { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: 0.85, picks }, `paldea-e4-${name}-${doubles}-${second}`, { doubles });
      expect(result.picks).toEqual([picks, picks]);
      expect(result.turns).toBeGreaterThan(0);
    }
  });
});
