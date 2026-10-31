import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// The league only runs Gen 9 (National Dex) battles, so the simulator's older-generation
// mod data (Gen 1–8, BDSP, Legends) is replaced with empty modules to shrink the bundle.
const OLD_GEN = /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/]mods[\\/](gen[1-8]|gen8bdsp|gen8legends)[\\/](index|learnsets|legality)\.mjs$/;
function stubOldGens(): Plugin {
  return {
    name: "stub-old-gens",
    enforce: "pre",
    load(id) {
      if (OLD_GEN.test(id.split("?")[0])) return "export {};";
    },
  };
}

// The match worker only runs battles, so it doesn't need learnset/legality data.
const LEARN = /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/](learnsets|legality)\.mjs$/;
function stubLearnsets(): Plugin {
  return {
    name: "stub-learnsets",
    enforce: "pre",
    load(id) {
      const m = id.split("?")[0].match(LEARN);
      if (m) return m[1] === "learnsets" ? "export const Learnsets = {};" : "export const Legality = {};";
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __ASSET_VER__: JSON.stringify(Date.now().toString(36)) },
  plugins: [stubOldGens(), preact()],
  worker: { format: "es", plugins: () => [stubOldGens(), stubLearnsets()] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
  },
});
