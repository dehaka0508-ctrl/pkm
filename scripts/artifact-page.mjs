// Makes dist/artifact.html: the built page without <html>/<head>/<body> wrappers
// (for hosts that wrap the page in their own document skeleton).
import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync("dist/index.html", "utf8");
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(<\/script>)?/g)].map(m => m[0]).filter(t => /src=|rel="stylesheet"/.test(t));
const out = `<title>포켓 리그</title>
<meta name="description" content="포켓몬 배틀 기반 리그 매니지먼트 팬게임 (비공식)">
<style>:root{color-scheme:dark}html,body{background:#1d1a2b;color:#f8f8f8}body{margin:0}</style>
${tags.join("\n")}
<div id="app"><div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#b9adc9">포켓 리그 불러오는 중…</div></div>
`;
fs.writeFileSync("dist/artifact.html", out);
const files = [];
const walk = d => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (!/^(index|artifact)\.html$/.test(f) || d !== "dist") files.push(path.relative("dist", p));
  }
};
walk("dist");
fs.writeFileSync("dist/artifact-files.json", JSON.stringify(files));
console.log(out);
console.log(files.length, "files");
