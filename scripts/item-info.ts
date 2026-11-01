// Builds src/data/gen/item-info.json: PokeRogue item icon frame + Korean description for every shop item.
// Run: npx vite-node scripts/item-info.ts   (needs ../pokerogue-src)
import { readFileSync, writeFileSync } from "fs";
import { catalog } from "../src/game/shop";
import { dex } from "../src/data/dex";

const PR = process.env.POKEROGUE_DIR || "../pokerogue-src";
const mt = JSON.parse(readFileSync(`${PR}/locales/ko/modifier-type.json`, "utf8"));
const berries = JSON.parse(readFileSync(`${PR}/locales/ko/berry.json`, "utf8"));
const frames = new Set(Object.keys(JSON.parse(readFileSync("public/assets/ui/items.json", "utf8")).f));
const typeKo = JSON.parse(readFileSync(`${PR}/locales/ko/pokemon-info.json`, "utf8")).type ?? {};

const snake = (n: string) => n.toLowerCase().replace(/['’.]/g, "").replace(/[\s-]+/g, "_");
const STAT_MINT: Record<string, string> = { atk: "mint_atk", def: "mint_def", spa: "mint_spatk", spd: "mint_spdef", spe: "mint_spd" };

export const out: Record<string, { img: string | null; desc: string | null; from: "pokerogue" | null }> = {};
const missing: string[] = [];
for (const it of catalog()) {
  const k = it.key;
  let img: string | null = null;
  let desc: string | null = null;
  if (k.startsWith("mint:")) {
    const n = dex.natures.get(k.slice(5));
    img = n.plus ? STAT_MINT[n.plus] : "mint_neutral";
    desc = mt.ModifierType.PokemonNatureChangeModifierType.description;
  } else if (k.startsWith("tera:")) {
    img = `${k.slice(5).toLowerCase()}_tera_shard`;
    desc = mt.ModifierType.TerastallizeModifierType.description;
  } else if (k === "capsule") {
    img = "ability_capsule";
  } else {
    const s = snake(k);
    const U = s.toUpperCase();
    if (frames.has(s)) img = s;
    else if (frames.has(s.replace(/_/g, ""))) img = s.replace(/_/g, "");
    const item = dex.items.get(k);
    if (item.isBerry) {
      const b = berries[s.replace(/_berry$/, "")];
      if (b) desc = b.effect;
    } else if (mt.ModifierType[U]?.description) desc = mt.ModifierType[U].description;
    else if (mt.SpeciesBoosterItem[U]) desc = mt.SpeciesBoosterItem[U].description;
    else if (mt.AttackTypeBoosterItem[s]) desc = mt.ModifierType.AttackTypeBoosterModifierType.description;
    else if ((mt.EvolutionItem[U] || mt.EvolutionItem[U.replace(/_/g, "")]) && !item.megaStone) desc = mt.ModifierType.EvolutionItemModifierType.description;
  }
  if (img && !frames.has(img)) img = null;
  out[k] = { img, desc, from: desc ? "pokerogue" : null };
  if (!desc) missing.push(k);
}
writeFileSync("src/data/gen/item-info.json", JSON.stringify(out));
console.log("items", Object.keys(out).length, "with image", Object.values(out).filter(x => x.img).length, "pokerogue desc", Object.values(out).filter(x => x.desc).length);
console.log("NO IMAGE:", Object.entries(out).filter(([, v]) => !v.img).map(([k]) => k).join(", "));
console.log("NO DESC:", missing.join(", "));
void typeKo;
