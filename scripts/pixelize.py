#!/usr/bin/env python3
"""Turns a character illustration into a PokeRogue-style trainer sprite (80x80, ~18 colors, dark edges).

usage: python3 scripts/pixelize.py input.png output.png [--height 76] [--colors 18]
Background: removed by flood fill from the image border (solid/dark backgrounds),
then a light "sticker" outline around the character is peeled off.
"""
import argparse
from collections import deque
from PIL import Image, ImageEnhance

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--height", type=int, default=76)
ap.add_argument("--colors", type=int, default=18)
ap.add_argument("--frame", type=int, default=80)
ap.add_argument("--tol", type=int, default=40)
ap.add_argument("--peel", action="store_true", help="remove a white sticker outline")
ap.add_argument("--bright", type=float, default=1.0)
ap.add_argument("--contrast", type=float, default=1.15)
ap.add_argument("--sat", type=float, default=1.3)
ap.add_argument("--line", type=int, default=70, help="luminance below this counts as line art")
ap.add_argument("--ink", type=float, default=0.33, help="line coverage needed to draw an outline pixel")
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
W, H = im.size
px = im.load()

# 1) flood-fill background from the border
bg = px[2, 2][:3]
def close(c, ref, tol):
    return abs(c[0] - ref[0]) + abs(c[1] - ref[1]) + abs(c[2] - ref[2]) <= tol
seen = bytearray(W * H)
q = deque()
for x in range(W):
    q.append((x, 0)); q.append((x, H - 1))
for y in range(H):
    q.append((0, y)); q.append((W - 1, y))
while q:
    x, y = q.popleft()
    i = y * W + x
    if seen[i]:
        continue
    c = px[x, y]
    if c[3] < 40 or close(c, bg, a.tol):
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))

# 2) optionally peel a light "sticker" border touching transparency
def light(c):
    return c[3] > 0 and min(c[0], c[1], c[2]) > 185
for _ in range(14 if a.peel else 0):
    kill = []
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if not light(c):
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and px[nx, ny][3] == 0:
                    kill.append((x, y))
                    break
    if not kill:
        break
    for x, y in kill:
        px[x, y] = (0, 0, 0, 0)

# 3) crop, tone fix, downscale (colour layer + line-art coverage layer)
im = im.crop(im.getbbox())
im = ImageEnhance.Brightness(im).enhance(a.bright)
im = ImageEnhance.Contrast(im).enhance(a.contrast)
im = ImageEnhance.Color(im).enhance(a.sat)
scale = a.height / im.height
nw = max(1, round(im.width * scale))
lum = im.convert("L")
line = lum.point(lambda v: 255 if v < a.line else 0)
line = Image.composite(line, Image.new("L", im.size, 0), im.split()[3].point(lambda v: 255 if v > 0 else 0))
line_cov = line.resize((nw, a.height), Image.BOX).load()
small = im.resize((nw, a.height), Image.BOX)
alpha = small.split()[3].point(lambda v: 255 if v >= 120 else 0)

# 4) palette reduction over opaque pixels, then a majority filter to remove speckles
rgb = Image.new("RGB", small.size, (0, 0, 0))
rgb.paste(small.convert("RGB"), mask=alpha)
q = rgb.quantize(colors=a.colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
palette = q.getpalette()[: a.colors * 3]
qi = q.load()
am = alpha.load()
w, h = small.size
idx = [[qi[x, y] if am[x, y] else -1 for x in range(w)] for y in range(h)]
for _ in range(1):
    new_idx = [row[:] for row in idx]
    for y in range(h):
        for x in range(w):
            if idx[y][x] < 0:
                continue
            counts = {}
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and idx[yy][xx] >= 0:
                        counts[idx[yy][xx]] = counts.get(idx[yy][xx], 0) + 1
            best = max(counts, key=counts.get)
            if counts[best] >= 5 and counts.get(idx[y][x], 0) <= 2:
                new_idx[y][x] = best
    idx = new_idx
out = Image.new("RGBA", small.size, (0, 0, 0, 0))
op = out.load()
for y in range(h):
    for x in range(w):
        i = idx[y][x]
        if i >= 0:
            op[x, y] = (palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2], 255)

def dark(c, f=0.3):
    return (int(c[0] * f) + 10, int(c[1] * f) + 10, int(c[2] * f) + 14, 255)

# 5) line art: cells mostly covered by the original's ink become dark outline pixels
for y in range(h):
    for x in range(w):
        if op[x, y][3] and line_cov[x, y] > 255 * a.ink:
            op[x, y] = dark(op[x, y], 0.38)
# outer edge pixels: darkened local colour (sprite-style outline)
edge = []
for y in range(h):
    for x in range(w):
        if op[x, y][3] == 0:
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < w and 0 <= ny < h) or op[nx, ny][3] == 0:
                edge.append((x, y))
                break
for x, y in edge:
    op[x, y] = dark(op[x, y])

# 6) place in an 80x80 frame, feet at the bottom, with a 1px dark outline outside the silhouette
F = max(a.frame, w + 2, h + 1)
frame = Image.new("RGBA", (F, F), (0, 0, 0, 0))
frame.alpha_composite(out, ((F - w) // 2, F - h))
fp = frame.load()
ring = []
for y in range(F):
    for x in range(F):
        if fp[x, y][3]:
            continue
        nb = [fp[nx, ny] for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)) if 0 <= nx < F and 0 <= ny < F and fp[nx, ny][3]]
        if nb:
            r = sum(c[0] for c in nb) // len(nb)
            g = sum(c[1] for c in nb) // len(nb)
            b = sum(c[2] for c in nb) // len(nb)
            ring.append((x, y, (int(r * 0.45) + 6, int(g * 0.45) + 6, int(b * 0.45) + 10, 255)))
for x, y, c in ring:
    fp[x, y] = c
frame.save(a.dst)
print("saved", a.dst, "sprite", out.size, "colors", len(frame.getcolors(4096) or []))
