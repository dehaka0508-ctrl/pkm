import { describe, expect, it } from "vitest";
import { allTrainers, resolveTeam } from "../src/game/lineups";
import { dex, koAbility, koMove } from "../src/data/dex";
import { createGame, migrate } from "../src/game/state";
import { itemWishes, npcOf, npcTeam, ROLE_START_ITEMS, startingTera } from "../src/game/npc";
import { simulateMatch } from "../src/battle/engine";
import rankings from "../src/data/npc-items.json";

const trainer = () => allTrainers().find(t => t.id === "galar-순무")!;
const game = () => createGame({ mode: "trainer", slotId: "kanto-레드", name: "검증" });
describe("Kabu image lineup plus Coalossal", () => {
  it("matches the five image sets and adds a defensive Coalossal", () => {
    const team = resolveTeam(trainer());
    expect(team.map(m => [m.species, koAbility(m.ability), m.moves.map(koMove)])).toEqual([
      ["Torkoal", "가뭄", ["히트스탬프", "스텔스록", "바디프레스", "지진"]],
      ["Ninetales", "타오르는불꽃", ["신통력", "불대문자", "전광석화", "솔라빔"]],
      ["Arcanine", "위협", ["플레어드라이브", "신속", "아이언헤드", "치근거리기"]],
      ["Salazzle", "부식", ["화염방사", "용의파동", "오물웨이브", "맹독"]],
      ["Centiskorch", "타오르는불꽃", ["불꽃채찍", "덤벼들기", "깨물어부수기", "파워휩"]],
      ["Coalossal", "불꽃몸", ["스텔스록", "고속스핀", "록블라스트", "화염방사"]],
    ]);
    expect(team.slice(0, 5).map(m => m.gender)).toEqual(["M", "F", "M", "F", "M"]);
    team.forEach(m => {
      expect(m.placeholder || m.autoMoves).toBe(false);
      expect(Object.values(dex.species.get(m.species).abilities)).toContain(m.ability);
      expect(m.moves.every(x => dex.moves.get(x).exists && !dex.moves.get(x).isMax)).toBe(true);
    });
  });
  it("uses the normal AI item rules and gym leader budget", () => {
    const t = trainer();
    expect(t.team.every(m => m?.item === null && m.nature === null)).toBe(true);
    resolveTeam(t).forEach((m, i) => {
      const pre = (rankings as Record<string, { sp: string; items: string[] }>)[`${t.id}#${i}`];
      expect(pre.sp).toBe(dex.species.get(m.species).id);
      expect(pre.items.length).toBeGreaterThan(0);
      expect(itemWishes(t, String(i), m).slice(0, pre.items.length)).toEqual(pre.items);
    });
    expect(npcTeam(game(), t.id).filter(m => m.item)).toHaveLength(ROLE_START_ITEMS[t.role] - (startingTera(t) ? 1 : 0));
  });
  it.each(["missing", "species"])("updates %s legacy slot history once and preserves subsequent training", legacy => {
    const t = trainer(), st = game(), n = npcOf(st, t.id);
    if (legacy === "missing") delete n.slots;
    else n.slots = ["Ninetales", "Arcanine", "Centiskorch", "", "", ""];
    n.care = { "0": { moves: ["Protect"] } };
    const fresh = migrate(JSON.parse(JSON.stringify(st)));
    expect(npcOf(fresh, t.id).care?.["0"]).toBeUndefined();
    expect(npcTeam(fresh, t.id).map(m => m.moves)).toEqual(resolveTeam(t).map(m => m.moves));
    npcOf(fresh, t.id).care = { "0": { evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } } };
    expect(npcOf(migrate(JSON.parse(JSON.stringify(fresh))), t.id).care?.["0"]?.evs?.hp).toBe(252);
  });
  it.each([false, true])("can field all six in actual battles (doubles=%s)", doubles => {
    const t = trainer(), foe = allTrainers().find(t => t.id === "paldea-곤포")!;
    for (const second of [false, true]) {
      const picks = doubles ? (second ? [3, 4, 5, 0] : [0, 1, 2, 3]) : (second ? [3, 4, 5] : [0, 1, 2]);
      const result = simulateMatch({ name: t.name, team: resolveTeam(t), gimmick: t.gimmick, skill: 0.85, picks },
        { name: foe.name, team: resolveTeam(foe), gimmick: foe.gimmick, skill: 0.85, picks }, `kabu-${doubles}-${second}`, { doubles });
      expect(result.picks).toEqual([picks, picks]);
      expect(result.turns).toBeGreaterThan(0);
    }
  });
});
