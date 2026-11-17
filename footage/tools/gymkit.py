"""gymkit: multi-clip vertical reels in the Endémico (@endemico.ft) visual line.

Brand cues taken from their feed: dark navy/black, neon lime accent, heavy
condensed italic type that mixes solid and outline words, small lime dash rows
and "//" marks, letter-spaced lime subtitles, wide ENDÉMICO wordmark, moody
blue-teal grade.

A reel is a list of shots. Each shot has a picture (clip + start) and
optionally a voice line (clip + start/end). When the voice comes from another
clip, the picture's own sound plays underneath as room tone.
"""
import json, math, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import reelkit as rk

W, H, FPS = 1080, 1920, 30
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # footage/
CLIPS = f"{ROOT}/raw/2026-10-21_endemico_clase-seba"
WORDS = f"{ROOT}/clients/endemico/transcript/words"
WAVS = f"{ROOT}/clients/endemico/transcript"

LIME = (78, 240, 62, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
NAVY = (7, 11, 22, 255)

COND = "/System/Library/Fonts/Avenir Next Condensed.ttc"


def heavy(size):  # headline face: Avenir Next Condensed Heavy Italic
    return ImageFont.truetype(COND, size, index=9)


def demi(size):  # subtitles: Demi Bold Italic
    return ImageFont.truetype(COND, size, index=3)


def black(size):  # wordmark base
    return ImageFont.truetype("/Library/Fonts/SF-Pro-Display-Black.otf", size)


ease_out, ease_back = rk.ease_out, rk.ease_back
paste = rk.paste_center


def clip01(x):
    return max(0.0, min(1.0, x))


# ------------------------------------------------------------------ type
def txt(text, fnt, fill=WHITE, outline=0, tracking=0, shadow=True, stroke=0):
    """Tight RGBA text. outline>0 draws only the contour (brand 'outline' words)."""
    pad = 40 + outline + stroke
    adv = [fnt.getlength(c) + tracking for c in text]
    tw = int(sum(adv) - tracking) if tracking else int(fnt.getlength(text))
    asc, desc = fnt.getmetrics()
    size = (tw + 2 * pad, asc + desc + 2 * pad)

    def mask(sw):
        m = Image.new("L", size, 0)
        d = ImageDraw.Draw(m)
        if tracking:
            x = pad
            for c, a in zip(text, adv):
                d.text((x, pad), c, font=fnt, fill=255, stroke_width=sw, stroke_fill=255)
                x += a
        else:
            d.text((pad, pad), text, font=fnt, fill=255, stroke_width=sw, stroke_fill=255)
        return m

    body = mask(0)
    if outline:
        body = Image.fromarray(np.clip(np.asarray(mask(outline), np.int16) - np.asarray(body, np.int16), 0, 255).astype(np.uint8))
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    if shadow:
        sm = mask(max(outline, stroke) + 4).filter(ImageFilter.GaussianBlur(14))
        sh = Image.new("RGBA", size, (0, 0, 0, 0))
        sh.putalpha(sm.point(lambda v: int(v * 0.55)))
        img.alpha_composite(sh, (0, 0))
    if stroke:
        st = Image.new("RGBA", size, BLACK)
        st.putalpha(mask(stroke))
        img.alpha_composite(st)
    col = Image.new("RGBA", size, fill)
    col.putalpha(body)
    img.alpha_composite(col)
    # crop to the glyphs (not the soft shadow) so spacing and alignment stay true
    ref = mask(max(outline, stroke))
    bb = ref.getbbox()
    if not bb:
        return img
    m = 16
    return img.crop((max(0, bb[0] - m), max(0, bb[1] - m), min(size[0], bb[2] + m), min(size[1], bb[3] + m + 6)))


def para_box(w, h, fill, skew=0.22):
    """Lime parallelogram (italic box), like the dash marks on their covers."""
    off = int(h * skew)
    img = Image.new("RGBA", (w + off, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).polygon([(off, 0), (w + off, 0), (w, h), (0, h)], fill=fill)
    return img


def dash_row(n=7, w=16, h=7, gap=6, fill=LIME):
    img = Image.new("RGBA", (n * (w + gap) + 4, h), (0, 0, 0, 0))
    for i in range(n):
        img.alpha_composite(para_box(w, h, fill, skew=0.6), (i * (w + gap), 0))
    return img


def slashes(h=40, fill=LIME, n=2):
    w = int(h * 0.42)
    img = Image.new("RGBA", (n * (w + 6) + h // 2, h), (0, 0, 0, 0))
    for i in range(n):
        img.alpha_composite(para_box(w, h, fill if i == 0 else (fill[0], fill[1], fill[2], 140), skew=0.5), (i * (w + 6), 0))
    return img


def corner(size=46, th=6, fill=LIME):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, size, th), fill=fill)
    d.rectangle((size - th, 0, size, size), fill=fill)
    return img


def wordmark(width=520, color=WHITE):
    """Wide ENDÉMICO wordmark (SF Black, stretched + tracked), lime accent on the É."""
    f = black(120)
    base = txt("ENDEMICO", f, color, tracking=10, shadow=False)
    base = base.resize((int(base.width * 1.32), base.height), Image.LANCZOS)
    s = width / base.width
    base = base.resize((width, int(base.height * s)), Image.LANCZOS)
    img = Image.new("RGBA", (base.width, base.height + int(base.height * 0.42)), (0, 0, 0, 0))
    img.alpha_composite(base, (0, img.height - base.height))
    # accent over the second E: a small lime slash
    ex = int(width * (f.getlength("END") + 30) / (f.getlength("ENDEMICO") + 70)) + int(width * 0.012)
    ah = int(base.height * 0.32)
    img.alpha_composite(para_box(int(ah * 0.9), ah, LIME, skew=0.9), (ex, 0))
    return img


# --------------------------------------------------------------- elements
class El:
    def __init__(self, t0, t1):
        self.t0, self.t1 = t0, t1

    def live(self, t):
        return self.t0 <= t < self.t1

    def env(self, t, a=0.3, b=0.25):
        return min(clip01((t - self.t0) / a), clip01((self.t1 - t) / b))


def shade_top(h=1050, strength=200):
    a = (np.clip(1 - np.linspace(0, 1, h), 0, 1) ** 1.4 * strength).astype(np.uint8)
    arr = np.zeros((h, W, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = 4, 8, 18
    arr[..., 3] = a[:, None]
    return Image.fromarray(arr, "RGBA")


SHADE_TOP = None


class Bug(El):
    """Persistent brand marks: lime dash row top-left, corner bracket, small wordmark."""

    def __init__(self, t1):
        super().__init__(0, t1)
        self.dash = dash_row()
        self.mark = wordmark(230)
        self.corner = corner()

    def draw(self, base, t):
        k = ease_out(t / 0.5) * clip01((self.t1 - t) / 0.2)
        if k <= 0:
            return
        paste(base, self.dash, 70 + self.dash.width / 2 - (1 - k) * 80, 268, alpha=k)
        paste(base, self.mark, 905 - self.mark.width / 2 + (1 - k) * 80, 262, alpha=k * 0.92)


class Title(El):
    """Hook title, left aligned. lines: [(text, style)] style in solid|outline|lime."""

    def __init__(self, t0, t1, lines, sub=None, top=430, size=170, shade=True):
        super().__init__(t0, t1)
        f = heavy(size)
        self.lines = []
        for s, st in lines:
            if st == "outline":
                im = txt(s, f, WHITE, outline=5)
            else:
                im = txt(s, f, LIME if st == "lime" else WHITE)
            if im.width > 900:
                im = im.resize((900, int(im.height * 900 / im.width)), Image.LANCZOS)
            self.lines.append(im)
        self.sub = txt(sub, demi(40), LIME, tracking=9) if sub else None
        self.top, self.lh, self.shade = top, int(size * 0.98), shade
        self.sl = slashes(46)

    def draw(self, base, t):
        global SHADE_TOP
        out = clip01((self.t1 - t) / 0.28)
        if self.shade:
            if SHADE_TOP is None:
                SHADE_TOP = shade_top()
            a = self.env(t, 0.25, 0.3)
            sh = SHADE_TOP.copy(); sh.putalpha(SHADE_TOP.getchannel("A").point(lambda v: int(v * a)))
            base.alpha_composite(sh)
        y = self.top
        for i, im in enumerate(self.lines):
            k = ease_out((t - self.t0 - i * 0.11) / 0.32)
            if k > 0:
                x = 70 + im.width / 2 - (1 - k) * 260 - (1 - out) * 120
                paste(base, im, x, y + im.height / 2, alpha=k * out)
            y += self.lh
        k = ease_out((t - self.t0 - len(self.lines) * 0.11) / 0.3)
        if k > 0:
            bar = para_box(int(150 * k) + 1, 12, LIME, skew=0.8)
            base.alpha_composite(bar, (78, int(y + 22)))
            paste(base, self.sl, 78 + 172 + self.sl.width / 2, y + 28, alpha=k * out)
            if self.sub:
                paste(base, self.sub, 80 + self.sub.width / 2 + (1 - k) * 60, y + 92, alpha=k * out)


class Chip(El):
    """Section label: lime parallelogram tag + white spaced text, e.g. DÍA 2 // TREN SUPERIOR."""

    def __init__(self, t0, t1, tag, text, y=420):
        super().__init__(t0, t1)
        a = txt(tag, heavy(54), BLACK, shadow=False)
        box = para_box(a.width + 46, a.height + 26, LIME)
        box.alpha_composite(a, (int(box.width / 2 - a.width / 2), 13))
        b = txt(text, heavy(54), WHITE, tracking=3)
        img = Image.new("RGBA", (box.width + b.width + 30, max(box.height, b.height)), (0, 0, 0, 0))
        img.alpha_composite(box, (0, (img.height - box.height) // 2))
        img.alpha_composite(b, (box.width + 14, (img.height - b.height) // 2))
        self.img, self.y = img, y

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.35)
        out = clip01((self.t1 - t) / 0.25)
        if k > 0:
            paste(base, self.img, 70 + self.img.width / 2 - (1 - min(k, 1)) * 200, self.y, alpha=clip01(k) * out)


class Steps(El):
    """Numbered list that builds up: [(t, text)]. Newest item in lime."""

    def __init__(self, items, t1, top=400, size=74, x=70):
        super().__init__(items[0][0], t1)
        self.items = []
        for i, (t, s) in enumerate(items):
            n = txt(f"{i + 1:02d}", heavy(size - 8), BLACK, shadow=False)
            box = para_box(n.width + 34, n.height + 20, LIME)
            box.alpha_composite(n, (int(box.width / 2 - n.width / 2), 10))
            lw = txt(s, heavy(size), WHITE)
            ll = txt(s, heavy(size), LIME)
            self.items.append((t, box, lw, ll))
        self.top, self.lh, self.x = top, int(size * 1.36), x

    def draw(self, base, t):
        out = clip01((self.t1 - t) / 0.3)
        shown = [it for it in self.items if t >= it[0]]
        for i, (ti, box, lw, ll) in enumerate(shown):
            k = ease_back((t - ti) / 0.3)
            y = self.top + i * self.lh
            dx = -(1 - clip01(k)) * 220
            newest = i == len(shown) - 1
            paste(base, box, self.x + box.width / 2 + dx, y, alpha=clip01(k) * out)
            lab = ll if newest else lw
            paste(base, lab, self.x + box.width + 16 + lab.width / 2 + dx * 1.3, y, alpha=clip01(k) * out * (1 if newest else 0.85))


class Callout(El):
    """Big centered statement. lines: [(text, style)], pops line by line, with a lime flash."""

    def __init__(self, t0, t1, lines, cy=700, size=190, stagger=0.28, times=None, shade=True):
        super().__init__(t0, t1)
        f = heavy(size)
        self.lines = []
        for s, st in lines:
            im = txt(s, f, WHITE, outline=6) if st == "outline" else txt(s, f, LIME if st == "lime" else WHITE)
            if im.width > 960:
                im = im.resize((960, int(im.height * 960 / im.width)), Image.LANCZOS)
            self.lines.append(im)
        self.offs = [x - t0 for x in times] if times else [i * stagger for i in range(len(lines))]
        self.cy, self.lh, self.shade = cy, int(size * 0.98), shade

    def draw(self, base, t):
        global SHADE_TOP
        out = clip01((self.t1 - t) / 0.25)
        if self.shade:
            if SHADE_TOP is None:
                SHADE_TOP = shade_top()
            a = self.env(t, 0.2, 0.25) * 0.9
            sh = SHADE_TOP.copy(); sh.putalpha(SHADE_TOP.getchannel("A").point(lambda v: int(v * a)))
            base.alpha_composite(sh)
        n = len(self.lines)
        for i, im in enumerate(self.lines):
            ti = t - self.t0 - self.offs[i]
            k = ease_back(ti / 0.28)
            if k <= 0:
                continue
            y = self.cy + (i - (n - 1) / 2) * self.lh
            paste(base, im, 540, y, scale=1.25 - 0.25 * k, alpha=clip01(k) * out)


class Tags(El):
    """Pop-in tags at given positions: [(t, text, x, y, lime?)] (e.g. weights)."""

    def __init__(self, items, t1, size=96):
        super().__init__(min(i[0] for i in items), t1)
        self.items = []
        for t, s, x, y, hl in items:
            lab = txt(s, heavy(size), BLACK if hl else WHITE, shadow=False)
            box = para_box(lab.width + 60, lab.height + 34, LIME if hl else (8, 12, 24, 235))
            box.alpha_composite(lab, (int(box.width / 2 - lab.width / 2), 17))
            sh = Image.new("RGBA", (box.width + 60, box.height + 60), (0, 0, 0, 0))
            m = box.getchannel("A").point(lambda v: int(v * 0.6))
            s2 = Image.new("RGBA", box.size, (0, 0, 0, 255)); s2.putalpha(m)
            sh.alpha_composite(s2, (30, 38)); sh = sh.filter(ImageFilter.GaussianBlur(12))
            sh.alpha_composite(box, (30, 30))
            self.items.append((t, sh, x, y))

    def draw(self, base, t):
        out = clip01((self.t1 - t) / 0.25)
        for ti, im, x, y in self.items:
            k = ease_back((t - ti) / 0.28)
            if k > 0:
                paste(base, im, x, y, scale=0.5 + 0.5 * k, alpha=clip01(k) * out)


class Ticks(El):
    """Right / wrong cue lines: [(t, text, ok)]."""

    def __init__(self, items, t1, top=440, size=84):
        super().__init__(items[0][0], t1)
        self.items = []
        for t, s, ok in items:
            mk = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
            d = ImageDraw.Draw(mk)
            if ok:
                d.ellipse((0, 0, 95, 95), fill=LIME)
                d.line([(24, 50), (42, 68), (74, 30)], fill=BLACK, width=12, joint="curve")
            else:
                d.ellipse((0, 0, 95, 95), fill=(255, 255, 255, 235))
                d.line([(30, 30), (66, 66)], fill=BLACK, width=12)
                d.line([(66, 30), (30, 66)], fill=BLACK, width=12)
            lab = txt(s, heavy(size), LIME if ok else WHITE)
            self.items.append((t, mk, lab, ok))
        self.top, self.lh = top, int(size * 1.45)

    def draw(self, base, t):
        out = clip01((self.t1 - t) / 0.25)
        for i, (ti, mk, lab, ok) in enumerate(self.items):
            k = ease_back((t - ti) / 0.3)
            if k <= 0:
                continue
            y = self.top + i * self.lh
            paste(base, mk, 118, y, scale=0.4 + 0.6 * k, alpha=clip01(k) * out)
            img = lab
            if not ok and t - ti > 0.35:
                img = lab.copy()
                w = int((lab.width - 40) * ease_out((t - ti - 0.35) / 0.25))
                ImageDraw.Draw(img).rectangle((20, img.height // 2 - 5, 20 + w, img.height // 2 + 6), fill=(255, 255, 255, 255))
            paste(base, img, 190 + lab.width / 2 - (1 - clip01(k)) * 120, y, alpha=clip01(k) * out)


class Week(El):
    """Last class / today / next class strip. rows: [(t, label, value, highlight)]."""

    def __init__(self, rows, t1, top=420):
        super().__init__(rows[0][0], t1)
        self.rows = []
        for t, lab, val, hl in rows:
            a = txt(lab, demi(38), LIME if hl else (200, 205, 215, 255), tracking=7)
            b = txt(val, heavy(92), LIME if hl else WHITE)
            self.rows.append((t, a, b, hl))
        self.top = top

    def draw(self, base, t):
        out = clip01((self.t1 - t) / 0.3)
        y = self.top
        for ti, a, b, hl in self.rows:
            k = ease_out((t - ti) / 0.3)
            if k > 0:
                dx = -(1 - k) * 160
                if hl:
                    base.alpha_composite(para_box(12, a.height + b.height + 10, LIME, skew=0.3), (int(56 + dx), int(y - 4)))
                paste(base, a, 112 + a.width / 2 + dx, y + a.height / 2, alpha=k * out)
                paste(base, b, 112 + b.width / 2 + dx, y + a.height + b.height / 2 + 4, alpha=k * out)
            y += a.height + b.height + 46


class Flash(El):
    """Quick full-frame flash (white or lime) to punctuate a beat."""

    def __init__(self, t0, color=(255, 255, 255), dur=0.16, peak=0.55):
        super().__init__(t0, t0 + dur)
        self.color, self.peak = color, peak

    def draw(self, base, t):
        a = self.peak * (1 - (t - self.t0) / (self.t1 - self.t0))
        base.alpha_composite(Image.new("RGBA", (W, H), (*self.color, int(255 * a))))


class EndCard(El):
    def __init__(self, t0, dur, still, lines, sub="FUNCTIONAL TRAINING"):
        super().__init__(t0, t0 + dur)
        bg = Image.open(still).convert("RGB").resize((W, H)).filter(ImageFilter.GaussianBlur(26))
        self.bg = Image.blend(bg, Image.new("RGB", (W, H), NAVY[:3]), 0.72).convert("RGBA")
        self.mark = wordmark(760)
        self.sub = txt(sub, demi(40), (215, 220, 230, 255), tracking=14)
        f = heavy(120)
        self.lines = [txt(s, f, WHITE, outline=5) if st == "outline" else txt(s, f, LIME if st == "lime" else WHITE) for s, st in lines]
        lab = txt("ENTRENA HOY", heavy(64), BLACK, shadow=False)
        self.btn = para_box(lab.width + 90, lab.height + 40, LIME, skew=0.18)
        self.btn.alpha_composite(lab, (int(self.btn.width / 2 - lab.width / 2) + 6, 20))
        self.loc = txt("LLANQUIHUE  ·  @ENDEMICO.FT", demi(36), (200, 205, 215, 255), tracking=6)
        self.dash = dash_row(9)

    def draw(self, base, t):
        k = ease_out((t - self.t0) / 0.3)
        bg = self.bg.copy(); bg.putalpha(int(255 * k))
        base.alpha_composite(bg)
        def at(d, dur=0.35):
            return ease_out((t - self.t0 - d) / dur)
        y = 560
        for i, im in enumerate(self.lines):
            a = at(0.1 + i * 0.1)
            if a > 0:
                paste(base, im, 540 - (1 - a) * 150, y, alpha=a)
            y += int(im.height * 1.02)
        a = at(0.45)
        if a > 0:
            paste(base, self.dash, 540, y + 20, alpha=a)
            paste(base, self.mark, 540, y + 130, scale=0.9 + 0.1 * a, alpha=a)
            paste(base, self.sub, 540, y + 230, alpha=a)
        a = ease_back((t - self.t0 - 0.75) / 0.35)
        if a > 0:
            paste(base, self.btn, 540, y + 380, scale=0.7 + 0.3 * a, alpha=clip01(a))
            paste(base, self.loc, 540, y + 490, alpha=clip01(a))


class Captions(rk.Captions):
    """Word-by-word captions in brand type: uppercase heavy italic, active word lime."""

    def __init__(self, words, cy=1400, **kw):
        super().__init__(words, cy=cy, max_words=3, max_chars=18, **kw)
        self.f = heavy(96)

    def render(self, pi, active):
        key = (pi, active)
        if key not in self.cache:
            p = self.pages[pi]
            layers = [txt(w["d"], self.f, LIME if j == active else WHITE, stroke=10) for j, w in enumerate(p)]
            gap = -4
            tw = sum(l.width for l in layers) + gap * (len(layers) - 1)
            hh = max(l.height for l in layers)
            img = Image.new("RGBA", (tw, hh), (0, 0, 0, 0))
            x = 0
            for l in layers:
                img.alpha_composite(l, (x, hh - l.height)); x += l.width + gap
            if img.width > 940:
                img = img.resize((940, int(img.height * 940 / img.width)), Image.LANCZOS)
            self.cache[key] = img
        return self.cache[key]


# ----------------------------------------------------------------- footage
def clip_path(c):
    return f"{CLIPS}/IMG_{c}.MOV"


_words, _energy = {}, {}


def words(c):
    if c not in _words:
        _words[c] = rk.load_words(f"{WORDS}/IMG_{c}.json")
    return _words[c]


def energy(c):
    if c not in _energy:
        _energy[c] = rk.Energy(f"{WAVS}/IMG_{c}.wav")
    return _energy[c]


def snap(c, t, lo, hi):
    """Move a cut point to the quietest 10 ms inside [t+lo, t+hi]."""
    e = energy(c).db
    i0, i1 = max(0, int((t + lo) * 100)), min(len(e) - 1, int((t + hi) * 100))
    if i1 <= i0:
        return t
    seg = e[i0:i1]
    # prefer the earliest frame within 2 dB of the minimum (keeps cuts tight)
    j = int(np.argmax(seg <= seg.min() + 2))
    return (i0 + j) / 100


def say(c, first, last, near=None, pre=0.06, post=0.12, a=None, b=None):
    """Voice range in clip c from phrase `first` to phrase `last` (or explicit a/b)."""
    ws = words(c)
    if a is None:
        i, _ = rk.find_phrase(ws, first, near if near is not None else 0, window=1e9 if near is None else 8)
        a = snap(c, ws[i]["a"] - pre, -0.25, 0.08)
    if b is None:
        nb = near if near is not None else 0
        _, j = rk.find_phrase(ws, last, nb, window=1e9 if near is None else 20)
        b = snap(c, ws[j]["b"] + post, -0.12, 0.3)
    assert b - a > 0.3, f"bad voice range in {c}: {first!r}..{last!r} -> {a:.2f}-{b:.2f}"
    return (c, a, b)


GRADE = (
    "eq=contrast=1.1:brightness=-0.015:saturation=0.92:gamma=0.98,"
    "colorbalance=rs=-0.06:gs=-0.02:bs=0.09:rm=-0.03:gm=0.0:bm=0.05:rh=0.02:gh=0.01:bh=-0.03,"
    "curves=master='0/0 0.1/0.07 0.5/0.5 0.85/0.87 1/0.97',"
    "vignette=angle=PI/4.2,"
    "noise=alls=4:allf=t"
)


def vchain(zoom=1.0, c=(0.5, 0.5), speed=1.0, push=0.0, dur=1.0, mirror=False):
    cw, ch = int(round(W / zoom / 2) * 2), int(round(H / zoom / 2) * 2)
    x0 = int(min(max(0, c[0] * W - cw / 2), W - cw))
    y0 = int(min(max(0, c[1] * H - ch / 2), H - ch))
    vf = []
    if speed != 1.0:
        vf.append(f"setpts={1 / speed:.4f}*PTS")
    vf += [f"fps={FPS}", f"crop={cw}:{ch}:{x0}:{y0}", f"scale={W}:{H}:flags=lanczos"]
    if push:
        n = max(1, round(dur * FPS))
        vf.append(f"zoompan=z='1+{push}*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS}")
    if mirror:
        vf.append("hflip")
    vf.append(GRADE)
    vf.append("format=yuv420p")
    return ",".join(vf)


def render_shot(shot, out):
    """shot: dict(v=(clip, t), voice=(clip, a, b) or None, dur, zoom, c, speed, push, amb)."""
    voice = shot.get("voice")
    vclip, vt = shot["v"]
    speed = shot.get("speed", 1.0)
    dur = (voice[2] - voice[1]) if voice else shot["dur"]
    dur = round(dur * FPS) / FPS
    vf = vchain(shot.get("zoom", 1.0), shot.get("c", (0.5, 0.5)), speed, shot.get("push", 0.0), dur, shot.get("mirror", False))
    same = voice and voice[0] == vclip and abs(voice[1] - vt) < 0.02 and speed == 1.0
    amb = shot.get("amb", 0.22 if voice else 0.55)
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{vt:.3f}", "-t", f"{dur * speed + 0.2:.3f}", "-i", clip_path(vclip)]
    if voice and not same:
        cmd += ["-ss", f"{voice[1]:.3f}", "-t", f"{dur + 0.1:.3f}", "-i", clip_path(voice[0])]
    fade = f"afade=t=in:d=0.02,afade=t=out:st={dur - 0.03:.3f}:d=0.03"
    gain = shot.get("gain", 1.0)
    if same:
        af = f"[0:a]aformat=channel_layouts=mono,aresample=48000,volume={gain},{fade}[a]"
    elif voice:
        room = f"[0:a]aformat=channel_layouts=mono,aresample=48000,volume={amb}[r]" if speed == 1.0 else \
            f"anullsrc=r=48000:cl=mono[r]"
        af = (f"{room};[1:a]aformat=channel_layouts=mono,aresample=48000,volume={gain}[s];"
              f"[s][r]amix=inputs=2:normalize=0:duration=first,{fade}[a]")
    else:
        if speed == 1.0:
            af = f"[0:a]aformat=channel_layouts=mono,aresample=48000,volume={amb},{fade}[a]"
        else:
            af = f"anullsrc=r=48000:cl=mono,atrim=0:{dur:.3f},{fade}[a]"
    fc = f"[0:v]{vf},trim=0:{dur:.4f},setpts=PTS-STARTPTS[v];{af}"
    cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-t", f"{dur:.4f}",
            "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", out]
    subprocess.run(cmd, check=True)
    return dur


def synth_sfx(events, total, path, sr=48000):
    """reelkit sfx plus a 'riser' (rising filtered noise ending on t) and 'snap'."""
    rk.synth_sfx([e for e in events if e[1] in ("whoosh", "hit", "pop", "tick")], total, path, sr)
    extra = [e for e in events if e[1] in ("riser", "snap")]
    if not extra:
        return
    import wave
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32767
    x = x.copy()
    rng = np.random.default_rng(11)
    for t, kind in extra:
        if kind == "riser":
            n = int(1.1 * sr)
            noise = rng.standard_normal(n).astype(np.float32)
            y = np.zeros(n, np.float32); s = 0.0
            cut = np.linspace(0.01, 0.5, n) ** 2
            for j in range(n):
                s += cut[j] * (noise[j] - s); y[j] = s
            sig = y * np.linspace(0, 1, n) ** 2 * 0.35
            i = int(t * sr) - n
        else:  # snap: short bright transient
            n = int(0.08 * sr)
            tt = np.arange(n) / sr
            sig = rng.standard_normal(n).astype(np.float32) * np.exp(-tt * 70) * 0.35
            i = int(t * sr)
        i = max(0, i)
        seg = sig[: len(x) - i]
        x[i:i + len(seg)] += seg
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
