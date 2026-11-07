"""Android launcher icons and splash images: the game's Poké Ball sprite (ui/pb.png, frame "pb", 12x12)
scaled up pixel-sharp on the game's background colour. Run after `npx cap add android`:
    python3 scripts/app-icons.py
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
BG = (0x1D, 0x1A, 0x2B, 255)
RING = (0x57, 0x4A, 0x6E, 255)

atlas = json.loads((ROOT / "public/assets/ui/pb.json").read_text())
x, y, w, h = atlas["f"]["pb"][:4]
ball = Image.open(ROOT / "public/assets/ui/pb.png").convert("RGBA").crop((x, y, x + w, y + h))


def ball_at(size: int) -> Image.Image:
    return ball.resize((size, size), Image.NEAREST)


def square(px: int, ball_frac: float, round_: bool = False, transparent: bool = False) -> Image.Image:
    im = Image.new("RGBA", (px, px), (0, 0, 0, 0) if transparent else BG)
    if round_ or not transparent:
        mask = Image.new("L", (px, px), 0)
        d = ImageDraw.Draw(mask)
        if round_:
            d.ellipse((0, 0, px - 1, px - 1), fill=255)
        else:
            d.rounded_rectangle((0, 0, px - 1, px - 1), radius=px // 6, fill=255)
        base = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        base.paste(im, (0, 0), mask)
        im = base
        if not transparent:
            ring = ImageDraw.Draw(im)
            t = max(2, px // 32)
            if round_:
                ring.ellipse((t // 2, t // 2, px - 1 - t // 2, px - 1 - t // 2), outline=RING, width=t)
            else:
                ring.rounded_rectangle((t // 2, t // 2, px - 1 - t // 2, px - 1 - t // 2), radius=px // 6, outline=RING, width=t)
    s = max(12, int(px * ball_frac) // 12 * 12)  # whole-pixel scale keeps the sprite crisp
    b = ball_at(s)
    im.alpha_composite(b, ((px - s) // 2, (px - s) // 2))
    return im


DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, k in DENS.items():
    d = RES / f"mipmap-{name}"
    d.mkdir(parents=True, exist_ok=True)
    legacy = int(48 * k)
    square(legacy, 0.62).save(d / "ic_launcher.png")
    square(legacy, 0.62, round_=True).save(d / "ic_launcher_round.png")
    # adaptive icon foreground: 108dp canvas, keep the ball inside the 66dp safe zone
    square(int(108 * k), 0.5, transparent=True).save(d / "ic_launcher_foreground.png")

(RES / "values/ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D1A2B</color>\n</resources>\n'
)

# splash images: same sizes as the template's, background colour with the ball in the middle
for png in RES.glob("drawable*/splash.png"):
    W, H = Image.open(png).size
    im = Image.new("RGBA", (W, H), BG)
    s = max(12, int(min(W, H) * 0.22) // 12 * 12)
    im.alpha_composite(ball_at(s), ((W - s) // 2, (H - s) // 2))
    im.convert("RGB").save(png)
print("icons and splash written")
