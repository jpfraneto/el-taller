"""covers: one composition per El Taller row, sliced into the 3 reel covers.

The row is one 3240x1920 image (three 1080x1920 reel covers side by side). Instagram's
profile grid shows only the middle 1080x1440 of each cover (3:4), so everything that
must read on the grid lives in the band y = 240..1680.

  background  the empty workshop (el-taller/brand/taller-vacio.jpg), the same in every row
  host        JP cut out of that episode's take (Apple Vision mask, see cutout.swift)
  type        episode + business name across the row, act label on each tile

usage (from an episode's make_cover.py):
    import covers
    covers.build(Row(...), out_dir)
"""
import os, subprocess
from dataclasses import dataclass, field
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageEnhance
import numpy as np
import reelkit as rk

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
BG = f"{ROOT}/el-taller/brand/taller-vacio.jpg"
CUTOUT = f"{HERE}/.cutout"

TW, TH = 1080, 1920          # one reel cover
RW, RH = TW * 3, TH          # the whole row
GRID_TOP, GRID_BOT = 240, 1680   # what the profile grid shows (3:4)
ACTS = ["EL CASO", "EL NUDO", "LA PROPUESTA"]


@dataclass
class Row:
    ep: str                      # "EPISODIO 3" → kicker "EL TALLER · EPISODIO 3" on tile 1
    title: str                   # "LA JUNTA"
    subtitle: str                # "Escalada · Puerto Varas"
    host_frame: str              # 1080x1920 still from the take
    host_x: int = 1620           # where JP's center goes in the row (1620 = middle tile)
    host_scale: float = 1.0
    host_y: int = 0              # extra vertical shift
    handle: str | None = None    # their Instagram handle, shown on tile 1: [IG] (pfp) @handle
    pfp: str | None = None       # their Instagram profile picture (square)
    website: str | None = None   # shown under the handle, Instagram-link style (replaces the subtitle)
    logo: str | None = None      # fallback when there's no handle: business logo (white, transparent)
    accent: tuple = rk.YELLOW
    acts: list = field(default_factory=lambda: list(ACTS))


def _mask(frame):
    m = frame.rsplit(".", 1)[0] + ".mask.png"
    if not os.path.exists(m):
        if not os.path.exists(CUTOUT):
            subprocess.run(["swiftc", "-O", f"{HERE}/cutout.swift", "-o", CUTOUT], check=True)
        subprocess.run([CUTOUT, frame, m], check=True, capture_output=True)
    return Image.open(m).convert("L")


def background():
    im = Image.open(BG)
    im = ImageOps.exif_transpose(im).convert("RGB")
    s = RW / im.width
    im = im.resize((RW, round(im.height * s)), Image.LANCZOS)
    y0 = (im.height - RH) // 2
    im = im.crop((0, y0, RW, y0 + RH))
    # soft depth + grade: the workshop is the stage, not the subject
    im = im.filter(ImageFilter.GaussianBlur(3))
    im = ImageEnhance.Color(im).enhance(0.85)
    im = ImageEnhance.Brightness(im).enhance(0.62)
    arr = np.asarray(im).astype(np.float32)
    yy = np.linspace(0, 1, RH)[:, None, None]
    shade = 1 - 0.55 * np.clip((yy - 0.62) / 0.38, 0, 1) ** 1.3 - 0.45 * np.clip((0.30 - yy) / 0.30, 0, 1) ** 1.5
    return Image.fromarray(np.clip(arr * shade, 0, 255).astype(np.uint8)).convert("RGBA")


def host(row):
    fr = Image.open(row.host_frame).convert("RGBA")
    m = _mask(row.host_frame).filter(ImageFilter.GaussianBlur(1.2))
    fr.putalpha(m)
    bbox = m.point(lambda v: 255 if v > 40 else 0).getbbox()
    fr = fr.crop(bbox)
    w, h = round(fr.width * row.host_scale), round(fr.height * row.host_scale)
    fr = fr.resize((w, h), Image.LANCZOS)
    fr = ImageEnhance.Contrast(fr).enhance(1.05)
    # fade the bottom so he sits in the dark band instead of being cut hard
    a = np.asarray(fr.getchannel("A")).astype(np.float32)
    fade = np.clip((h - np.arange(h)) / (h * 0.28), 0, 1)[:, None]
    fr.putalpha(Image.fromarray((a * fade).astype(np.uint8)))
    return fr


def _text(s, weight, size, color, tracking=0):
    return rk.text_layer(s, rk.font(weight, size), color, stroke=0, tracking=tracking)


def _tight(layer):
    return layer.crop(layer.getbbox())


def ig_glyph(size, color=rk.WHITE):
    """The Instagram camera mark, drawn (rounded square + lens + dot)."""
    S = 4  # supersample
    n = size * S
    g = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    w = round(n * 0.085)
    d.rounded_rectangle((w // 2, w // 2, n - w // 2, n - w // 2), radius=round(n * 0.28), outline=color, width=w)
    r = n * 0.215
    d.ellipse((n / 2 - r, n / 2 - r, n / 2 + r, n / 2 + r), outline=color, width=w)
    dr = n * 0.06
    cx, cy = n * 0.745, n * 0.255
    d.ellipse((cx - dr, cy - dr, cx + dr, cy + dr), fill=color)
    return g.resize((size, size), Image.LANCZOS)


def avatar(path, size, ring=10):
    """Round profile picture with Instagram's gradient ring."""
    S = 3
    n = size * S
    pic = ImageOps.fit(Image.open(path).convert("RGB"), (n, n), Image.LANCZOS)
    # gradient ring: yellow → orange → pink → purple, bottom-left to top-right
    yy, xx = np.mgrid[0:n, 0:n] / n
    k = np.clip((xx + (1 - yy)) / 2, 0, 1)[..., None]
    stops = np.array([(254, 218, 117), (250, 126, 30), (214, 41, 118), (150, 47, 191)], np.float32)
    seg = np.minimum((k * 3).astype(int), 2)
    f = k * 3 - seg
    grad = stops[seg[..., 0]] * (1 - f) + stops[np.minimum(seg[..., 0] + 1, 3)] * f
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    ringim = Image.fromarray(grad.astype(np.uint8)).convert("RGBA")
    m = Image.new("L", (n, n), 0); ImageDraw.Draw(m).ellipse((0, 0, n - 1, n - 1), fill=255)
    out.paste(ringim, (0, 0), m)
    gap = ring * S
    ImageDraw.Draw(out).ellipse((gap, gap, n - 1 - gap, n - 1 - gap), fill=(16, 16, 16, 255))
    inner = gap + 4 * S
    pm = Image.new("L", (n, n), 0); ImageDraw.Draw(pm).ellipse((inner, inner, n - 1 - inner, n - 1 - inner), fill=255)
    out.paste(pic, (0, 0), pm)
    return out.resize((size, size), Image.LANCZOS)


def profile_chip(handle, pfp=None, h=150, text_size=None, glyph=False):
    """(pfp) @handle on one line; the pfp's gradient ring already says "Instagram"."""
    parts = [ig_glyph(round(h * 0.52))] if glyph else []
    if pfp:
        parts.append(avatar(pfp, h))
    t = _tight(_text("@" + handle.lstrip("@"), "Bold", text_size or round(h * 0.42), rk.WHITE))
    parts.append(t)
    gap = round(h * 0.16)
    w = sum(p.width for p in parts) + gap * (len(parts) - 1)
    chip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = 0
    for p in parts:
        chip.alpha_composite(p, (x, (h - p.height) // 2))
        x += p.width + gap
    # soft shadow so it reads over the busy workshop
    sh = Image.new("RGBA", chip.size, (0, 0, 0, 0)); sh.putalpha(chip.getchannel("A").point(lambda v: int(v * 0.7)))
    pad = 40
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    out.alpha_composite(sh, (pad, pad + 4)); out = out.filter(ImageFilter.GaussianBlur(14))
    out.alpha_composite(chip, (pad, pad))
    return out


def link_glyph(size, color=rk.WHITE):
    """Instagram's chain-link mark: two rounded links at 45°."""
    S = 4; n = size * S
    g = Image.new("RGBA", (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    w, h, lw = n * 0.62, n * 0.30, round(n * 0.085)
    for dx in (-n * 0.17, n * 0.17):
        x0, y0 = n / 2 - w / 2 + dx, n / 2 - h / 2
        d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=h / 2, outline=color, width=lw)
    g = g.rotate(45, Image.BICUBIC)
    return g.resize((size, size), Image.LANCZOS)


def website_line(url, size=80):
    """🔗 lajuntaescalada.cl, like the link in an Instagram bio."""
    t = _tight(_text(url, "Bold", size, (224, 241, 255, 255)))
    ic = link_glyph(round(size * 0.95), (224, 241, 255, 255))
    gap = round(size * 0.3)
    out = Image.new("RGBA", (ic.width + gap + t.width + 80, max(ic.height, t.height) + 80), (0, 0, 0, 0))
    out.alpha_composite(ic, (40, 40 + (out.height - 80 - ic.height) // 2))
    out.alpha_composite(t, (40 + ic.width + gap, 40 + (out.height - 80 - t.height) // 2))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0)); sh.putalpha(out.getchannel("A").point(lambda v: int(v * 0.75)))
    sh = sh.filter(ImageFilter.GaussianBlur(12))
    sh.alpha_composite(out)
    return sh


def compose(row):
    im = background()
    h = host(row)
    hx = row.host_x - h.width // 2
    hy = GRID_BOT - h.height + 60 + row.host_y
    # shadow behind the host for separation
    sh = Image.new("RGBA", h.size, (0, 0, 0, 0)); sh.putalpha(h.getchannel("A").point(lambda v: int(v * 0.55)))
    sh = sh.filter(ImageFilter.GaussianBlur(30))
    im.alpha_composite(sh, (hx + 10, hy + 20))
    im.alpha_composite(h, (hx, hy))

    # top of the grid band, across the row:
    #   EL TALLER · EPISODIO 3
    #   [IG] (pfp) @their_handle      (or the business name when there's no handle)
    #   RUBRO · CIUDAD
    kick = _tight(_text(f"EL TALLER · {row.ep}".upper(), "Bold", 64, row.accent, tracking=10))
    y = GRID_TOP + 200   # clear of the reel icon Instagram draws in each tile's top-right corner
    im.alpha_composite(kick, ((RW - kick.width) // 2, y))
    y += kick.height + 10
    if row.handle:
        head = profile_chip(row.handle, row.pfp, h=300, text_size=210)   # has a 40px shadow margin
        im.alpha_composite(head, ((RW - head.width) // 2, y))
        y += head.height - 30
    else:
        head = _tight(_text(row.title, "Black", 300, rk.WHITE, tracking=4))
        im.alpha_composite(head, ((RW - head.width) // 2, y + 20))
        y += head.height + 50
    if row.website:
        link = website_line(row.website)
        im.alpha_composite(link, ((RW - link.width) // 2, y - 10))
    else:
        sub = _tight(_text(row.subtitle.upper(), "Bold", 46, rk.WHITE, tracking=8))
        im.alpha_composite(sub, ((RW - sub.width) // 2, y))

    # act label on each tile, bottom of the grid band
    for i, act in enumerate(row.acts):
        n = _text(f"{i + 1}/3", "Black", 64, row.accent)
        a = _text(act, "Black", 64, rk.WHITE, tracking=3)
        gap = 22
        x0 = i * TW + (TW - (n.width + gap + a.width)) // 2
        y = GRID_BOT - 130
        im.alpha_composite(n, (x0, y))
        im.alpha_composite(a, (x0 + n.width + gap, y))
    return im


def slice_row(im):
    return [im.crop((i * TW, 0, (i + 1) * TW, TH)).convert("RGB") for i in range(3)]


def grid_preview(tiles, rows_below=None, w=1170):
    """What the row looks like on a phone profile: 3:4 crops with 3px gutters."""
    g = 3
    cw = (w - 2 * g) // 3
    ch = round(cw * 4 / 3)
    rows = [tiles] + (rows_below or [])
    out = Image.new("RGB", (w, len(rows) * ch + (len(rows) - 1) * g), (0, 0, 0))
    for r, tl in enumerate(rows):
        for i, t in enumerate(tl):
            c = t.crop((0, GRID_TOP, TW, GRID_BOT)).resize((cw, ch), Image.LANCZOS)
            out.paste(c, (i * (cw + g), r * (ch + g)))
    return out


def build(row, out_dir, slug):
    os.makedirs(out_dir, exist_ok=True)
    im = compose(row)
    im.convert("RGB").save(f"{out_dir}/{slug}-row.jpg", quality=92)
    tiles = slice_row(im)
    for i, t in enumerate(tiles):
        t.save(f"{out_dir}/{slug}-cover-{i + 1}of3.jpg", quality=95)
    grid_preview(tiles).save(f"{out_dir}/{slug}-grid-preview.jpg", quality=90)
    return tiles
