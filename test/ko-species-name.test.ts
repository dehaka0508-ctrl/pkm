import { it, expect } from "vitest";
import { koSpecies } from "../src/data/dex";
it("species names drop every form name, regional ones included; Mega names stay", () => {
  const c: Record<string,string> = { "Wormadam-Trash":"도롱마담","Goodra-Hisui":"미끄래곤","Rotom-Heat":"로토무","Raticate-Alola-Totem":"레트라","Tauros-Paldea-Blaze":"켄타로스","Charizard-Mega-X":"메가리자몽X","Kyogre-Primal":"원시가이오가","Floette-Eternal":"플라엣테","Floette-Mega":"메가플라엣테","Mimikyu-Busted":"따라큐","Pikachu-Alola":"피카츄","Darmanitan-Galar-Zen":"불비달마","Lucario-Mega-Z":"" };
  for (const [k,v] of Object.entries(c)) v && expect(koSpecies(k)).toBe(v);
});
