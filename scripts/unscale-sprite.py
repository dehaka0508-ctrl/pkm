#!/usr/bin/env python3
"""Recovers an upscaled pixel-art sprite (e.g. a 2x screenshot) into a clean PokeRogue-sized frame.

usage: python3 scripts/unscale-sprite.py input.png output.png [--scale 2] [--colors 32] [--frame 80]
Removes a flat background by flood fill from the border, finds the pixel grid phase,
takes the most common colour per cell, and trims colour noise from compression.
"""
import argparse
from collections import Counter, deque
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--scale", type=int, default=0, help="0 = auto-detect")
ap.add_argument("--colors", type=int, default=32)
ap.add_argument("--frame", type=int, default=80)
ap.add_argument("--tol", type=int, default=24)
ap.add_argument("--fit-height", type=int, default=77, help="shrink (nearest) if taller than this; 0 = keep")
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
W, H = im.size
px = im.load()
bg = px[1, 1][:3]
near = lambda c: abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= a.tol
seen = bytearray(W * H)
q = deque([(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)])
while q:
    x, y = q.popleft()
    i = y * W + x
    if seen[i]:
        continue
    c = px[x, y]
    if c[3] < 200 or near(c):
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
im = im.crop(im.getbbox())
W, H = im.size
px = im.load()

def score(s, ox, oy):
    """How uniform are the s x s cells for this grid phase (lower = better)."""
    bad = 0
    for y in range(oy, H - s + 1, s):
        for x in range(ox, W - s + 1, s):
            cells = [px[x + i, y + j] for j in range(s) for i in range(s)]
            bad += len(cells) - Counter(cells).most_common(1)[0][1]
    return bad / max(1, (W // s) * (H // s))

if a.scale:
    s = a.scale
    phase = min(((score(s, ox, oy), ox, oy) for ox in range(s) for oy in range(s)))
else:
    best = None
    for s in (2, 3, 4):
        for ox in range(s):
            for oy in range(s):
                sc = score(s, ox, oy) / (s * s)
                if best is None or sc < best[0]:
                    best = (sc, s, ox, oy)
    _, s, ox, oy = best
    phase = (0, ox, oy)
_, ox, oy = phase
nw, nh = (W - ox) // s, (H - oy) // s
out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
op = out.load()
for y in range(nh):
    for x in range(nw):
        cells = [px[ox + x * s + i, oy + y * s + j] for j in range(s) for i in range(s)]
        c = Counter(cells).most_common(1)[0][0]
        op[x, y] = c if c[3] >= 128 else (0, 0, 0, 0)

# clean compression noise: snap to a limited palette
alpha = out.split()[3]
rgb = Image.new("RGB", out.size)
rgb.paste(out.convert("RGB"), mask=alpha)
pal = rgb.quantize(colors=a.colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
clean = Image.new("RGBA", out.size, (0, 0, 0, 0))
clean.paste(pal, mask=alpha)
clean = clean.crop(clean.getbbox())
if a.fit_height and clean.height > a.fit_height:
    f = a.fit_height / clean.height
    clean = clean.resize((max(1, round(clean.width * f)), a.fit_height), Image.NEAREST)
w, h = clean.size
F = max(a.frame, w, h)
frame = Image.new("RGBA", (F, F), (0, 0, 0, 0))
frame.alpha_composite(clean, ((F - w) // 2, F - h))
frame.save(a.dst)
print(f"scale {s} phase ({ox},{oy}) -> sprite {w}x{h}, frame {F}, colors {len(frame.getcolors(4096) or [])}")
