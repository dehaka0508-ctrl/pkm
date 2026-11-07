// Writes dist/app-manifest.json: which build this is (commit, time) and every file with its size and hash.
// The Android app compares its own copy with the one on the deployed site and downloads only changed files.
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["app-manifest.json", "artifact.html", "artifact-files.json"]);

function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export function writeAppManifest(outDir = "dist") {
  const files = {};
  const walk = dir => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(outDir, full).split(path.sep).join("/");
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (!SKIP.has(rel)) {
        const buf = fs.readFileSync(full);
        files[rel] = { size: buf.length, hash: createHash("sha256").update(buf).digest("hex").slice(0, 16) };
      }
    }
  };
  walk(outDir);
  const content = createHash("sha256").update(JSON.stringify(files)).digest("hex").slice(0, 12);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git("rev-parse HEAD");
  const message = (process.env.VERCEL_GIT_COMMIT_MESSAGE || git("log -1 --format=%s") || "").split("\n")[0].slice(0, 120);
  const manifest = {
    // one version per commit; local builds without git fall back to the content hash
    version: commit ? commit.slice(0, 12) : `local-${content}`,
    commit: commit || null,
    message,
    builtAt: Date.now(),
    files,
  };
  fs.writeFileSync(path.join(outDir, "app-manifest.json"), JSON.stringify(manifest));
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = writeAppManifest(process.argv[2] || "dist");
  console.log(`app-manifest: ${m.version} · ${Object.keys(m.files).length} files`);
}
