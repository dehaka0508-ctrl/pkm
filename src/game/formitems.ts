// Items that come and go with a Pokémon (Arceus' plate, the Origin orbs, Deoxys' Meteorite, Calyrex's Reins…)
// and the key items used on a Pokémon to change its form.
import { DEOXYS_CYCLE, fixedItems, pickItems } from "../data/forms";
import { dex, koSpecies } from "../data/dex";
import type { GameState } from "./state";
import type { OwnedMon } from "./types";
import { addItem, bagCount, takeItem } from "./shop";
import { SQUAD_MAX } from "./scouting";
import { COMPETITION_NAMES, registrationOf, type Competition } from "./registration";

/** Gives the items that come with a Pokémon: its fixed ones and, when it has a choice, the one picked. */
export function grantFormItems(state: GameState, m: OwnedMon, pick?: string): string[] {
  const given = [...fixedItems(m.species)];
  const choices = pickItems(m.species);
  if (pick && choices.includes(pick)) given.push(pick);
  const bound = (m.bound ||= []);
  for (const k of given) {
    if (bound.includes(k)) continue;
    bound.push(k);
    addItem(state, k);
  }
  return given;
}

/** A Pokémon leaves: the items that came with it go too (from the bag, or from whoever holds them). */
export function dropFormItems(state: GameState, m: OwnedMon) {
  for (const k of m.bound || []) {
    const holder = [m, ...state.player.squad].find(x => x.item === k);
    if (holder) holder.item = "";
    else takeItem(state, k);
  }
  m.bound = [];
  if (m.fused) dropFormItems(state, m.fused);
}

/** Items that came with a squad Pokémon can't be sold. */
export const isBoundItem = (state: GameState, key: string) => state.player.squad.some(m => m.bound?.includes(key) || m.fused?.bound?.includes(key));

/** Key items this Pokémon can use now. */
export function usableKeyItems(state: GameState, m: OwnedMon): string[] {
  const base = dex.species.get(dex.species.get(m.species).baseSpecies).id;
  const want = base === "deoxys" ? "key:meteorite" : base === "hoopa" ? "key:prisonbottle" : FUSIONS[base]?.item || "";
  return want && bagCount(state, want) > 0 ? [want] : [];
}

/** Uses a key item on a Pokémon (the item stays). Returns an error or the message to show. */
export function useKeyItem(state: GameState, m: OwnedMon, key: string): { err?: string; ok?: string } {
  if (!usableKeyItems(state, m).includes(key)) return { err: "사용할 수 없습니다." };
  const s = dex.species.get(m.species);
  if (key === "key:meteorite") {
    const i = DEOXYS_CYCLE.indexOf(s.name);
    m.species = DEOXYS_CYCLE[(i + 1) % DEOXYS_CYCLE.length];
    return { ok: `${koSpecies(m.species)}(으)로 모습이 바뀌었다!` };
  }
  if (key === "key:prisonbottle") {
    m.species = s.name === "Hoopa" ? "Hoopa-Unbound" : "Hoopa";
    m.ability = dex.species.get(m.species).abilities[0];
    return { ok: `${koSpecies(m.species)}(으)로 모습이 바뀌었다!` };
  }
  return toggleFusion(state, m);
}

/** Fusions: the base Pokémon takes in a partner from the squad (the first in squad order); they part again. */
export const FUSIONS: Record<string, { item: string | null; partners: Record<string, string> }> = {
  calyrex: { item: "key:reins", partners: { glastrier: "Calyrex-Ice", spectrier: "Calyrex-Shadow" } },
  kyurem: { item: "key:dnasplicers", partners: { reshiram: "Kyurem-White", zekrom: "Kyurem-Black" } },
  // Necrozma needs no item: the [진화] list offers the fusion
  necrozma: { item: null, partners: { solgaleo: "Necrozma-Dusk-Mane", lunala: "Necrozma-Dawn-Wings" } },
};
const fusionOf = (m: OwnedMon) => FUSIONS[dex.species.get(dex.species.get(m.species).baseSpecies).id];

/** The partner it would fuse with now (first in squad order), or null. */
export function fusionPartner(state: GameState, m: OwnedMon): OwnedMon | null {
  const f = fusionOf(m);
  if (!f || m.fused || dex.species.get(m.species).forme) return null;
  return state.player.squad.find(x => x !== m && dex.species.get(x.species).id in f.partners) || null;
}

/** Fuses with the partner, or parts when already fused. */
export function toggleFusion(state: GameState, m: OwnedMon): { err?: string; ok?: string } {
  const p = state.player;
  const f = fusionOf(m);
  if (!f) return { err: "합체할 수 없는 포켓몬입니다." };
  const base = dex.species.get(m.species).baseSpecies;
  if (m.fused) {
    if (p.squad.length >= SQUAD_MAX) return { err: `스쿼드가 가득 차 분리할 수 없습니다 (최대 ${SQUAD_MAX}마리).` };
    const partner = m.fused;
    delete m.fused;
    m.species = base;
    m.ability = m.ownAbility || dex.species.get(base).abilities[0];
    delete m.ownAbility;
    p.squad.splice(p.squad.indexOf(m) + 1, 0, partner);
    return { ok: `${koSpecies(partner.species)}와(과) 분리되었다!` };
  }
  if (dex.species.get(m.species).forme) return { err: `이 ${koSpecies(base)}는(은) 분리할 수 없습니다.` };
  const partner = fusionPartner(state, m);
  if (!partner) return { err: `스쿼드에 ${Object.keys(f.partners).map(id => koSpecies(dex.species.get(id).name)).join("나 ")}가 없습니다.` };
  const reg = (Object.keys(COMPETITION_NAMES) as Competition[]).filter(c => registrationOf(state, c)?.uids.includes(partner.uid));
  if (reg.length) return { err: `${koSpecies(partner.species)}는(은) ${reg.map(c => COMPETITION_NAMES[c]).join("·")}에 등록되어 있어 합체할 수 없습니다.` };
  const form = f.partners[dex.species.get(partner.species).id];
  p.squad = p.squad.filter(x => x !== partner);
  p.entry = p.entry.filter(u => u !== partner.uid);
  delete p.plan[partner.uid];
  m.fused = partner;
  m.ownAbility = m.ability;
  m.species = form;
  m.ability = dex.species.get(form).abilities[0];
  return { ok: `${koSpecies(form)}(으)로 합체했다!` };
}
