"""ig_mock: what the El Taller profile looks like on a phone (Instagram dark mode).

usage: tools/.venv/bin/python tools/ig_mock.py el-taller/ep03-la-junta/cover/ep03-cover-{1,2,3}of3.jpg [more rows...] -o out.png
Rows are given newest first, 3 covers each. Each cover is cropped to the 3:4 grid tile.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageOps
import reelkit as rk

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
PFP = f"{ROOT}/el-taller/brand/pfp.jpg"

W = 1170                     # iPhone width in px (390 pt @3x)
BG, FG, MUTED, BTN = (0, 0, 0), (245, 245, 245), (168, 168, 168), (38, 38, 38)
HANDLE, NAME = "eltallerconjp", "El Taller con JP"
BIO = ["Cuéntame de tu negocio y te doy ideas.",
       "Analizo un negocio real, propongo qué construir, y lo construyo.",
       "Puerto Varas, Chile",
       "↓ Cuéntame del tuyo"]


def f(weight, size):
    return rk.font(weight, size)


def circle(img, d):
    img = ImageOps.fit(img.convert("RGB"), (d, d), Image.LANCZOS)
    m = Image.new("L", (d * 3, d * 3), 0); ImageDraw.Draw(m).ellipse((0, 0, d * 3 - 1, d * 3 - 1), fill=255)
    out = Image.new("RGBA", (d, d)); out.paste(img, (0, 0), m.resize((d, d), Image.LANCZOS))
    return out


def reel_icon(s=42):
    """The little 'reel' play mark in the corner of a grid tile."""
    g = Image.new("RGBA", (s * 4, s * 4), (0, 0, 0, 0)); d = ImageDraw.Draw(g); n = s * 4
    d.rounded_rectangle((6, 6, n - 6, n - 6), radius=n // 4, outline=(255, 255, 255, 255), width=n // 12)
    d.polygon([(n * 0.40, n * 0.32), (n * 0.40, n * 0.70), (n * 0.70, n * 0.51)], fill=(255, 255, 255, 255))
    return g.resize((s, s), Image.LANCZOS)


def mock(rows, out):
    gap = 3
    tw = (W - 2 * gap) // 3
    th = round(tw * 4 / 3)
    top_h = 1150
    H = top_h + len(rows) * (th + gap) + 150
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)

    # status + top bar
    d.text((80, 40), "9:41", font=f("Semibold", 46), fill=FG)
    d.text((W // 2, 190), HANDLE, font=f("Bold", 54), fill=FG, anchor="mm")
    d.text((60, 190), "‹", font=f("Medium", 90), fill=FG, anchor="lm")

    # avatar + stats
    av = circle(Image.open(PFP), 260)
    im.paste(av, (48, 280), av)
    for i, (num, lab) in enumerate([("3", "posts"), ("3", "followers"), ("1", "following")]):
        cx = 470 + i * 230
        d.text((cx, 370), num, font=f("Bold", 52), fill=FG, anchor="mm")
        d.text((cx, 432), lab, font=f("Regular", 40), fill=FG, anchor="mm")

    # name + bio
    y = 580
    d.text((48, y), NAME, font=f("Semibold", 42), fill=FG); y += 58
    for line in BIO:
        d.text((48, y), line, font=f("Regular", 40), fill=FG); y += 54

    # buttons
    y += 30
    for i, lab in enumerate(["Edit profile", "Share profile"]):
        x0 = 48 + i * 545
        d.rounded_rectangle((x0, y, x0 + 525, y + 92), 22, fill=BTN)
        d.text((x0 + 262, y + 46), lab, font=f("Semibold", 40), fill=FG, anchor="mm")

    # tabs
    ty = y + 92 + 80
    for i in range(3):
        cx = W // 6 + i * W // 3
        d.rounded_rectangle((cx - 26, ty - 26, cx + 26, ty + 26), 6, outline=FG if i == 0 else MUTED, width=5)
    d.rectangle((0, ty + 52, W // 3, ty + 57), fill=FG)
    top_h = ty + 62

    # grid
    ri = reel_icon()
    for r, covers in enumerate(rows):
        for c, path in enumerate(covers):
            cv = Image.open(path).convert("RGB")
            tile = cv.crop((0, 240, 1080, 1680)).resize((tw, th), Image.LANCZOS)
            x, yy = c * (tw + gap), top_h + r * (th + gap)
            im.paste(tile, (x, yy))
            im.paste(ri, (x + tw - ri.width - 18, yy + 18), ri)
    im.save(out, quality=92)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("covers", nargs="+")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    rows = [a.covers[i:i + 3] for i in range(0, len(a.covers), 3)]
    print(mock(rows, a.out))
