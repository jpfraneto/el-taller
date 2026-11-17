"""woodkit: El Taller's wooden-sign graphics. One visual line for everything on screen.

Every graphic is wood planted on two posts that come up from the bottom of the frame, in the
lower half (the face stays clear; a sign takes the place of the captions while it's up):
  Sign       planks with routed letters (light pine, letters burned in) or painted ones
             (dark wood, letters in El Taller yellow). It rises in, wobbles and settles.
  Board      a pine board that carries a phone, a screenshot or a clip, with a dark label plank.
  TagPile    small pine tags falling into a messy pile (too many options).
  WoodTag    the small corner plaque (EL TALLER | ...).
  WoodEndCard
  synth_sfx  wooden knocks instead of digital whooshes.

Textures (no text) live in a folder set with setup(dir): pine-*.png, dark-*.png, rope.png
(rope on flat magenta). Ep. 02 made them with gpt-image (see el-taller/ep02-aubel/assets/wood/).
"""
import math, os, random, wave
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
import reelkit as rk
from reelkit import Element, W, H, ease_out

FONT = "/System/Library/Fonts/Supplemental/Rockwell.ttc"   # slab serif: reads like a routed sign
YELLOW = (255, 206, 62)
INK = (46, 28, 14)
WOOD_DIR = None
_boards, _cache = {}, {}


def setup(folder):
    global WOOD_DIR
    WOOD_DIR = folder
    _boards.clear(); _cache.clear()


def wfont(size, bold=True):
    return ImageFont.truetype(FONT, size, index=2 if bold else 0)


def ease_in(x):
    x = max(0.0, min(1.0, x))
    return x * x * x


# ------------------------------------------------------------------ textures
def _textures(kind):
    return [Image.open(os.path.join(WOOD_DIR, f)).convert("RGB")
            for f in sorted(os.listdir(WOOD_DIR)) if f.startswith(kind + "-") and f.endswith(".png")]


def boards(kind):
    """Single boards cut out of the textures (split at the dark seams between boards)."""
    if kind in _boards:
        return _boards[kind]
    out = []
    for im in _textures(kind):
        rows = np.asarray(im.convert("L"), np.float32).mean(1)
        sm = np.convolve(rows, np.ones(7) / 7, "same")
        med, sd = np.median(sm), sm.std()
        seams = []
        for r in np.where(sm < med - 1.1 * sd)[0]:
            if seams and r - seams[-1][-1] <= 10:
                seams[-1].append(r)
            else:
                seams.append([r])
        cuts = [0] + [int(np.mean(s)) for s in seams] + [im.height]
        for a, b in zip(cuts, cuts[1:]):
            if b - a > 110:
                out.append(im.crop((0, a + 10, im.width, b - 10)))
        if not out:
            out.append(im)
    _boards[kind] = out
    return out


def rope_strip(length, width=18):
    key = ("rope", width)
    if key not in _cache:
        im = Image.open(os.path.join(WOOD_DIR, "rope.png")).convert("RGB")
        a = np.asarray(im, np.int16)
        mag = (a[..., 0] > 170) & (a[..., 2] > 170) & (a[..., 1] < 110)
        alpha = np.where(mag, 0, 255).astype(np.uint8)
        rgba = im.convert("RGBA"); rgba.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))
        cols = np.where((alpha > 0).mean(0) > 0.3)[0]
        rgba = rgba.crop((cols.min(), 40, cols.max() + 1, im.height - 40))
        s = width / rgba.width
        _cache[key] = rgba.resize((width, int(rgba.height * s)), Image.LANCZOS)
    seg = _cache[key]
    out = Image.new("RGBA", (width, max(1, int(length))), (0, 0, 0, 0))
    y = 0
    while y < out.height:
        out.alpha_composite(seg, (0, y)); y += seg.height - 2
    return out


def _bevel(tex, mask, rim=9, strength=0.38):
    arr = np.asarray(tex, np.float32)
    h, w = mask.size[1], mask.size[0]
    soft = np.asarray(mask.filter(ImageFilter.GaussianBlur(2)), np.float32) / 255
    inner = np.asarray(mask.filter(ImageFilter.MinFilter(rim | 1)).filter(ImageFilter.GaussianBlur(rim / 2)), np.float32) / 255
    edge = np.clip(soft - inner, 0, 1)[..., None]
    light = (np.linspace(1, -1, h)[:, None] * 0.9 + np.linspace(0.5, -0.5, w)[None, :])[..., None]
    arr = arr * (1 + strength * edge * np.clip(light, 0, None))
    arr = arr * (1 - (strength + 0.15) * edge * np.clip(-light, 0, None))
    arr = arr * (1 - 0.10 * (np.abs(np.linspace(-1, 1, w)) ** 4))[None, :, None]   # darker end grain
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")
    img.putalpha(mask)
    return img


def plank(w, h, kind="pine", seed=0, arrow=None):
    """One board, w×h, beveled. arrow: None | 'l' | 'r' (pointed end, for signposts)."""
    rng = random.Random(seed)
    b = rng.choice(boards(kind))
    s = max(h / b.height, w / b.width)
    tex = b.resize((int(b.width * s) + 2, int(b.height * s) + 2), Image.LANCZOS)
    x0 = rng.randint(0, max(0, tex.width - w)); y0 = rng.randint(0, max(0, tex.height - h))
    tex = tex.crop((x0, y0, x0 + w, y0 + h))
    if rng.random() < 0.5:
        tex = tex.transpose(Image.FLIP_LEFT_RIGHT)
    m = Image.new("L", (w, h), 0); d = ImageDraw.Draw(m)
    tip = int(h * 0.45)
    if arrow == "r":
        d.polygon([(0, 0), (w - tip, 0), (w - 1, h / 2), (w - tip, h - 1), (0, h - 1)], fill=255)
    elif arrow == "l":
        d.polygon([(tip, 0), (w - 1, 0), (w - 1, h - 1), (tip, h - 1), (0, h / 2)], fill=255)
    else:
        d.rounded_rectangle((0, 0, w - 1, h - 1), max(6, h // 14), fill=255)
    return _bevel(tex, m)


def panel(w, h, kind="pine", seed=0):
    """A board made of several planks (for things that hang: phones, screenshots, clips)."""
    rng = random.Random(seed)
    tex = rng.choice(_textures(kind))
    s = max(w / tex.width, h / tex.height)
    tex = tex.resize((int(tex.width * s) + 2, int(tex.height * s) + 2), Image.LANCZOS).crop((0, 0, w, h))
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), 18, fill=255)
    return _bevel(tex, m, rim=13)


def nail(r=7):
    key = ("nail", r)
    if key not in _cache:
        s = 4
        im = Image.new("RGBA", (2 * r * s + 8, 2 * r * s + 8), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        c = r * s + 4
        d.ellipse((c - r * s + 3, c - r * s + 6, c + r * s + 3, c + r * s + 6), fill=(0, 0, 0, 110))
        for i in range(r * s, 0, -1):
            k = i / (r * s)
            v = int(70 + 120 * (1 - k) ** 0.7)
            d.ellipse((c - i - (1 - k) * 4, c - i - (1 - k) * 4, c + i - (1 - k) * 4, c + i - (1 - k) * 4), fill=(v, v - 6, v - 14, 255))
        _cache[key] = im.resize((im.width // s, im.height // s), Image.LANCZOS)
    return _cache[key]


# ------------------------------------------------------------------ lettering
def _text_mask(size, text, fnt, tracking=0, dy=0):
    w, h = size
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    if not tracking:
        d.text((w / 2, h / 2 + dy), text, font=fnt, fill=255, anchor="mm")
    else:
        widths = [fnt.getlength(c) + tracking for c in text]
        x = (w - (sum(widths) - tracking)) / 2
        for c, cw in zip(text, widths):
            d.text((x, h / 2 + dy), c, font=fnt, fill=255, anchor="lm"); x += cw
    return m


def text_width(text, fnt, tracking=0):
    return fnt.getlength(text) + tracking * max(0, len(text) - 1)


def letter(pl, text, fnt, mode, tracking=0, dy=0):
    """mode 'burn': routed into light pine, dark recess. 'paint': El Taller yellow on dark wood."""
    w, h = pl.size
    m = _text_mask((w, h), text, fnt, tracking, dy)
    arr = np.asarray(pl.convert("RGB"), np.float32)
    mm = np.asarray(m, np.float32)[..., None] / 255
    if mode == "burn":
        recess = arr * np.array([0.26, 0.19, 0.14])
        out = arr * (1 - mm) + recess * mm
        sh = ImageChops.subtract(m, ImageChops.offset(m, 4, 4)).filter(ImageFilter.GaussianBlur(1.2))
        hi = ImageChops.subtract(m, ImageChops.offset(m, -3, -3)).filter(ImageFilter.GaussianBlur(1.0))
        lip = ImageChops.subtract(ImageChops.offset(m, 2, 2), m).filter(ImageFilter.GaussianBlur(1.0))
        out = out * (1 - 0.55 * np.asarray(sh, np.float32)[..., None] / 255)
        out = out + 46 * np.asarray(hi, np.float32)[..., None] / 255
        out = out + 30 * np.asarray(lip, np.float32)[..., None] / 255
    else:
        lum = arr.mean(2, keepdims=True)
        tex = 0.86 + 0.14 * lum / max(1.0, lum.mean())
        paint = np.array(YELLOW, np.float32) * tex
        shadow = np.asarray(ImageChops.offset(m, 0, 4).filter(ImageFilter.GaussianBlur(2.5)), np.float32)[..., None] / 255
        out = arr * (1 - 0.55 * shadow)
        mp = np.asarray(m.filter(ImageFilter.GaussianBlur(0.6)), np.float32)[..., None] / 255
        out = out * (1 - mp) + paint * mp
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert("RGBA")
    img.putalpha(pl.getchannel("A"))
    return img


def plank_with_text(text, style, size, seed, maxw=980, minw=300, arrow=None):
    """style 'w' (pine, burned) | 'y' (dark, yellow paint) | 'k' (small pine kicker, spaced)."""
    key = ("pt", text, style, size, seed, maxw, arrow)
    if key in _cache:
        return _cache[key]
    tracking = int(size * 0.14) if style == "k" else int(size * 0.02)
    f = wfont(size)
    pad = int(size * 0.62) + (int(size * 0.45) if arrow else 0)
    while text_width(text, f, tracking) + 2 * pad > maxw and size > 24:
        size -= 3; f = wfont(size); tracking = int(size * 0.14) if style == "k" else int(size * 0.02)
    w = int(max(minw, text_width(text, f, tracking) + 2 * pad))
    h = int(size * (1.75 if style == "k" else 1.52))
    pl = plank(w, h, "dark" if style == "y" else "pine", seed, arrow)
    dx = (int(size * 0.2) if arrow == "r" else -int(size * 0.2) if arrow == "l" else 0)
    img = letter(pl, text, f, "paint" if style == "y" else "burn", tracking, dy=int(size * 0.04))
    if dx:
        img2 = Image.new("RGBA", img.size, (0, 0, 0, 0)); img2.alpha_composite(img)
        img = img2  # (centering offset handled by pad; arrow tip leaves room)
    _cache[key] = img
    return img


def blocks_plank(labels, pick, size, seed):
    """A plank with square wooden keys; `pick` is the pressed one (or None)."""
    key = ("blocks", tuple(labels), pick, size, seed)
    if key in _cache:
        return _cache[key]
    s = int(size * 1.9); gap = int(size * 0.5)
    w = len(labels) * s + (len(labels) + 1) * gap
    h = s + 2 * gap
    base = plank(w, h, "pine", seed)
    f = wfont(int(size * 1.15))
    for i, lab in enumerate(labels):
        x = gap + i * (s + gap)
        pressed = i == pick
        k = plank(s, s, "dark" if pressed else "pine", seed + 31 * (i + 1))
        k = letter(k, lab, f, "paint" if pressed else "burn")
        sh = Image.new("RGBA", (s + 20, s + 20), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((6, 10 if pressed else 14, s + 6, s + (10 if pressed else 14)), 12, fill=(0, 0, 0, 120))
        base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(5)), (x - 6, gap - 6))
        base.alpha_composite(k, (x, gap + (5 if pressed else 0)))
    _cache[key] = base
    return base


def shadow_of(img, blur=10, alpha=0.5):
    a = img.getchannel("A").point(lambda v: int(v * alpha))
    sh = Image.new("RGBA", img.size, (12, 7, 3, 0)); sh.putalpha(a)
    return sh.filter(ImageFilter.GaussianBlur(blur))


# ------------------------------------------------------------------ hanging things
def post(length, width=44, seed=0):
    key = ("post", int(length), width, seed)
    if key not in _cache:
        pl = plank(int(length) + 40, width, "pine", seed + 500).rotate(90, expand=True)
        arr = np.asarray(pl, np.float32)
        arr[..., :3] *= 0.78   # posts sit a little in the shade
        _cache[key] = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    return _cache[key]


class _Posted(Element):
    """Shared motion: planted on two wooden posts that come up from the bottom of the frame.
    It rises in, wobbles and settles, and sinks back down at the end. Subclasses build `items`
    (images stacked downward from `top`)."""
    hides_captions = False
    knock_at = 0.38   # seconds after t0 when it lands (for the sound)

    def __init__(self, t0, t1, top=980, cx=540, swing=1.0, seed=0):
        super().__init__(t0, t1)
        self.top, self.cx, self.swing, self.seed = top, cx, swing, seed
        self.spin = random.Random(seed).choice([-1, 1])

    def layout(self, t):
        raise NotImplementedError

    def post_xs(self, items):
        w = min(img.width for img, *_ in items)
        return [-(w / 2 - max(70, w * 0.2)), (w / 2 - max(70, w * 0.2))]

    def draw(self, base, t):
        k = t - self.t0
        if k < 0:
            return
        items = self.layout(t)
        if not items:
            return
        rise = ease_out(k / 0.45)
        sink = ease_in((t - (self.t1 - 0.35)) / 0.35)
        span = H - self.top + 40
        yoff = (1 - rise) * span + sink * span
        ang = self.spin * self.swing * 3.2 * math.exp(-k * 4.0) * math.sin(k * 9.0 + 0.3)
        cw = max(img.width for img, *_ in items) + 200
        top = min(y for img, x, y, a in items) - 30
        canvas = Image.new("RGBA", (cw, int(H + 60 - top)), (0, 0, 0, 0))
        ox = cw / 2
        px = self.post_xs(items)
        first_mid = items[0][2] + items[0][0].height * 0.5 - top
        for i, r in enumerate(px):
            pst = post(canvas.height - first_mid, 44, self.seed + i)
            canvas.alpha_composite(shadow_of(pst, 8, 0.4), (int(ox + r - pst.width / 2 + 8), int(first_mid + 6)))
            canvas.alpha_composite(pst, (int(ox + r - pst.width / 2), int(first_mid)))
        for img, x, y, a in items:
            if a <= 0:
                continue
            yy = y - top + (1 - ease_out(a)) * 60
            canvas.alpha_composite(shadow_of(img, 12, 0.5 * min(1, a)), (int(ox + x - img.width / 2 + 10), int(yy + 16)))
            im = img if a >= 1 else _fade(img, ease_out(a))
            canvas.alpha_composite(im, (int(ox + x - img.width / 2), int(yy)))
            for r in px:
                if abs(r - x) < img.width / 2 - 24:
                    n = nail()
                    for fy in ((0.5,) if img.height < 150 else (0.3, 0.7)):
                        canvas.alpha_composite(n, (int(ox + r - n.width / 2), int(yy + img.height * fy - n.height / 2)))
        if abs(ang) > 0.06:
            canvas = canvas.rotate(ang, Image.BICUBIC, center=(ox, canvas.height))
        x0, y0 = int(self.cx - ox), int(top + yoff)
        if y0 >= H:
            return
        cx0 = max(0, -x0)
        base.alpha_composite(canvas, (max(0, x0), y0), (cx0, 0, min(canvas.width, cx0 + W - max(0, x0)), min(canvas.height, H - y0)))


def _fade(img, a):
    im = img.copy()
    im.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    return im


class Sign(_Posted):
    """lines: [(text, style)] or [(text, style, size)]; style 'w' pine/burned, 'y' dark/yellow,
    'k' small kicker, ('1|2|3|4', 'blocks') keys. times: when each line appears (default all at t0).
    kicker: small plank on top (LO HUMANO, LA IDEA…). arrows: per-line None/'l'/'r'."""
    hides_captions = True

    def __init__(self, t0, t1, lines, kicker=None, top=980, size=92, times=None, cx=540, swing=1.0, seed=0,
                 arrows=None, pick=None, gap=14, is_title=False, maxw=980):
        super().__init__(t0, t1, top, cx, swing, seed)
        self.is_title = is_title
        rows = []
        if kicker:
            rows.append(dict(kind="text", text=kicker, style="k", size=max(40, int(size * 0.5)), arrow=None, t=t0))
        times = times or [t0] * len(lines)
        arrows = arrows or [None] * len(lines)
        for (ln, tt, ar) in zip(lines, times, arrows):
            text, style = ln[0], ln[1]
            sz = ln[2] if len(ln) > 2 else size
            rows.append(dict(kind="blocks" if style == "blocks" else "text", text=text, style=style, size=sz, arrow=ar, t=tt))
        self.rows, self.gap, self.maxw, self.pick = rows, gap, maxw, pick   # pick: (index, time)
        rng = random.Random(seed + 7)
        for i, r in enumerate(rows):
            r["seed"] = seed * 13 + i * 7 + 1
            r["dx"] = rng.uniform(-14, 14) if r["arrow"] is None else (-40 if r["arrow"] == "l" else 40)
            r["rot"] = rng.uniform(-1.3, 1.3)

    def _img(self, r, t):
        if r["kind"] == "blocks":
            labels = r["text"].split("|")
            picked = self.pick[0] if self.pick and t >= self.pick[1] else None
            img = blocks_plank(labels, picked, r["size"], r["seed"])
        else:
            img = plank_with_text(r["text"], r["style"], r["size"], r["seed"], self.maxw, arrow=r["arrow"])
        key = ("rot", id(img), r["rot"])
        if key not in _cache:
            _cache[key] = img.rotate(r["rot"], Image.BICUBIC, expand=True)
        return _cache[key]

    def layout(self, t):
        out, y = [], self.top
        for r in self.rows:
            a = (t - r["t"]) / 0.35 if r["t"] > self.t0 + 0.05 else 1.0
            if t < r["t"]:
                break
            img = self._img(r, t)
            out.append((img, r["dx"], y, min(1.0, a)))
            y += img.height + self.gap - 10
        return out


class Board(_Posted):
    """A pine board on ropes carrying `content`: a PIL image, or a function t → image.
    label: dark plank with yellow letters, nailed across the top of the board."""

    def __init__(self, t0, t1, content, label=None, top=250, cx=540, pad=30, seed=3, swing=0.8, size=None):
        super().__init__(t0, t1, top, cx, swing, seed)
        self.content = content
        sample = content(t0) if callable(content) else content
        self.cw, self.ch = sample.size
        self.pad = pad
        self.board = panel(self.cw + 2 * pad, self.ch + 2 * pad, "pine", seed)
        self.label = plank_with_text(label, "y", 40, seed + 5, maxw=self.cw + 2 * pad - 40, minw=200) if label else None

    def layout(self, t):
        c = self.content(t) if callable(self.content) else self.content
        img = self.board.copy()
        sh = shadow_of(c, 8, 0.55)
        img.alpha_composite(sh, (self.pad + 4, self.pad + 8))
        img.alpha_composite(c, (self.pad, self.pad))
        items = []
        if self.label:
            items.append((self.label, 0, self.top, 1.0))
            items.append((img, 0, self.top + self.label.height - 26, 1.0))
            # label sits in front of the board's top edge
            items = [items[1], items[0]]
        else:
            items.append((img, 0, self.top, 1.0))
        return items

    def post_xs(self, items):
        w = self.board.width
        return [-(w / 2 - 90), (w / 2 - 90)]


def rounded(img, r):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    out = img.convert("RGBA"); out.putalpha(ImageChops.multiply(out.getchannel("A"), m))
    return out


class PhoneScreen:
    """Phone frame around a (long) mobile screenshot; scroll [(t, css_px)] like ep02kit.Phone."""

    def __init__(self, path, screen_w=400, scroll=None):
        src = Image.open(path).convert("RGB")
        self.screen = src.resize((screen_w, int(src.height * screen_w / src.width)), Image.LANCZOS).convert("RGBA")
        self.sw, self.sh = screen_w, int(screen_w * 844 / 390)
        self.k = screen_w / 390
        self.scroll = scroll or [(0, 0)]
        bez = 18
        fw, fh = self.sw + 2 * bez, self.sh + 2 * bez
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        d.rounded_rectangle((0, 0, fw - 1, fh - 1), 64, fill=(22, 20, 19, 255))
        d.rounded_rectangle((3, 3, fw - 4, fh - 4), 62, outline=(78, 74, 70, 255), width=3)
        self.frame, self.bez = frame, bez
        self.mask = Image.new("L", (self.sw, self.sh), 0)
        ImageDraw.Draw(self.mask).rounded_rectangle((0, 0, self.sw - 1, self.sh - 1), 48, fill=255)
        self._last = None

    def offset(self, t):
        pts = self.scroll
        if t <= pts[0][0]:
            return pts[0][1]
        for (ta, ya), (tb, yb) in zip(pts, pts[1:]):
            if ta <= t <= tb:
                x = (t - ta) / max(1e-6, tb - ta)
                return ya + (yb - ya) * x * x * (3 - 2 * x)
        return pts[-1][1]

    def __call__(self, t):
        y = int(min(self.offset(t) * self.k, self.screen.height - self.sh))
        if self._last and self._last[0] == y:
            return self._last[1]
        scr = self.screen.crop((0, y, self.sw, y + self.sh)); scr.putalpha(self.mask)
        ph = self.frame.copy(); ph.alpha_composite(scr, (self.bez, self.bez))
        ImageDraw.Draw(ph).rounded_rectangle((ph.width / 2 - 62, self.bez + 12, ph.width / 2 + 62, self.bez + 46), 18, fill=(0, 0, 0, 255))
        self._last = (y, ph)
        return ph


class ClipScreen:
    """Frames of a clip, played once then held, in a rounded frame."""

    def __init__(self, frames_dir, t0, fps=30):
        self.files = sorted(os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".jpg"))
        self.t0, self.fps = t0, fps
        self._c = {}

    def __call__(self, t):
        i = max(0, min(len(self.files) - 1, int((t - self.t0) * self.fps)))
        if i not in self._c:
            self._c = {i: rounded(Image.open(self.files[i]).convert("RGBA"), 22)}
        return self._c[i]


class TagPile(Element):
    """Small pine tags (one per item) tumbling into a messy pile, then swaying, dizzy."""
    hides_captions = True

    def __init__(self, t0, t1, items, every=0.17, region=(120, 960, 980, 1500), seed=5, size=44):
        super().__init__(t0, t1)
        rng = random.Random(seed)
        self.tags = []
        for i, s in enumerate(items):
            img = plank_with_text(s, "y" if i % 4 == 0 else "w", size, seed * 3 + i, maxw=700, minw=160)
            x = rng.uniform(region[0] + img.width / 2, region[1] - img.width / 2)
            y = rng.uniform(region[2], region[3])
            self.tags.append((t0 + i * every, img, x, y, rng.uniform(-14, 14), rng.uniform(0, 6.28)))

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.35)
        for ti, img, x, y, rot, ph in self.tags:
            k = (t - ti) / 0.42
            if k <= 0:
                continue
            fall = min(1, k)
            yy = -200 + (y + 200) * fall * fall
            if k > 1:
                yy = y - 22 * math.exp(-(k - 1) * 6) * abs(math.sin((k - 1) * 9))
            a = rot + (1 - min(1, k)) * 30 + 2.5 * math.sin(t * 2.2 + ph) * min(1, max(0, k - 1))
            im = img.rotate(a, Image.BICUBIC, expand=True)
            sh = shadow_of(im, 10, 0.45 * out)
            base.alpha_composite(sh, (int(x - im.width / 2 + 8), int(yy - im.height / 2 + 14)))
            base.alpha_composite(_fade(im, out) if out < 1 else im, (int(x - im.width / 2), int(yy - im.height / 2)))


class WoodTag(Element):
    """Corner plaque: EL TALLER (dark, yellow) + the episode line (pine, burned). Slides in at t0."""

    def __init__(self, t0, main, sub, y=150, x=36):
        super().__init__(t0, 1e9)
        a = plank_with_text(main, "y", 34, 901, minw=120)
        b = plank_with_text(sub, "w", 30, 902, maxw=800, minw=120)
        img = Image.new("RGBA", (a.width + b.width + 4, max(a.height, b.height) + 20), (0, 0, 0, 0))
        img.alpha_composite(shadow_of(a, 6, 0.5), (6, 10)); img.alpha_composite(shadow_of(b, 6, 0.5), (a.width - 6, 12))
        img.alpha_composite(b, (a.width - 10, (a.height - b.height) // 2 + 2)); img.alpha_composite(a, (0, 0))
        self.img, self.x, self.y = img, x, y

    def draw(self, base, t):
        k = ease_out((t - self.t0) / 0.5)
        x = int(self.x - (1 - k) * (self.img.width + self.x))
        base.alpha_composite(self.img, (max(0, x), self.y), (max(0, -x), 0))


class WoodEndCard(Element):
    """Blurred last frame + one hanging sign: EL TALLER, the episode, the question, the handle."""

    def __init__(self, t0, dur, still_path, ep, cta_lines, tagline=rk.TAGLINE, handle=rk.HANDLE):
        super().__init__(t0, t0 + dur)
        bg = Image.open(still_path).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(26))
        self.bg = Image.blend(bg, Image.new("RGB", (W, H), (14, 9, 5)), 0.5).convert("RGBA")
        lines = [("EL TALLER", "y", 128)] + [(s, "y" if hl else "w", 54) for s, hl in cta_lines]
        times = [t0 + 0.15, t0 + 0.55, t0 + 0.75][:1] + [t0 + 0.5 + 0.18 * i for i in range(len(cta_lines))]
        self.sign = Sign(t0 + 0.15, t0 + dur + 5, lines, kicker=ep, top=700, times=times, seed=77, swing=0.8)
        self.handle = rk.text_layer(handle, wfont(54), YELLOW + (255,), stroke=0)
        self.tagline = rk.text_layer(tagline.upper(), wfont(28, bold=False), (245, 236, 220, 255), stroke=0, tracking=4)

    def draw(self, base, t):
        k = ease_out((t - self.t0) / 0.35)
        bg = self.bg.copy(); bg.putalpha(self.bg.getchannel("A").point(lambda v: int(v * k)))
        base.alpha_composite(bg)
        self.sign.draw(base, t)
        kh = ease_out((t - self.t0 - 0.9) / 0.4)
        if kh > 0:
            rk.paste_center(base, self.handle, 540, 470, alpha=kh)
            rk.paste_center(base, self.tagline, 540, 545, alpha=kh * 0.9)


# ------------------------------------------------------------------ sound
ALIAS = {"knock": "knock", "stamp": "knock", "hit": "thud", "thump": "thud", "pop": "tap", "ding": "tap",
         "tick": "tap", "tap": "tap", "thud": "thud", "creak": "creak"}


def synth_sfx(events, total, path, sr=48000):
    """Wooden sounds: knock (a sign lands), tap (small tag / key), thud (big board), creak (rope)."""
    out = np.zeros(int((total + 1) * sr), np.float32)
    rng = np.random.default_rng(3)
    for t, kind in events:
        kind = ALIAS.get(kind)
        if not kind:
            continue
        i = int(max(0, t) * sr)
        if kind in ("knock", "tap", "thud"):
            f0, dec, amp = {"knock": (190, 34, 0.32), "tap": (420, 55, 0.16), "thud": (105, 22, 0.42)}[kind]
            f0 *= rng.uniform(0.93, 1.07)
            n = int(0.35 * sr); tt = np.arange(n) / sr
            body = (np.sin(2 * math.pi * f0 * tt) + 0.55 * np.sin(2 * math.pi * f0 * 2.3 * tt + 0.7)
                    + 0.3 * np.sin(2 * math.pi * f0 * 4.1 * tt + 1.3)) * np.exp(-tt * dec)
            click = rng.standard_normal(n) * np.exp(-tt * 420) * 0.6
            click = np.convolve(click, np.ones(6) / 6, "same")
            sig = (body * 0.8 + click) * amp
            if kind != "tap":   # a second, softer bounce
                j = int(0.07 * sr)
                sig2 = np.zeros(n + j, np.float32); sig2[:n] += sig; sig2[j:] += sig * 0.28
                sig = sig2
        elif kind == "creak":
            n = int(0.45 * sr); tt = np.arange(n) / sr
            f = 300 + 120 * np.sin(tt * 9)
            sig = np.sign(np.sin(2 * math.pi * np.cumsum(f) / sr)) * np.exp(-((tt - 0.2) / 0.12) ** 2) * 0.025
        seg = sig[: len(out) - i]
        out[i:i + len(seg)] += seg
    out = np.clip(out, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((out * 32767).astype(np.int16).tobytes())


def auto_sfx(elems):
    """The sound of the wood, from the elements themselves: a knock when a sign lands, a tap for
    each plank or tag added later, a thud for boards and the end card, a knock for a pressed key."""
    ev = []
    for e in elems:
        if isinstance(e, WoodEndCard):
            ev += [(e.t0 + 0.15 + e.sign.knock_at, "thud")]
        elif isinstance(e, Board):
            ev.append((e.t0 + e.knock_at, "thud"))
        elif isinstance(e, Sign):
            ev.append((e.t0 + e.knock_at, "thud" if e.is_title else "knock"))
            ev += [(r["t"] + 0.25, "tap") for r in e.rows if r["t"] > e.t0 + 0.05]
            if e.pick:
                ev.append((e.pick[1], "knock"))
        elif isinstance(e, TagPile):
            ev += [(ti + 0.42, "tap") for ti, *_ in e.tags]
        elif isinstance(e, WoodTag):
            ev.append((e.t0 + 0.4, "tap"))
    return ev
