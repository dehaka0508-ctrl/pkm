// Forms that follow a held item or a move (Arceus' plates, Silvally's memories, Genesect's drives, Ogerpon's masks,
// the Origin orbs, Shaymin's Gracidea, Keldeo's Secret Sword), the game's own key items, and the pickers' form groups.
import { dex } from "./dex";

/** Key items that only exist in this game (not in the battle data). */
export const KEY_ITEMS: Record<string, { ko: string; img: string; desc: string }> = {
  "key:gracidea": { ko: "그라데시아꽃", img: "gracidea", desc: "쉐이미에게 지니게 하면 스카이폼이 된다. 빼면 원래대로 돌아온다." },
  "key:meteorite": { ko: "운석", img: "hard_meteorite", desc: "테오키스에게 사용하면 노말폼 → 어택폼 → 디펜스폼 → 스피드폼 순서로 모습이 바뀐다. 써도 없어지지 않는다." },
  "key:prisonbottle": { ko: "비추는 거울", img: "prison_bottle", desc: "후파에게 사용하면 굴레를 벗어난 모습이 되거나 원래대로 돌아온다. 써도 없어지지 않는다." },
  "key:dnasplicers": { ko: "유전자쐐기", img: "dna_splicers", desc: "큐레무에게 사용하면 스쿼드의 레시라무나 제크로무와 합체한다. 한 번 더 사용하면 분리된다." },
  "key:reins": { ko: "유대의 고삐", img: "icy_reins_of_unity", desc: "버드렉스에게 사용하면 스쿼드의 블리자포스나 레이스포스와 합체한다. 한 번 더 사용하면 분리된다." },
  "key:scrolldark": { ko: "악의 족자", img: "scroll_of_darkness", desc: "치고마를 일격의 태세 우라오스로 진화시킨다." },
  "key:scrollwater": { ko: "물의 족자", img: "scroll_of_waters", desc: "치고마를 연격의 태세 우라오스로 진화시킨다." },
};
export const isKeyItem = (key: string) => key in KEY_ITEMS;

/** Dynamax items (this game's own): 다이버섯 held lets a Pokémon Dynamax; 다이수프 gives a Gigantamax-capable one its G-Max factor. */
export const GIMMICK_ITEMS: Record<string, { ko: string; img: string; desc: string }> = {
  "gim:maxsoup": { ko: "다이수프", img: "max_elixir", desc: "거다이맥스할 수 있는 포켓몬에게 먹이면 다이맥스할 때 거다이맥스하게 된다." },
  "gim:maxmushroom": { ko: "다이버섯", img: "max_mushrooms", desc: "포켓몬에게 먹이면 배틀 중 다이맥스할 수 있게 된다. 다이맥스는 3턴 동안 HP가 늘고 기술이 다이맥스기술이 된다." },
};
export const MAX_MUSHROOM = "gim:maxmushroom";
/** Can Dynamax in battle: fed 다이버섯 and not holding a Mega Stone / Z-Crystal (the held item comes first). */
export const canDynamaxMon = (m: { dynamax?: boolean; item?: string }) => !!m.dynamax && !(m.item && (dex.items.get(m.item).megaStone || dex.items.get(m.item).zMove));
/** Battle items the simulator doesn't know: held in this game only (not passed to a battle). */
export const isGameOnlyItem = (key: string) => isKeyItem(key) || key in GIMMICK_ITEMS || key in EXTRA_EVO_ITEMS;

/** Evolution items sold in the shop that the battle data doesn't have. */
export const EXTRA_EVO_ITEMS: Record<string, { ko: string; img: string; desc: string }> = {
  "evo:linkingcord": { ko: "연결의 끈", img: "linking_cord", desc: "통신교환으로 진화하는 포켓몬(윤겔라·근육몬·데구리·고우스트·딱정곤 등)을 진화시킨다." },
  "evo:coins": { ko: "모으령의코인 999개", img: "amulet_coin", desc: "모으령을 타부자고로 진화시킨다." },
};

const ITEM_FORM_BASES = ["Arceus", "Silvally", "Genesect", "Ogerpon", "Dialga", "Palkia", "Giratina"];
let itemForms: Record<string, Record<string, string>> | null = null;
/** base species id → held item name → forme name */
function itemFormTable() {
  if (itemForms) return itemForms;
  const out: Record<string, Record<string, string>> = {};
  for (const base of ITEM_FORM_BASES) {
    const t: Record<string, string> = {};
    for (const s of dex.species.all()) {
      if (s.baseSpecies !== base || !s.forme || s.changesFrom !== base) continue;
      const item = s.requiredItems?.[0] || s.requiredItem;
      if (item && !/Tera/.test(s.forme)) t[item] = s.name;
    }
    out[dex.species.get(base).id] = t;
  }
  out.shaymin = { "key:gracidea": "Shaymin-Sky" };
  itemForms = out;
  return out;
}

/** The species a Pokémon battles as: held-item forms and Keldeo's Secret Sword (only from the plain form). */
export function formSpecies(m: { species: string; item?: string; moves?: string[] }): string {
  const s = dex.species.get(m.species);
  if (s.forme) return s.name;
  const byItem = m.item ? itemFormTable()[s.id]?.[m.item] : undefined;
  if (byItem) return byItem;
  if (s.id === "keldeo" && (m.moves || []).some(x => x && dex.moves.get(x).id === "secretsword")) return "Keldeo-Resolute";
  return s.name;
}

/** Items one picks when such a Pokémon joins (one is given and leaves with it). */
export function pickItems(species: string): string[] {
  const id = dex.species.get(species).id;
  if (id === "kubfu") return ["key:scrolldark", "key:scrollwater"];
  if (!["arceus", "silvally", "genesect", "ogerpon"].includes(id)) return [];
  return Object.keys(itemFormTable()[id] || {}).filter(i => !/ium Z$/.test(i));
}

/** Items given (fixed) while such a Pokémon is in the squad. */
export function fixedItems(species: string): string[] {
  const s = dex.species.get(species);
  const id = dex.species.get(s.baseSpecies).id;
  return (
    ({
      dialga: ["Adamant Crystal"],
      palkia: ["Lustrous Globe"],
      giratina: ["Griseous Core"],
      shaymin: ["key:gracidea"],
      deoxys: ["key:meteorite"],
      hoopa: ["key:prisonbottle"],
      calyrex: ["key:reins"],
      kyurem: ["key:dnasplicers"],
    } as Record<string, string[]>)[id] || []
  );
}

/** Pickers: species shown with a form drop-down instead of one entry per form. */
const FORM_GROUP_BASES = new Set(["Dudunsparce", "Gimmighoul", "Burmy", "Shellos", "Basculin", "Deerling", "Vivillon", "Pumpkaboo", "Oricorio", "Minior", "Alcremie", "Tatsugiri", "Poltchageist", "Sinistcha", "Squawkabilly", "Maushold", "Urshifu"]);
/** Forms left out of the pickers (held items, key items, moves, genders and evolutions bring them). */
const HIDDEN_BASES = new Set(["Arceus", "Silvally", "Genesect", "Ogerpon", "Dialga", "Palkia", "Giratina", "Shaymin", "Deoxys", "Hoopa", "Calyrex", "Kyurem", "Keldeo", "Rockruff", "Meowstic", "Oinkologne"]);
const HIDDEN_IDS = new Set(["pichuspikyeared", "greninjabond", "zygarde", "zygardecomplete", "eternatuseternamax", "necrozmaduskmane", "necrozmadawnwings"]);

/** The group a species belongs to in the pickers (its key), or null. Paldean Tauros breeds are one group. */
export function formGroup(species: string): string | null {
  const s = dex.species.get(species);
  if (s.baseSpecies === "Tauros" && /^Paldea/.test(s.forme)) return "Tauros-Paldea";
  return FORM_GROUP_BASES.has(s.baseSpecies) ? s.baseSpecies : null;
}

/** Whether a species gets its own entry in the pickers. */
export function listedInPicker(species: string): boolean {
  const s = dex.species.get(species);
  if (HIDDEN_IDS.has(s.id)) return false;
  if (s.forme && HIDDEN_BASES.has(s.baseSpecies)) return false;
  const g = formGroup(species);
  if (g === "Tauros-Paldea") return s.id === "taurospaldeacombat";
  if (g) return !s.forme;
  return true;
}

/** Gender forms chosen with the gender (Meowstic, Oinkologne). */
export function genderForm(species: string, gender: "M" | "F" | ""): string {
  const s = dex.species.get(species);
  if (!["Meowstic", "Oinkologne"].includes(s.baseSpecies)) return s.name;
  return gender === "F" ? `${s.baseSpecies}-F` : s.baseSpecies;
}

/** Deoxys' forms in the order the Meteorite cycles them. */
export const DEOXYS_CYCLE = ["Deoxys", "Deoxys-Attack", "Deoxys-Defense", "Deoxys-Speed"];
