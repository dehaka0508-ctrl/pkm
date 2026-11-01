// Fills empty held items of NPC trainers with items real players use.
//   node scripts/fill-items.mjs kanto johto        (regions; writes src/data/trainers.json)
// Source: Showdown ladder usage sets (@smogon/sets, MIT-licensed "stats" data only), matched by
// moveset overlap like the nature picker. Items that don't fit the moveset are skipped, and the
// same item is avoided twice in one team where a fitting alternative exists.
import fs from "node:fs";
import path from "node:path";
import { Dex } from "@pkmn/sim";

const DATA = "src/data/trainers.json";
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const regions = process.argv.slice(2);
if (!regions.length) throw new Error("usage: node scripts/fill-items.mjs <region> [...]");

// ---- usage sets: species id -> [{item, moves, w}] ----
const usage = {};
const setsDir = path.resolve("node_modules/@smogon/sets");
const SKIP = /(cap|balancedhackmons|letsgo|1v1|almostanyability|monotype|stabmons)/;
for (const f of fs.readdirSync(setsDir).filter(f => /^gen\d.*\.json$/.test(f))) {
  const gen = Number(f[3]);
  if (gen < 4) continue;
  const j = JSON.parse(fs.readFileSync(path.join(setsDir, f), "utf8"));
  for (const [fmt, v] of Object.entries(j)) {
    if (!v || !v.stats || SKIP.test(fmt)) continue;
    const doubles = /(doubles|vgc)/.test(fmt);
    for (const [sp, sets] of Object.entries(v.stats)) {
      const id = Dex.species.get(sp).id;
      if (!id) continue;
      for (const set of Object.values(sets)) {
        const items = [set.item].flat().filter(Boolean);
        const moves = (set.moves || []).flat().map(m => Dex.moves.get(m).id).filter(Boolean);
        items.forEach((item, i) => (usage[id] ||= []).push({ item, moves, w: gen - 3 + (doubles ? 0 : 1.5) - i * 0.5 }));
      }
    }
  }
}

const STATUS_OK_WITH_CHOICE = new Set(["trick", "switcheroo"]);
// situational / doubles-only / Little Cup items that make no sense on a fixed league team
const NEVER = new Set(["grassyseed", "electricseed", "psychicseed", "mistyseed", "terrainextender", "laggingtail", "adrenalineorb", "berryjuice", "roomservice", "ironball", "stickybarb", "ringtarget", "machobrace", "fullincense", "laxincense", "safetygoggles", "covertcloak", "abilityshield", "utilityumbrella", "protectivepads", "kingsrock", "razorfang", "quickclaw", "brightpowder", "metronome", "bindingband", "gripclaw", "shedshell", "floatstone", "destinyknot", "redcard", "ejectpack", "kebiaberry", "keeberry", "marangaberry", "snowball", "absorbbulb", "cellbattery", "luminousmoss"]);
const CHARGE = new Set(["solarbeam", "solarblade", "skyattack", "skullbash", "razorwind", "freezeshock", "iceburn", "geomancy", "meteorbeam", "electroshot", "fly", "dig", "dive", "bounce", "phantomforce", "shadowforce"]);
function fits(item, mon) {
  const it = Dex.items.get(item);
  if (!it.exists || it.megaStone || it.zMove || it.isNonstandard === "CAP") return false;
  const sp = Dex.species.get(mon.species);
  const moves = mon.moves.filter(Boolean).map(m => Dex.moves.get(m));
  const auto = moves.length === 0; // moves picked by the game later: only all-round items
  const status = moves.filter(m => m.category === "Status" && !STATUS_OK_WITH_CHOICE.has(m.id));
  const id = it.id;
  if (NEVER.has(id)) return false;
  if (auto && !["leftovers", "sitrusberry", "lifeorb", "focussash", "expertbelt", "lumberry", "rockyhelmet", "eviolite", "blacksludge", "heavydutyboots", "thickclub", "lightball", "leek", "weaknesspolicy", "whiteherb", "custapberry", "salacberry", "liechiberry", "petayaberry"].includes(id)) return false;
  if (id === "chestoberry" && !moves.some(m => m.id === "rest")) return false;
  if (id === "powerherb" && !moves.some(m => CHARGE.has(m.id))) return false;
  if (id === "whiteherb" && !moves.some(m => ["closecombat", "overheat", "dracometeor", "leafstorm", "fleurcannon", "superpower", "psychoboost", "shellsmash", "vcreate", "makeitrain"].includes(m.id)) && !auto) return false;
  if (id === "weaknesspolicy" && status.length > 1) return false;
  if (/^choice/.test(id) && status.length) return false;
  if (id === "assaultvest" && status.length) return false;
  if (id === "eviolite" && !sp.nfe) return false;
  if (id === "lightclay" && !moves.some(m => ["reflect", "lightscreen", "auroraveil"].includes(m.id))) return false;
  if (id === "blacksludge" && !sp.types.includes("Poison")) return false;
  if (["heatrock", "damprock", "smoothrock", "icyrock"].includes(id) && !moves.some(m => ["sunnyday", "raindance", "sandstorm", "hail", "snowscape"].includes(m.id)) && !["Drought", "Drizzle", "Sand Stream", "Snow Warning"].includes(mon.ability)) return false;
  if ((id === "flameorb" || id === "toxicorb") && !["Guts", "Quick Feet", "Poison Heal", "Marvel Scale", "Toxic Boost", "Flare Boost", "Magic Guard"].includes(mon.ability) && !moves.some(m => m.id === "facade" || m.id === "fling" || m.id === "switcheroo" || m.id === "trick")) return false;
  if (it.itemUser && !it.itemUser.includes(sp.name)) return false;
  if (id === "airballoon" || id === "redcard" || id === "ejectbutton" || id === "ejectpack" || id === "roomservice") return true;
  return true;
}

/** Simple role-based fallback when no usage set fits. */
function fallback(mon) {
  const moves = mon.moves.filter(Boolean).map(m => Dex.moves.get(m));
  const status = moves.filter(m => m.category === "Status").length;
  const sp = Dex.species.get(mon.species);
  const opts = [];
  if (sp.nfe) opts.push("Eviolite");
  if (moves.some(m => ["reflect", "lightscreen"].includes(m.id))) opts.push("Light Clay");
  if (status >= 2) opts.push(sp.types.includes("Poison") ? "Black Sludge" : "Leftovers", "Sitrus Berry", "Rocky Helmet");
  else if (status === 0) opts.push("Life Orb", "Assault Vest", "Expert Belt", "Focus Sash");
  else opts.push("Life Orb", "Sitrus Berry", "Leftovers", "Focus Sash", "Lum Berry");
  opts.push("Leftovers", "Sitrus Berry", "Lum Berry", "Focus Sash", "Expert Belt");
  return opts;
}

function pick(mon, taken) {
  const sp = Dex.species.get(mon.species);
  const keys = [sp.id, Dex.species.get(sp.baseSpecies).id, sp.prevo ? Dex.species.get(sp.prevo).id : ""].filter(Boolean);
  const sets = keys.map(k => usage[k]).find(x => x && x.length) || [];
  if (sp.nfe && fits("Eviolite", mon) && !taken.has("Eviolite")) return { item: "Eviolite", from: "usage" };
  const ids = mon.moves.filter(Boolean).map(m => Dex.moves.get(m).id);
  const score = {};
  for (const s of sets) {
    if (!fits(s.item, mon)) continue;
    const overlap = s.moves.filter(m => ids.includes(m)).length;
    const v = overlap * 10 + s.w;
    const name = Dex.items.get(s.item).name;
    score[name] = Math.max(score[name] ?? -1, v) + 0.3; // repeated sightings add a little
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const fb = fallback(mon).filter(n => fits(n, mon));
  const all = [...ranked, ...fb];
  const fresh = all.find(n => !taken.has(n));
  const choice = fresh ?? all[0] ?? "Leftovers";
  return { item: choice, from: ranked.includes(choice) ? "usage" : "rule" };
}

const report = [];
let filled = 0;
for (const r of data.regions.filter(r => regions.includes(r.id))) {
  for (const t of r.trainers) {
    const taken = new Set(t.team.filter(m => m && m.item).map(m => Dex.items.get(m.item).name));
    const row = [];
    for (const m of t.team) {
      if (!m || m.item) continue;
      const p = pick(m, taken);
      m.item = p.item;
      taken.add(p.item);
      filled++;
      row.push(`${m.species}: ${p.item}${p.from === "rule" ? " (규칙)" : ""}`);
    }
    if (row.length) report.push(`${r.id} ${t.name} — ${row.join(", ")}`);
  }
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 1));
console.log(report.join("\n"));
console.log("filled", filled);
