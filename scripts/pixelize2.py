#!/usr/bin/env python3
"""Illustration -> PokeRogue-style trainer sprite (80x80): flat colours, 1px line art, 1px outer outline.

usage: python3 scripts/pixelize2.py input.png output.png [--height 74] [--colors 16]

How it works:
  * background removed by flood fill from the border (like pixelize.py)
  * line art = pixels clearly darker than their surroundings; thinned to 1px in the source,
    then mapped to the small grid and thinned again so every line stays 1px wide
  * colours are averaged from non-line pixels only (lines don't muddy the fill), then reduced
  * a single 1px dark outline goes around the outside of the silhouette
Needs numpy + scikit-image.
"""
import argparse
from collections import deque

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from skimage.morphology import skeletonize

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("dst")
ap.add_argument("--height", type=int, default=74)
ap.add_argument("--colors", type=int, default=16)
ap.add_argument("--frame", type=int, default=80)
ap.add_argument("--tol", type=int, default=40)
ap.add_argument("--peel", action="store_true")
ap.add_argument("--peeln", type=int, default=14)
ap.add_argument("--peelmin", type=int, default=185)
ap.add_argument("--bright", type=float, default=1.0)
ap.add_argument("--contrast", type=float, default=1.1)
ap.add_argument("--sat", type=float, default=1.2)
ap.add_argument("--dark", type=int, default=60, help="absolute luminance that always counts as line")
ap.add_argument("--rel", type=int, default=45, help="how much darker than the surroundings a line must be")
ap.add_argument("--hit", type=float, default=0.55, help="share of a cell's width the thinned line must cover")
ap.add_argument("--ink", default="34,30,44", help="outer outline colour r,g,b")
ap.add_argument("--eyes", default="", help="eye centres in the source: x,y;x,y (drawn as crisp 1x2 dark pixels)")
ap.add_argument("--eyeh", type=int, default=2, help="eye height in sprite pixels")
ap.add_argument("--mouth", default="", help="mouth centre in the source: x,y (a 1-2px darker skin pixel)")
ap.add_argument("--mouthw", type=int, default=1)
ap.add_argument("--chroma", type=float, default=1.6)
ap.add_argument("--erase", action="append", default=[], help="x0,y0,x1,y1 box in the source to drop (props)")
ap.add_argument("--edge", type=float, default=70, help="colour difference that gets a border line")
ap.add_argument("--brows", action="store_true")
ap.add_argument("--single_outer", type=int, default=1)
ap.add_argument("--mouthdark", type=float, default=0.62)
ap.add_argument("--smooth", type=int, default=3)
ap.add_argument("--destroke", type=int, default=2)
ap.add_argument("--head", default="", help="x0,y0,x1,y1 head box in the source (chin = y1)")
ap.add_argument("--headscale", type=float, default=1.25)
ap.add_argument("--minline", type=int, default=4)
ap.add_argument("--face", default="", help="x,y,w,h of the face in the source (gets finer line detection)")
a = ap.parse_args()
a.ink_rgb = tuple(int(v) for v in a.ink.split(","))

im = Image.open(a.src).convert("RGBA")
W, H = im.size
px = im.load()

# 1) background
bg = px[2, 2][:3]
def close(c, ref, tol):
    return abs(c[0] - ref[0]) + abs(c[1] - ref[1]) + abs(c[2] - ref[2]) <= tol
seen = bytearray(W * H)
q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
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
if a.peel:
    arr = np.array(im)
    for _ in range(a.peeln):
        op = arr[..., 3] > 0
        light = op & (arr[..., :3].min(axis=2) > a.peelmin)
        tr = ~op
        nb = np.zeros_like(tr)
        nb[1:] |= tr[:-1]; nb[:-1] |= tr[1:]; nb[:, 1:] |= tr[:, :-1]; nb[:, :-1] |= tr[:, 1:]
        kill = light & nb
        if not kill.any():
            break
        arr[kill] = 0
    im = Image.fromarray(arr)

for box in a.erase:
    x0, y0, x1, y1 = map(int, box.split(","))
    arr = np.array(im); arr[y0:y1, x0:x1] = 0; im = Image.fromarray(arr)
# optional: enlarge the head (official sprites have slightly bigger heads, which keeps faces readable)
head_map = lambda x, y: (x, y)
if a.head:
    hx0, hy0, hx1, hy1 = map(int, a.head.split(","))
    hs = a.headscale
    arr = np.array(im)
    region = Image.fromarray(arr[hy0:hy1, hx0:hx1])
    big = region.resize((round(region.width * hs), round(region.height * hs)), Image.LANCZOS)
    cxh = (hx0 + hx1) / 2
    px0 = round(cxh - big.width / 2); py0 = hy1 - big.height
    pad = max(0, -px0, -py0)
    canvas = Image.new("RGBA", (im.width + 2 * pad + big.width, im.height + pad), (0, 0, 0, 0))
    canvas.alpha_composite(im, (pad, pad))
    bb = np.array(big); bb[..., 3] = np.where(bb[..., 3] > 128, 255, 0)
    canvas.alpha_composite(Image.fromarray(bb), (px0 + pad, py0 + pad))
    im = canvas
    def head_map(x, y, hx0=hx0, hy1=hy1, cxh=cxh, hs=hs, pad=pad, hy0=hy0, hx1=hx1):
        if hx0 <= x <= hx1 and hy0 <= y <= hy1:
            return cxh + (x - cxh) * hs + pad, hy1 - (hy1 - y) * hs + pad
        return x + pad, y + pad
    def remap(spec):
        pts = []
        for pt in spec.split(";"):
            x, y = (float(v) for v in pt.split(","))
            x, y = head_map(x, y)
            pts.append(f"{x:.1f},{y:.1f}")
        return ";".join(pts)
    if a.eyes:
        a.eyes = remap(a.eyes)
    if a.mouth:
        a.mouth = remap(a.mouth)
face_box = None
if a.face:
    fx, fy, fw, fh = map(int, a.face.split(","))
    face_box = (fx, fy, fw, fh)
bbox = im.getbbox()
im = im.crop(bbox)
if face_box:
    face_box = (face_box[0] - bbox[0], face_box[1] - bbox[1], face_box[2], face_box[3])
im = ImageEnhance.Brightness(im).enhance(a.bright)
im = ImageEnhance.Contrast(im).enhance(a.contrast)
im = ImageEnhance.Color(im).enhance(a.sat)

src = np.array(im).astype(np.float32)
alpha = src[..., 3] > 100
lum = (0.299 * src[..., 0] + 0.587 * src[..., 1] + 0.114 * src[..., 2])
H0, W0 = lum.shape
scale = a.height / H0
cell = 1 / scale
nw, nh = max(1, round(W0 * scale)), a.height

# 2) line art in the source
lum_img = Image.fromarray(np.where(alpha, lum, 255).astype(np.uint8))
blur = np.array(lum_img.filter(ImageFilter.GaussianBlur(max(2, cell * 0.9)))).astype(np.float32)
line = alpha & ((lum < a.dark) | (lum < blur - a.rel))
if face_box:
    fx, fy, fw, fh = face_box
    sub = (slice(max(0, fy), fy + fh), slice(max(0, fx), fx + fw))
    line[sub] |= alpha[sub] & (lum[sub] < blur[sub] - a.rel * 0.6)
skel = skeletonize(line)

# 3) downscale colour from non-line pixels
def boxsum(arr):
    ys = (np.arange(H0) * scale).astype(int).clip(0, nh - 1)
    xs = (np.arange(W0) * scale).astype(int).clip(0, nw - 1)
    out = np.zeros((nh, nw) + arr.shape[2:], np.float64)
    np.add.at(out, (ys[:, None], xs[None, :]), arr)
    return out
area = boxsum(np.ones((H0, W0)))
cov = boxsum(alpha.astype(np.float64)) / area
fillw = (alpha & ~line).astype(np.float64)
fw_sum = boxsum(fillw)
col = boxsum(src[..., :3] * fillw[..., None])
anyw = boxsum(alpha.astype(np.float64))
col_all = boxsum(src[..., :3] * alpha[..., None])
dark_share = boxsum(line.astype(np.float64)) / area
thin = (fw_sum > 0) & (dark_share < 0.5)
small = np.where(thin[..., None], col / np.maximum(fw_sum, 1e-9)[..., None], col_all / np.maximum(anyw, 1e-9)[..., None])
mask = cov >= 0.45
from skimage.measure import label as _label
_lab = _label(mask, connectivity=1)
_sz = np.bincount(_lab.ravel()); _sz[0] = 0
mask &= _sz[_lab] >= 6
skel_hits = boxsum(skel.astype(np.float64))
lines_small = mask & (skel_hits >= a.hit * cell)
lines_small = skeletonize(lines_small)
# drop short specks of line (hair strands, texture): keep runs of at least --minline pixels
from skimage.measure import label
lab = label(lines_small, connectivity=2)
sizes = np.bincount(lab.ravel())
lines_small &= sizes[lab] >= a.minline

# 4) palette reduction (colour fill only)
rgb = Image.fromarray(np.where(mask[..., None], small, 0).clip(0, 255).astype(np.uint8))
qimg = rgb.quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
pal = np.array(qimg.getpalette()[: a.colors * 3]).reshape(-1, 3).astype(np.float64)
# refine the median-cut palette with a few k-means steps (keeps small saturated areas their own colour)
# skin colour sampled from the source around the eyes is kept as its own palette entry
fixed = []
if a.eyes:
    for pt in a.eyes.split(";"):
        ex, ey = (float(v) for v in pt.split(","))
        sx, sy = int(ex - bbox[0]), int(ey - bbox[1])
        r = max(3, int(cell * 1.5))
        patch = src[max(0, sy + r // 2): sy + 2 * r, max(0, sx - r): sx + r, :3].reshape(-1, 3)
        pl = patch @ np.array([0.299, 0.587, 0.114])
        patch = patch[(pl > np.percentile(pl, 40))]
        if len(patch):
            fixed.append(np.median(patch, 0))
if fixed:
    pal[-1] = np.mean(fixed, 0)
    # a slightly darker skin shade too
    pal[-2] = pal[-1] * 0.82
def feat(c):
    # luminance + two colour-opponent axes, chroma weighted up so skin doesn't merge into white cloth
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    return np.stack([0.299 * r + 0.587 * g + 0.114 * b, (r - g) * a.chroma, (r + g - 2 * b) * 0.5 * a.chroma], -1)
pts = small[mask].astype(np.float64)
for _ in range(12):
    d = ((feat(pts)[:, None, :] - feat(pal)[None, :, :]) ** 2).sum(-1)
    lab_ = d.argmin(1)
    for k in range(len(pal) - (2 if fixed else 0)):
        sel = pts[lab_ == k]
        if len(sel):
            pal[k] = sel.mean(0)
d = ((feat(small)[..., None, :] - feat(pal)[None, None, :, :]) ** 2).sum(-1)
idx = d.argmin(-1).astype(int)
pal = pal.round().clip(0, 255).astype(np.uint8)
idx[~mask] = -1
# majority filter: lone pixels take their neighbours' colour
for _ in range(a.smooth):
    new = idx.copy()
    for y in range(nh):
        for x in range(nw):
            if idx[y, x] < 0 or lines_small[y, x]:
                continue
            win = idx[max(0, y - 1): y + 2, max(0, x - 1): x + 2].ravel()
            win = win[win >= 0]
            vals, cnt = np.unique(win, return_counts=True)
            best = vals[cnt.argmax()]
            if cnt.max() >= 4 and cnt[vals == idx[y, x]][0] <= 2 and best != idx[y, x]:
                new[y, x] = best
    idx = new
# remove 1px strokes left from the illustration: a pixel sandwiched between two of the same other colour
for _ in range(a.destroke):
    new = idx.copy()
    for y in range(1, nh - 1):
        for x in range(1, nw - 1):
            i = idx[y, x]
            if i < 0:
                continue
            for (y1, x1), (y2, x2) in (((y, x - 1), (y, x + 1)), ((y - 1, x), (y + 1, x))):
                j = idx[y1, x1]
                if j >= 0 and j != i and idx[y2, x2] == j:
                    new[y, x] = j
                    break
    idx = new
out = np.zeros((nh, nw, 4), np.uint8)
out[mask, :3] = pal[idx[mask]]
out[mask, 3] = 255

def darken(c, f):
    c = np.asarray(c, np.float64)
    return (c * f + np.array([8, 8, 14])).clip(0, 255)

def line_shade(c):
    # dark, slightly hue-tinted ink like the official sprites; very dark fills get near-black
    c = np.asarray(c, np.float64)
    l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    f = 0.42 if l > 140 else 0.38 if l > 70 else 0.3
    return (c * f + np.array([6, 6, 12])).clip(0, 255).round()

# 5) interior lines. Two sources:
#   a) borders between clearly different colour regions (coat vs shirt, skin vs cloth): a 1px line drawn
#      on the darker side, in a dark shade of that side's own colour -- this is how the official sprites do it
#   b) long strokes of the illustration's own line art (folds), already thinned to 1px
edge_in = np.zeros_like(mask)
tr = ~mask
edge_in[1:] |= tr[:-1]; edge_in[:-1] |= tr[1:]; edge_in[:, 1:] |= tr[:, :-1]; edge_in[:, :-1] |= tr[:, 1:]
edge_in[0, :] = edge_in[-1, :] = True
edge_in[:, 0] = edge_in[:, -1] = True
edge_in &= mask
fp = feat(pal.astype(np.float64))
def far(i, j):
    if i < 0 or j < 0 or i == j:
        return False
    dl = (fp[i, 0] - fp[j, 0]) * 0.55
    dc = np.hypot(fp[i, 1] - fp[j, 1], fp[i, 2] - fp[j, 2])
    return np.hypot(dl, dc) > a.edge
lum_p = fp[:, 0]
border = np.zeros_like(mask)
for y in range(nh):
    for x in range(nw):
        i = idx[y, x]
        if i < 0:
            continue
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < nh and 0 <= xx < nw:
                j = idx[yy, xx]
                if far(i, j) and (lum_p[i] < lum_p[j] or (lum_p[i] == lum_p[j] and (yy, xx) > (y, x))):
                    border[y, x] = True
                    break
# keep borders 1px: a border pixel whose darker neighbour is also a border of the same colour pair is fine,
# but drop pixels that would make a 2x2 block of line
lines_all = (border | lines_small) & ~edge_in
for y in range(nh - 1):
    for x in range(nw - 1):
        if lines_all[y:y + 2, x:x + 2].all():
            lines_all[y + 1, x + 1] = False
face_zone = np.zeros_like(mask)
if a.eyes:
    ex = []; ey = []
    for pt in a.eyes.split(";"):
        xx_, yy_ = (float(v) for v in pt.split(","))
        ex.append(int((xx_ - bbox[0]) * scale)); ey.append(int((yy_ - bbox[1]) * scale))
    my = max(ey) + 4
    if a.mouth:
        my = int((float(a.mouth.split(",")[1]) - bbox[1]) * scale) + 1
    face_zone[max(0, min(ey) - 2): my + 1, max(0, min(ex) - 2): max(ex) + 3] = True
lines_all &= ~face_zone
for y, x in zip(*np.nonzero(lines_all)):
    out[y, x, :3] = line_shade(pal[idx[y, x]])

# 5b) face, drawn like the official sprites: lash row, iris + white, brow, mouth
def to_small(x, y):
    return int((x - bbox[0]) * scale), int((y - bbox[1]) * scale)
def put(y, x, c):
    if 0 <= y < nh and 0 <= x < nw and mask[y, x]:
        out[y, x, :3] = c
skin = pal[-1].astype(np.float64) if fixed else np.array([235, 200, 170.0])
def iris_colour(sx, sy):
    r = max(3, int(cell))
    patch = src[max(0, sy - r): sy + r, max(0, sx - r): sx + r, :3].reshape(-1, 3)
    pl = patch @ np.array([0.299, 0.587, 0.114])
    sel = patch[(pl > 40) & (pl < 150)]
    c = np.median(sel, 0) if len(sel) else np.array([60, 60, 90.0])
    return (c * 0.85).clip(0, 255).round()
if a.eyes:
    pts_ = [tuple(map(float, pt.split(","))) for pt in a.eyes.split(";")]
    cx = np.mean([p_[0] for p_ in pts_])
    for (sx_, sy_) in pts_:
        x, y = to_small(sx_, sy_)
        outer = -1 if (len(pts_) > 1 and sx_ < cx) else 1
        if len(pts_) == 1:
            outer = a.single_outer
        lash = (28, 24, 38)
        put(y - 1, x, lash); put(y - 1, x + outer, lash)
        put(y, x, iris_colour(int(sx_ - bbox[0]), int(sy_ - bbox[1])))
        put(y, x + outer, (244, 244, 248))
        if a.eyeh >= 3:
            put(y + 1, x, iris_colour(int(sx_ - bbox[0]), int(sy_ - bbox[1])) * 0.7)
        if a.brows:
            for bx in (x, x + outer):
                c = out[y - 3, bx, :3].astype(np.float64) if 0 <= y - 3 < nh else skin
                put(y - 3, bx, line_shade(c) if np.abs(c - skin).sum() < 60 else c * 0.6)
if a.mouth:
    x, y = to_small(*map(float, a.mouth.split(",")))
    for k in range(a.mouthw):
        put(y, x - a.mouthw // 2 + k, (skin * a.mouthdark).round())

# 6) frame + 1px outline outside the silhouette
F = max(a.frame, nw + 2, nh + 1)
frame = np.zeros((F, F, 4), np.uint8)
ox, oy = (F - nw) // 2, F - nh
frame[oy:oy + nh, ox:ox + nw] = out
op = frame[..., 3] > 0
ring = np.zeros_like(op)
ring[1:] |= op[:-1]; ring[:-1] |= op[1:]; ring[:, 1:] |= op[:, :-1]; ring[:, :-1] |= op[:, 1:]
ring &= ~op
# feet sit on the bottom row: outline the bottom with the silhouette's own last row instead
for y, x in zip(*np.nonzero(ring)):
    frame[y, x, :3] = (a.ink_rgb)
    frame[y, x, 3] = 255
Image.fromarray(frame).save(a.dst)
print("saved", a.dst, "sprite", (nw, nh), "colors", len(Image.fromarray(frame).getcolors(4096) or []))
