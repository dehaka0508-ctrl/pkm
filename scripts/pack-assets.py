#!/usr/bin/env python3
"""Packs PokeRogue assets into a small number of files under public/assets.

Why: PokeRogue ships thousands of tiny PNG+JSON atlases. We bundle them into
"packs" (JSON files holding base64 PNGs + compact frame lists) so the game can be
hosted anywhere with few files, and load only what a battle needs.

Usage: POKEROGUE_DIR=../pokerogue-src python3 scripts/pack-assets.py
"""
import base64
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PR = os.path.abspath(os.environ.get("POKEROGUE_DIR", os.path.join(ROOT, "..", "pokerogue-src")))
A = os.path.join(PR, "assets")
IMG = os.path.join(A, "images")
OUT = os.path.join(ROOT, "public", "assets")

PACK_BYTES = 600_000  # target raw PNG bytes per pack


def b64png(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def atlas_frames(json_path):
    """Return compact frames [[x,y,w,h,ox,oy,sw,sh],...] sorted by frame name."""
    with open(json_path) as f:
        j = json.load(f)
    frames = j["textures"][0]["frames"] if "textures" in j else j["frames"]
    if isinstance(frames, dict):
        frames = [dict(v, filename=k) for k, v in frames.items()]
    frames = sorted(frames, key=lambda fr: fr["filename"])
    out = []
    for fr in frames:
        r = fr["frame"]
        sss = fr.get("spriteSourceSize", {"x": 0, "y": 0})
        ss = fr.get("sourceSize", {"w": r["w"], "h": r["h"]})
        out.append([r["x"], r["y"], r["w"], r["h"], sss["x"], sss["y"], ss["w"], ss["h"]])
    return out, [fr["filename"] for fr in frames]


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))


def pack_atlases(entries, out_dir, prefix):
    """entries: list of (key, png_path, json_path or None). Writes packs + index."""
    os.makedirs(out_dir, exist_ok=True)
    index = {}
    pack, size, n = {}, 0, 0
    total = 0

    def flush():
        nonlocal pack, size, n
        if pack:
            write_json(os.path.join(out_dir, f"{prefix}{n}.json"), pack)
            n += 1
            pack, size = {}, 0

    for key, png, js in entries:
        if not os.path.exists(png):
            continue
        item = {"img": b64png(png)}
        if js and os.path.exists(js):
            item["fr"], _ = atlas_frames(js)
        pack[key] = item
        index[key] = n
        sz = os.path.getsize(png)
        size += sz
        total += sz
        if size >= PACK_BYTES:
            flush()
    flush()
    write_json(os.path.join(out_dir, "index.json"), index)
    print(f"{out_dir}: {len(index)} entries in {n} packs, {total/1e6:.1f}MB png")


def pokemon():
    sp = json.load(open(os.path.join(ROOT, "src/data/gen/species.json")))
    keys = sorted({v["sp"] for v in sp.values()}, key=lambda k: (int(k.split("-")[0]), k))
    pdir = os.path.join(IMG, "pokemon")
    pack_atlases([(k, os.path.join(pdir, k + ".png"), os.path.join(pdir, k + ".json")) for k in keys],
                 os.path.join(OUT, "pokemon", "front"), "f")
    pack_atlases([(k, os.path.join(pdir, "back", k + ".png"), os.path.join(pdir, "back", k + ".json")) for k in keys],
                 os.path.join(OUT, "pokemon", "back"), "b")


def trainers():
    tdir = os.path.join(IMG, "trainer")
    keys = sorted(f[:-4] for f in os.listdir(tdir) if f.endswith(".png"))
    pack_atlases([(k, os.path.join(tdir, k + ".png"), os.path.join(tdir, k + ".json")) for k in keys],
                 os.path.join(OUT, "trainer"), "t")


def icons():
    d = os.path.join(OUT, "icons")
    os.makedirs(d, exist_ok=True)
    for i in range(10):
        png = os.path.join(IMG, f"pokemon_icons_{i}.png")
        js = os.path.join(IMG, f"pokemon_icons_{i}.json")
        if not os.path.exists(png):
            continue
        shutil.copy(png, os.path.join(d, f"icons_{i}.png"))
        fr, names = atlas_frames(js)
        im_w, im_h = json_size(js)
        write_json(os.path.join(d, f"icons_{i}.json"), {"w": im_w, "h": im_h, "f": dict(zip([n.replace(".png", "") for n in names], fr))})
    print("icons copied")


def json_size(js):
    j = json.load(open(js))
    t = j["textures"][0] if "textures" in j else j["meta"]
    s = t["size"]
    return s["w"], s["h"]


def arenas():
    adir = os.path.join(IMG, "arenas")
    entries = []
    for f in sorted(os.listdir(adir)):
        if f.endswith(".png"):
            k = f[:-4]
            js = os.path.join(adir, k + ".json")
            entries.append((k, os.path.join(adir, f), js if os.path.exists(js) else None))
    global PACK_BYTES
    old = PACK_BYTES
    PACK_BYTES = 10_000_000
    pack_atlases(entries, os.path.join(OUT, "arenas"), "a")
    PACK_BYTES = old


UI_FILES = [
    "ui/bg.png", "ui/overlay_message.png", "ui/pbinfo_player.png", "ui/pbinfo_enemy_mini.png",
    "ui/pbinfo_player_mini.png", "ui/overlay_hp.png", "ui/overlay_hp.json", "ui/overlay_exp.png",
    "ui/numbers.png", "ui/numbers.json", "ui/numbers_red.png", "ui/numbers_red.json",
    "ui/pb_tray_ball.png", "ui/pb_tray_ball.json", "ui/pb_tray_overlay_enemy.png", "ui/pb_tray_overlay_player.png",
    "ui/cursor.png", "ui/icon_tera.png", "ui/shiny_small.png", "ui/party_bg.png",
    "ui/summary_bg.png", "ui/type_bgs.png", "ui/type_bgs.json",
    "ui/text_images/ko/battle_ui/overlay_hp_label_ko.png", "ui/text_images/ko/battle_ui/overlay_lv_ko.png",
    "ui/text_images/ko/battle_ui/overlay_exp_label_ko.png",
    "types_ko.png", "types_ko.json", "categories.png", "categories.json",
    "pb.png", "pb.json", "items.png", "items.json", "statuses_ko.png", "statuses_ko.json",
    "effects/battle_stats.png", "effects/battle_stats.json", "effects/pb_particles.png", "effects/pb_particles.json",
    "effects/tera.png", "effects/tera_sparkle.png", "effects/tera_sparkle.json", "effects/shiny.png", "effects/shiny.json",
]


def ui():
    d = os.path.join(OUT, "ui")
    os.makedirs(d, exist_ok=True)
    for f in UI_FILES:
        src = os.path.join(IMG, f)
        if not os.path.exists(src):
            print("  missing", f)
            continue
        name = os.path.basename(f)
        if name.endswith(".json"):
            fr, names = atlas_frames(src)
            w, h = json_size(src)
            write_json(os.path.join(d, name), {"w": w, "h": h, "f": dict(zip([n.replace(".png", "") for n in names], fr))})
        else:
            shutil.copy(src, os.path.join(d, name))
    wdir = os.path.join(IMG, "ui", "windows")
    for f in os.listdir(wdir):
        if f.endswith(".png"):
            shutil.copy(os.path.join(wdir, f), os.path.join(d, f))
    print("ui copied")


def r1(v):
    v = round(float(v), 1)
    return int(v) if v == int(v) else v


def compact_anim(a):
    if a is None:
        return None
    frames = []
    for fr in a["frames"]:
        out = []
        for s in fr:
            tone = s.get("tone") or [0, 0, 0, 0]
            color = s.get("color") or [0, 0, 0, 0]
            item = [
                r1(s.get("x", 0)), r1(s.get("y", 0)),
                r1(s.get("zoomX", 100)), r1(s.get("zoomY", 100)),
                r1(s.get("angle", 0)), 1 if s.get("mirror") else 0,
                1 if s.get("visible", True) else 0, s.get("blendType", 0),
                s.get("target", 2), s.get("graphicFrame", 0),
                s.get("opacity", 255), s.get("priority", 1), s.get("focus", 1),
                1 if s.get("locked") else 0,
            ]
            if any(tone) or any(color):
                item.append(tone)
                if any(color):
                    item.append(color)
            out.append(item)
        frames.append(out)
    events = {}
    for fi, evs in (a.get("frameTimedEvents") or {}).items():
        lst = []
        for e in evs:
            t = e["eventType"]
            if t == "AnimTimedSoundEvent":
                lst.append(["s", e.get("resourceName", ""), e.get("volume", 100), e.get("pitch", 100)])
            elif t == "AnimTimedAddBgEvent":
                lst.append(["a", e.get("resourceName", ""), e.get("bgX", 0), e.get("bgY", 0), e.get("opacity", 0), e.get("duration", 0)])
            elif t == "AnimTimedUpdateBgEvent":
                lst.append(["u", e.get("resourceName", ""), e.get("bgX"), e.get("bgY"), e.get("opacity"), e.get("duration", 0)])
        if lst:
            events[fi] = lst
    return {"g": a.get("graphic", ""), "p": a.get("position", 1), "f": frames, "e": events}


def anims():
    adir = os.path.join(A, "battle-anims")
    gdir = os.path.join(IMG, "battle_anims")
    out = os.path.join(OUT, "anims")
    os.makedirs(out, exist_ok=True)
    names = sorted(f[:-5] for f in os.listdir(adir) if f.endswith(".json"))
    chunks = {}
    index = {}
    graphics = set()
    CH = 24
    for name in names:
        j = json.load(open(os.path.join(adir, name + ".json")))
        if isinstance(j, list):
            c = [compact_anim(x) for x in j]
            for x in j:
                if x:
                    graphics.add(x.get("graphic", ""))
                    collect_bg(x, graphics)
        else:
            c = compact_anim(j)
            graphics.add(j.get("graphic", ""))
            collect_bg(j, graphics)
        h = sum(map(ord, name)) % CH
        chunks.setdefault(h, {})[name] = c
        index[name] = h
    total = 0
    for h, obj in chunks.items():
        p = os.path.join(out, f"c{h}.json")
        write_json(p, obj)
        total += os.path.getsize(p)
    write_json(os.path.join(out, "index.json"), index)
    print(f"anims: {len(names)} anims in {len(chunks)} chunks, {total/1e6:.1f}MB")
    # graphics
    entries = []
    for g in sorted(x for x in graphics if x):
        p = os.path.join(gdir, g + ".png")
        if os.path.exists(p):
            entries.append((g, p, None))
    pack_atlases(entries, os.path.join(OUT, "anims", "gfx"), "g")


def collect_bg(a, graphics):
    for evs in (a.get("frameTimedEvents") or {}).values():
        for e in evs:
            if e["eventType"] in ("AnimTimedAddBgEvent",) and e.get("resourceName"):
                graphics.add(e["resourceName"])


def fonts():
    d = os.path.join(OUT, "fonts")
    os.makedirs(d, exist_ok=True)
    gal = os.path.join(ROOT, "node_modules", "galmuri", "dist")
    for f in ["Galmuri11.woff2", "Galmuri11-Bold.woff2", "Galmuri9.woff2", "Galmuri7.woff2"]:
        if os.path.exists(os.path.join(gal, f)):
            shutil.copy(os.path.join(gal, f), os.path.join(d, f))
    print("fonts copied")


if __name__ == "__main__":
    steps = sys.argv[1:] or ["pokemon", "trainers", "icons", "arenas", "ui", "anims", "fonts"]
    for s in steps:
        globals()[s]()
