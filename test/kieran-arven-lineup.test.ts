import { describe, expect, it } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { dex, koAbility, koItem, koMove, koNature, koSpecies } from "../src/data/dex";
import { createGame, migrate } from "../src/game/state";
import { npcOf, npcTeam, ROLE_START_ITEMS, startingTera } from "../src/game/npc";
import { simulateMatch } from "../src/battle/engine";

const trainer = (name: string) => allTrainers().find(t => t.id === "paldea-" + name)!;
const kieran = [
  ["망나뇽", "M", "멀티스케일", "달인의띠", "냉정", ["폭풍", "와이드브레이커", "번개", "신속"]],
  ["왕구리", "M", "잔비", "초나열매", "조심", ["웨더볼", "냉동빔", "사이코키네시스", "도우미"]],
  ["폴리곤Z", "", "적응력", "생명의구슬", "겁쟁이", ["파괴광선", "10만볼트", "냉동빔", "섀도볼"]],
  ["어흥염", "M", "위협", "자뭉열매", "고집", ["플레어드라이브", "DD래리어트", "깨트리기", "속이기"]],
  ["오롱털", "M", "짓궂은마음", "기합의띠", "장난꾸러기", ["소울크래시", "기습", "리플렉터", "빛의장막"]],
  ["과미드라", "M", "감미로운꿀", "돌격조끼", "조심", ["변덕레이저", "테라버스트", "대지의힘", "자이로볼"]],
];
const arven = [
  ["요씽리스", "M", "볼주머니", ["누르기", "지진", "사이코팽", "씨기관총"]],
  ["콜로솔트", "M", "정화의소금", ["스텔스록", "지진", "바디프레스", "스톤에지"]],
  ["육파리", "F", "균사의힘", ["버섯포자", "파워휩", "오물폭탄", "대지의힘"]],
  ["스코빌런", "F", "엽록소", ["불대문자", "에너지볼", "사념의박치기", "깨물어부수기"]],
  ["파르셀", "M", "스킬링크", ["록블라스트", "빛의장막", "아쿠아브레이크", "고드름침"]],
  ["마피티프", "M", "위협", ["깨물어부수기", "치근거리기", "불꽃엄니", "사이코팽"]],
];
const game = () => createGame({ mode: "trainer", slotId: allTrainers().find(t => t.name === "레드")!.id, name: "검증" });

describe("Kieran and Arven image lineups", () => {
  it("matches Kieran's Pokémon, genders, abilities, items, natures and all 24 moves", () => {
    const team = resolveTeam(trainer("카지"));
    expect(team.map(m => [koSpecies(m.species), m.gender, koAbility(m.ability), koItem(m.item), koNature(m.nature), m.moves.map(koMove)])).toEqual(kieran);
    expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
    expect(team[5].teraType).toBe("Fighting");
  });
  it("keeps all six perfect IVs and the exact image EV spreads, including Modest Politoed's HP/Defense spread", () => {
    const team = resolveTeam(trainer("카지"));
    expect(team.every(m => Object.values(m.ivs).every(v => v === 31))).toBe(true);
    expect(team.map(m => m.evs)).toEqual([
      { hp: 252, atk: 0, def: 0, spa: 252, spd: 0, spe: 4 },
      { hp: 252, atk: 0, def: 252, spa: 0, spd: 0, spe: 4 },
      { hp: 0, atk: 0, def: 4, spa: 252, spd: 0, spe: 252 },
      { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 4 },
      { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
      { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 },
    ]);
  });
  it("matches Arven's six Pokémon, genders, abilities and all 24 moves", () => {
    const t = trainer("페퍼"), team = resolveTeam(t);
    expect(team.map(m => [koSpecies(m.species), m.gender, koAbility(m.ability), m.moves.map(koMove)])).toEqual(arven);
    expect(team.every(m => !m.placeholder && !m.autoMoves)).toBe(true);
    expect(t.team.every(m => m?.item === null && m.nature === null)).toBe(true);
    expect(team[5].teraType).toBe("Dark");
    expect(npcTeam(game(), t.id).filter(m => m.item).length).toBe(ROLE_START_ITEMS[t.role] - (startingTera(t) ? 1 : 0));
  });
  it.each(["카지", "페퍼"])("resolves only valid moves and abilities for %s and can complete singles and doubles", name => {
    const t = trainer(name), team = resolveTeam(t);
    for (const m of team) {
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      expect(m.moves.every(move => dex.moves.get(move).exists)).toBe(true);
    }
    const foe = trainer(name === "카지" ? "페퍼" : "카지");
    for (const doubles of [false, true]) {
      const r = simulateMatch({ name, team, gimmick: t.gimmick, skill: 0.85 }, { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: 0.85 }, "paldea-image-" + name, { doubles });
      expect(r.picks[0]).toHaveLength(doubles ? 4 : 3); expect(r.turns).toBeGreaterThan(0);
    }
  });
  it.each(["카지", "페퍼"])("refreshes %s's old species-only slot history without retaining stale moves", name => {
    const st = game(), id = trainer(name).id, n = npcOf(st, id);
    n.slots = resolveTeam(trainer(name)).map(m => m.species);
    n.care = { "0": { moves: ["Protect"] } };
    const fresh = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcOf(fresh, id).care?.["0"]).toBeUndefined();
    expect(npcTeam(fresh, id).map(m => m.moves)).toEqual(resolveTeam(trainer(name)).map(m => m.moves));
  });
});
