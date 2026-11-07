import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
// @ts-ignore plain ESM helper shared with scripts/
import { writeAppManifest } from "./scripts/app-manifest.mjs";

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

// Every build writes app-manifest.json (version + file hashes) for the Android app's updater, whatever
// command runs the build (npm run build here and in CI, or the hosting service's own vite build).
function appManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "app-manifest",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      writeAppManifest(outDir);
    },
  };
}

export default defineConfig({
  base: "./",
  define: { __ASSET_VER__: JSON.stringify(Date.now().toString(36)) },
  plugins: [stubOldGens(), preact(), appManifest()],
  worker: { format: "es", plugins: () => [stubOldGens(), stubLearnsets()] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 8000,
  },
});
