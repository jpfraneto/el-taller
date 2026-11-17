"""reelkit: turn a long talking-head take into vertical reels.

Pipeline per reel:
  1. pick source ranges by phrase (looked up in the word-level transcript)
  2. jump-cut the pauses out using the audio energy
  3. render each cut with its own framing (wide / medium / close) + grade
  4. render captions + graphics with PIL as an RGBA overlay stream
  5. mix voice + sound effects, overlay graphics, encode for Instagram
"""
import json, math, os, re, subprocess, unicodedata, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from estilo import E as ESTILO, rgba as _rgba

W, H, FPS = 1080, 1920, 30
FONT_DIR = "/Library/Fonts"
YELLOW = _rgba(ESTILO["serie"]["color"])      # the series color (estilo.json)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)


def font(weight, size):
    from estilo import fuente
    return ImageFont.truetype(fuente(weight), size)


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9ñ ]", "", s).strip()


def ease_out(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = max(0.0, min(1.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


# ---------------------------------------------------------------- transcript
def load_words(path):
    d = json.load(open(path))
    out = []
    for seg in d["transcription"]:
        t = seg["text"].strip()
        if not t:
            continue
        a, b = seg["offsets"]["from"] / 1000, seg["offsets"]["to"] / 1000
        if not norm(t) and out:  # bare punctuation: glue to previous word
            out[-1]["t"] += t
            continue
        out.append(dict(t=t, a=a, b=b, n=norm(t)))
    return out


def find_phrase(words, phrase, near, window=40):
    toks = norm(phrase).split()
    best = None
    for i in range(len(words) - len(toks) + 1):
        if abs(words[i]["a"] - near) > window:
            continue
        if all(words[i + k]["n"] == toks[k] for k in range(len(toks))):
            d = abs(words[i]["a"] - near)
            if best is None or d < best[0]:
                best = (d, i)
    if best is None:
        raise ValueError(f"phrase not found near {near}: {phrase!r}")
    return best[1], best[1] + len(toks) - 1


# --------------------------------------------------------------------- audio
class Energy:
    """10 ms RMS envelope of the 16 kHz mono wav, in dB."""

    def __init__(self, wav_path):
        with wave.open(wav_path) as w:
            self.sr = w.getframerate()
            x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        hop = self.sr // 100
        n = len(x) // hop
        rms = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1) + 1e-10)
        self.db = 20 * np.log10(rms)

    def speech_runs(self, a, b, min_gap=0.28, fill=0.12):
        i0, i1 = int(a * 100), int(b * 100)
        db = self.db[i0:i1]
        floor, loud = np.percentile(db, 12), np.percentile(db, 92)
        thr = floor + 0.33 * (loud - floor)
        sp = db > thr
        # close tiny holes inside words
        k = int(fill * 100)
        idx = np.where(sp)[0]
        for p, q in zip(idx[:-1], idx[1:]):
            if 1 < q - p <= k:
                sp[p:q] = True
        runs, start = [], None
        for j, v in enumerate(sp):
            if v and start is None:
                start = j
            if not v and start is not None:
                runs.append([start, j]); start = None
        if start is not None:
            runs.append([start, len(sp)])
        # merge runs separated by short silences, drop specks
        merged = []
        for r in runs:
            if merged and (r[0] - merged[-1][1]) < min_gap * 100:
                merged[-1][1] = r[1]
            else:
                merged.append(r)
        merged = [r for r in merged if r[1] - r[0] >= 6]
        return [((i0 + p) / 100, (i0 + q) / 100) for p, q in merged]


# ------------------------------------------------------------------ editing
def plan_cuts(energy, a, b, pre=0.08, post=0.18):
    """Return list of (src_a, src_b) speech chunks inside [a, b], pauses removed."""
    runs = energy.speech_runs(a, b)
    cuts = []
    for p, q in runs:
        p2, q2 = max(a, p - pre), min(b, q + post)
        if cuts and p2 < cuts[-1][1]:
            cuts[-1] = (cuts[-1][0], q2)
        else:
            cuts.append((p2, q2))
    # frame-align durations so A/V never drift across many segments
    out = []
    for p, q in cuts:
        n = max(3, round((q - p) * FPS))
        out.append((p, p + n / FPS))
    return out


class Timeline:
    def __init__(self, cuts):
        self.cuts = cuts
        self.starts = []
        t = 0.0
        for a, b in cuts:
            self.starts.append(t)
            t += b - a
        self.duration = t

    def to_out(self, ts):
        """Map a source time to reel time. Cuts may be in any source order."""
        for (a, b), s in zip(self.cuts, self.starts):
            if a <= ts <= b:
                return s + ts - a
        # inside a removed pause: snap to the chunk that starts right after it
        best = None
        for (a, b), s in zip(self.cuts, self.starts):
            if 0 < a - ts < 1.5 and (best is None or a - ts < best[0]):
                best = (a - ts, s)
        if best:
            return best[1]
        for (a, b), s in zip(self.cuts, self.starts):
            if 0 < ts - b < 1.5:
                return s + b - a
        raise ValueError(f"source time {ts} is not in this reel")

    def contains(self, ts):
        return any(a <= ts <= b for a, b in self.cuts)


# framing: (crop_w, crop_h, x0, y0) in source pixels (source is 1080x1920)
def framing(zoom, face=(860, 830), face_frac=None):
    if face_frac is None:
        # keep the face below the hook/callout zone in tighter shots
        face_frac = 0.46 if zoom > 1.6 else 0.40 if zoom > 1.2 else 0.36
    cw = int(round(W / zoom / 2) * 2)
    ch = int(round(H / zoom / 2) * 2)
    x0 = min(max(0, face[0] - cw // 2), W - cw)
    y0 = min(max(0, int(face[1] - face_frac * ch)), H - ch)
    return cw, ch, x0, y0


GRADE = ESTILO["reels"]["color_grade"]


def render_segment(src, a, dur, zoom, out, push=False, fx=None, face=(860, 830), draft=False, box=None):
    """draft=True: src is a tools/proxy.py copy. It's scaled up to 1080x1920 first, so the same
    framing (face, zooms, crops in source pixels) applies, then encoded fast and kept B&W.
    box = (cw, ch, x0, y0): this exact crop instead of the one from zoom + face (tools/encuadre.py)."""
    cw, ch, x0, y0 = box or framing(zoom, face)
    vf = [f"scale={W}:{H}:flags=bilinear"] if draft else []
    vf += [f"fps={FPS}", f"crop={cw}:{ch}:{x0}:{y0}", f"scale={W}:{H}:flags={'bilinear' if draft else 'lanczos'}"]
    if W / cw > 1.3:
        vf.append("unsharp=5:5:0.5")
    if push:
        n = max(1, round(dur * FPS))
        # slow push toward the face, keeping the face fixed in frame
        fx_, fy_ = (face[0] - x0) * W / cw, (face[1] - y0) * H / ch
        vf.append(
            f"zoompan=z='1+0.06*on/{n}':x='{fx_:.1f}*(1-1/zoom)':y='{fy_:.1f}*(1-1/zoom)'"
            f":d=1:s={W}x{H}:fps={FPS}"
        )
    vf.append(GRADE)
    for kind, t0, t1 in (fx or []):
        en = f"enable='between(t,{t0:.3f},{t1:.3f})'"
        if kind == "glitch":
            vf.append(f"rgbashift=rh=-18:bh=18:gv=6:{en}")
            vf.append(f"eq=contrast=1.35:brightness=0.04:{en}")
        if kind == "warm":
            vf.append(f"colorbalance=rs=0.25:gs=0.05:bs=-0.25:rm=0.2:bm=-0.2:{en}")
    if draft:
        vf.append("hue=s=0")
    vf.append("format=yuv420p")
    af = f"afade=t=in:d=0.012,afade=t=out:st={dur - 0.015:.3f}:d=0.015"
    enc = ["-crf", "30", "-preset", "ultrafast"] if draft else ["-crf", "13", "-preset", "fast"]
    cmd = [
        "ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", src, "-t", f"{dur:.4f}",
        "-vf", ",".join(vf), "-af", af, "-ar", "48000", "-ac", "1",
        "-c:v", "libx264", *enc, "-c:a", "pcm_s16le", out,
    ]
    subprocess.run(cmd, check=True)


# ---------------------------------------------------------------- graphics
def text_layer(text, fnt, fill, stroke=10, shadow=True, tracking=0):
    """Render text (single line) to a tight RGBA image with stroke + soft shadow."""
    pad = stroke + 30
    if tracking:
        widths = [fnt.getlength(c) + tracking for c in text]
        tw = int(sum(widths) - tracking)
    else:
        tw = int(fnt.getlength(text))
    asc, desc = fnt.getmetrics()
    img = Image.new("RGBA", (tw + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def draw(dr, color, sw, sf):
        if tracking:
            x = pad
            for c, wdt in zip(text, widths):
                dr.text((x, pad), c, font=fnt, fill=color, stroke_width=sw, stroke_fill=sf)
                x += wdt
        else:
            dr.text((pad, pad), text, font=fnt, fill=color, stroke_width=sw, stroke_fill=sf)

    if shadow:
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw(ImageDraw.Draw(sh), (0, 0, 0, 170), stroke, (0, 0, 0, 170))
        sh = sh.filter(ImageFilter.GaussianBlur(12))
        img.alpha_composite(sh, (0, 8))
    draw(d, fill, stroke, BLACK if stroke else None)
    return img


def paste_center(base, layer, cx, cy, scale=1.0, alpha=1.0):
    if scale != 1.0:
        layer = layer.resize((max(1, int(layer.width * scale)), max(1, int(layer.height * scale))), Image.BILINEAR)
    if alpha < 1.0:
        a = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer = layer.copy(); layer.putalpha(a)
    x, y = int(cx - layer.width / 2), int(cy - layer.height / 2)
    if x >= base.width or y >= base.height or x + layer.width <= 0 or y + layer.height <= 0:
        return   # fully off screen
    base.alpha_composite(layer, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))


def rounded_box(w, h, r, fill):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=fill)
    return img


def pill(text, fnt, fg, bg, padx=28, pady=14, tracking=2):
    t = text_layer(text, fnt, fg, stroke=0, shadow=False, tracking=tracking)
    bb = t.getbbox()
    t = t.crop(bb)
    box = rounded_box(t.width + 2 * padx, t.height + 2 * pady, (t.height + 2 * pady) // 2, bg)
    box.alpha_composite(t, (padx, pady))
    sh = Image.new("RGBA", (box.width + 40, box.height + 40), (0, 0, 0, 0))
    sh.alpha_composite(rounded_box(box.width, box.height, box.height // 2, (0, 0, 0, 120)), (20, 26))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    sh.alpha_composite(box, (20, 20))
    return sh


class Captions:
    """Word-by-word captions, a few words per page, active word in yellow."""

    def __init__(self, words, cy=1330, max_words=3, max_chars=17, size=88, hold=0.0,
                 weight="Black", upper=True, stroke=11, pop=True, active=YELLOW, color=WHITE, fade=0.12):
        self.cy = cy
        self.f = font(weight, size)
        self.stroke, self.pop, self.active, self.color, self.fade = stroke, pop, active, color, fade
        if not upper:   # sentence case: show the words as spoken, without trailing commas/periods
            words = [dict(w, d=re.sub(r"[,;:.…]+$", "", w["t"])) for w in words]
        self.pages = []
        self.block, self.hold = [], hold
        if hold > 0:
            # Nothing is captioned before `hold` (the title is alone on screen). At `hold`, everything
            # said so far appears at once as one block, which keeps filling in until the phrase that is
            # running at `hold` ends (punctuation or a pause). Then the normal pages take over.
            j = -1
            while j + 1 < len(words) and words[j + 1]["oa"] < hold:
                j += 1
            if j >= 0:
                while j + 1 < len(words) and j < 24:
                    w, nxt = words[j], words[j + 1]
                    done = re.search(r"[.,?!;:…]$", w["t"]) or nxt["oa"] - w["ob"] > 0.45
                    if done and w["ob"] >= hold:
                        break
                    j += 1
                self.block = words[:j + 1]
                words = words[j + 1:]
                self.block_f = font(weight, int(size * 0.8) if upper else size)
                self.block_end = max(hold + 1.2, self.block[-1]["ob"] + 0.3)
                if words:
                    self.block_end = min(self.block_end, words[0]["oa"])
        cur = []
        for i, w in enumerate(words):
            cur.append(w)
            text = " ".join(x["d"] for x in cur)
            nxt = words[i + 1] if i + 1 < len(words) else None
            brk = (
                nxt is None
                or len(cur) >= max_words
                or re.search(r"[.,?!;:…]$", w["t"])
                or (nxt["oa"] - w["ob"]) > 0.45
                or len(text + " " + nxt["d"]) > max_chars
            )
            if brk:
                self.pages.append(cur); cur = []
        self.cache = {}

    def page_at(self, t):
        for pi, p in enumerate(self.pages):
            end = p[-1]["ob"] + 0.25
            if pi + 1 < len(self.pages):
                end = min(end, self.pages[pi + 1][0]["oa"])
            if p[0]["oa"] - 0.05 <= t < end:
                return pi, p
        return None, None

    def render(self, pi, active):
        key = (pi, active)
        if key not in self.cache:
            p = self.pages[pi]
            layers = [text_layer(w["d"], self.f, self.active if j == active else self.color, stroke=self.stroke)
                      for j, w in enumerate(p)]
            space = -(2 * (self.stroke + 30)) + 24
            tw = sum(l.width for l in layers) + space * (len(layers) - 1)
            hh = max(l.height for l in layers)
            img = Image.new("RGBA", (tw, hh), (0, 0, 0, 0))
            x = 0
            for l in layers:
                img.alpha_composite(l, (x, 0)); x += l.width + space
            if img.width > 980:
                s = 980 / img.width
                img = img.resize((980, int(img.height * s)), Image.LANCZOS)
            self.cache[key] = img
        return self.cache[key]

    def render_block(self, n):
        """The catch-up block with its first n words, wrapped, the newest word in yellow."""
        key = ("block", n)
        if key not in self.cache:
            ws = self.block[:n]
            sk = min(10, self.stroke)
            layers = [text_layer(w["d"], self.block_f, self.active if j == n - 1 else self.color, stroke=sk) for j, w in enumerate(ws)]
            space = -(2 * (sk + 30)) + 22
            lines, cur, cw = [], [], 0
            for l in layers:
                add = l.width + (space if cur else 0)
                if cur and cw + add > 1000:
                    lines.append(cur); cur, cw = [], 0; add = l.width
                cur.append(l); cw += add
            if cur:
                lines.append(cur)
            lh = layers[0].height - 2 * (sk + 30) + 14
            rows = []
            for ln in lines:
                w = sum(l.width for l in ln) + space * (len(ln) - 1)
                img = Image.new("RGBA", (w, ln[0].height), (0, 0, 0, 0))
                x = 0
                for l in ln:
                    img.alpha_composite(l, (x, 0)); x += l.width + space
                rows.append(img)
            H_ = lh * (len(rows) - 1) + rows[0].height
            out = Image.new("RGBA", (max(r.width for r in rows), H_), (0, 0, 0, 0))
            for i, r in enumerate(rows):
                out.alpha_composite(r, ((out.width - r.width) // 2, i * lh))
            self.cache[key] = out
        return self.cache[key]

    def draw(self, base, t):
        if self.hold > 0 and t < self.hold:
            return
        if self.block and t < self.block_end:
            n = sum(1 for w in self.block if w["oa"] - 0.03 <= max(t, self.hold))
            img = self.render_block(max(1, n))
            k = ease_back((t - self.hold) / 0.25)
            paste_center(base, img, 520, self.cy - max(0, img.height - 220) / 2, scale=0.85 + 0.15 * k, alpha=min(1, k))
            return
        pi, p = self.page_at(t)
        if p is None:
            return
        active = 0
        for j, w in enumerate(p):
            if t >= w["oa"] - 0.03:
                active = j
        img = self.render(pi, active)
        age = t - p[0]["oa"]
        if self.pop:
            paste_center(base, img, 520, self.cy, scale=0.82 + 0.18 * ease_back(age / 0.16))
        else:
            paste_center(base, img, 540, self.cy, alpha=ease_out(age / self.fade) if self.fade else 1.0)


class Element:
    def __init__(self, t0, t1):
        self.t0, self.t1 = t0, t1

    def live(self, t):
        return self.t0 <= t < self.t1


class Tag(Element):
    def __init__(self, text, sub, t0=0.0):
        super().__init__(t0, 1e9)
        f1, f2 = font("Black", 34), font("Bold", 30)
        a = pill(text, f1, BLACK, YELLOW)
        b = text_layer(sub, f2, WHITE, stroke=0, tracking=2)
        b = b.crop(b.getbbox())
        img = Image.new("RGBA", (a.width + b.width + 30, a.height), (0, 0, 0, 0))
        img.alpha_composite(a, (0, 0))
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sh.alpha_composite(b, (a.width + 6, (a.height - b.height) // 2 - 3))
        blur = sh.filter(ImageFilter.GaussianBlur(6))
        img.alpha_composite(blur); img.alpha_composite(blur); img.alpha_composite(sh)
        self.img = img

    def draw(self, base, t):
        x = int(-self.img.width + (self.img.width + 40) * ease_out((t - self.t0) / 0.5))
        base.alpha_composite(self.img, (max(0, x), 205), (max(0, -x), 0))


class Title(Element):
    """Big hook title stacked in the upper third. lines: [(text, highlighted)]."""

    def __init__(self, t0, t1, lines, cy=520, size=118):
        super().__init__(t0, t1)
        f = font("Black", size)
        self.layers = [text_layer(s, f, YELLOW if hl else WHITE, stroke=12) for s, hl in lines]
        self.cy, self.lh = cy, int(size * 1.02)

    def draw(self, base, t):
        n = len(self.layers)
        out = ease_out((self.t1 - t) / 0.25)
        for i, l in enumerate(self.layers):
            k = ease_back((t - self.t0 - i * 0.09) / 0.3)
            if k <= 0:
                continue
            y = self.cy + (i - (n - 1) / 2) * self.lh
            paste_center(base, l, 520, y + (1 - k) * 40, scale=0.7 + 0.3 * k, alpha=min(1, k) * out)


class Label(Element):
    """Section label, e.g. 01 EL PROBLEMA."""

    def __init__(self, t0, num, text, dur=2.4, cy=330):
        super().__init__(t0, t0 + dur)
        f = font("Black", 40)
        a = pill(num, f, BLACK, YELLOW, padx=20)
        b = pill(text, f, WHITE, (0, 0, 0, 215))
        img = Image.new("RGBA", (a.width + b.width - 30, max(a.height, b.height)), (0, 0, 0, 0))
        img.alpha_composite(b, (a.width - 30, 0)); img.alpha_composite(a, (0, 0))
        self.img, self.cy = img, cy

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.35)
        out = ease_out((self.t1 - t) / 0.3)
        paste_center(base, self.img, 540 - (1 - k) * 200, self.cy, alpha=min(1, max(0, k)) * out)


class Callout(Element):
    """Big statement in the upper area. lines: [(text, style)] style in {'w','y','strike'}."""

    def __init__(self, t0, t1, lines, cy=470, size=104, stagger=0.35, times=None):
        super().__init__(t0, t1)
        # times: absolute reel time each line pops in (overrides stagger)
        self.offsets = [x - t0 for x in times] if times else [i * stagger for i in range(len(lines))]
        f = font("Black", size)
        self.items = []
        for s, st in lines:
            l = text_layer(s, f, YELLOW if st == "y" else WHITE, stroke=12)
            self.items.append((l, st))
        self.cy, self.lh, self.stagger = cy, int(size * 1.08), stagger

    def draw(self, base, t):
        n = len(self.items)
        out = ease_out((self.t1 - t) / 0.25)
        for i, (l, st) in enumerate(self.items):
            ti = t - self.t0 - self.offsets[i]
            k = ease_back(ti / 0.3)
            if k <= 0:
                continue
            y = self.cy + (i - (n - 1) / 2) * self.lh
            img = l
            if st == "strike":
                w = int((l.width - 60) * ease_out((ti - 0.35) / 0.25))
                if w > 0:
                    img = l.copy()
                    ImageDraw.Draw(img).rectangle((30, img.height // 2 - 4, 30 + w, img.height // 2 + 10), fill=(255, 70, 60, 255))
            paste_center(base, img, 520, y, scale=0.75 + 0.25 * k, alpha=min(1, k) * out)


def bubble(text, side, accent=False, label=None, maxw=560):
    f = font("Semibold", 40)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if f.getlength(trial) > maxw - 60 and cur:
            lines.append(cur); cur = wd
        else:
            cur = trial
    lines.append(cur)
    lw = int(max(f.getlength(l) for l in lines))
    lh = 50
    top = 36 if label else 0
    w, h = lw + 56, len(lines) * lh + 36 + top
    bg = YELLOW if accent else (255, 255, 255, 245)
    img = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    sh = rounded_box(w, h, 34, (0, 0, 0, 110))
    img.alpha_composite(sh, (20, 28))
    img = img.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(rounded_box(w, h, 34, bg), (20, 20))
    d = ImageDraw.Draw(img)
    if label:
        d.text((48, 34), label, font=font("Black", 26), fill=(0, 0, 0, 150))
    for i, l in enumerate(lines):
        d.text((48, 34 + top + i * lh), l, font=f, fill=(20, 20, 20, 255))
    return img


class BubblePile(Element):
    """Same questions piling up, again and again."""

    def __init__(self, t0, t1, msgs, every=0.32, x=50, top=330, bottom=1120):
        super().__init__(t0, t1)
        self.items = [bubble(m, "l") for m in msgs]
        self.every, self.x, self.top, self.bottom = every, x, top, bottom

    def draw(self, base, t):
        n = min(len(self.items), int((t - self.t0) / self.every) + 1)
        out = ease_out((self.t1 - t) / 0.3)
        # newest at the bottom, older pushed up and faded
        y = self.bottom
        for i in range(n - 1, -1, -1):
            img = self.items[i]
            age = t - self.t0 - i * self.every
            k = ease_back(age / 0.22)
            y -= img.height - 22
            if y < self.top - 60:
                break
            fade = min(1, max(0, (y - self.top + 60) / 160))
            jitter = ((i * 37) % 5) * 12
            paste_center(base, img, self.x + jitter + img.width / 2, y + img.height / 2,
                         scale=0.6 + 0.4 * k, alpha=min(1, k) * fade * out)


class ChatDemo(Element):
    """A short scripted chat: [(t, text, side, accent, label)]."""

    def __init__(self, t1, msgs, top=360):
        super().__init__(msgs[0][0], t1)
        self.msgs = [(m[0], bubble(m[1], m[2], m[3], m[4], maxw=600), m[2]) for m in msgs]
        self.top = top

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        y = self.top
        for t0, img, side in self.msgs:
            if t < t0:
                break
            k = ease_back((t - t0) / 0.25)
            cx = 40 + img.width / 2 if side == "l" else 1000 - img.width / 2
            paste_center(base, img, cx, y + img.height / 2, scale=0.6 + 0.4 * k, alpha=min(1, k) * out)
            y += img.height - 14


class Glow(Element):
    """Flickering fire glow rising from the bottom."""

    def __init__(self, t0, t1):
        super().__init__(t0, t1)
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        yy = np.linspace(0, 1, H)[:, None]
        xx = np.linspace(-1, 1, W)[None, :]
        a = np.clip((yy - 0.35) / 0.65, 0, 1) ** 1.6 * (1 - 0.35 * xx ** 2)
        arr = np.zeros((H, W, 4), np.uint8)
        arr[..., 0], arr[..., 1], arr[..., 2] = 255, 110, 20
        arr[..., 3] = (a * 200).astype(np.uint8)
        self.g = Image.fromarray(arr, "RGBA")

    def draw(self, base, t):
        k = min(ease_out((t - self.t0) / 0.3), ease_out((self.t1 - t) / 0.4))
        flick = 0.75 + 0.25 * math.sin(t * 31) * math.sin(t * 13.7)
        a = self.g.getchannel("A").point(lambda v: int(v * k * flick))
        g = self.g.copy(); g.putalpha(a)
        base.alpha_composite(g)


# El Taller account identity (shown on every end card): el-taller/estilo.json → serie
SERIE = ESTILO["serie"]["nombre"]
HANDLE = ESTILO["serie"]["handle"]
TAGLINE = ESTILO["serie"]["tagline"]


class EndCard(Element):
    def __init__(self, t0, dur, still_path, ep, cta_lines, tagline=TAGLINE, handle=HANDLE):
        super().__init__(t0, t0 + dur)
        bg = Image.open(still_path).convert("RGB").resize((W, H))
        bg = bg.filter(ImageFilter.GaussianBlur(28))
        bg = Image.blend(bg, Image.new("RGB", (W, H), (10, 8, 6)), 0.55).convert("RGBA")
        self.bg = bg
        self.title = text_layer(SERIE, font("Black", 150), WHITE, stroke=0, tracking=6)
        self.ep = pill(ep, font("Black", 38), BLACK, YELLOW)
        self.cta = [text_layer(s, font("Bold", 56), YELLOW if hl else WHITE, stroke=0) for s, hl in cta_lines]
        self.tagline = text_layer(tagline.upper(), font("Bold", 30), WHITE, stroke=0, tracking=4) if tagline else None
        self.handle = text_layer(handle, font("Black", 50), YELLOW, stroke=0) if handle else None

    def draw(self, base, t):
        k = ease_out((t - self.t0) / 0.35)
        a = self.bg.getchannel("A").point(lambda v: int(v * k))
        bg = self.bg.copy(); bg.putalpha(a)
        base.alpha_composite(bg)
        kt = ease_back((t - self.t0 - 0.15) / 0.4)
        if kt > 0:
            paste_center(base, self.title, 540, 760, scale=0.8 + 0.2 * kt, alpha=min(1, kt))
            paste_center(base, self.ep, 540, 900, alpha=min(1, kt))
        for i, l in enumerate(self.cta):
            kc = ease_out((t - self.t0 - 0.45 - i * 0.12) / 0.35)
            if kc > 0:
                paste_center(base, l, 540, 1080 + i * 74 + (1 - kc) * 30, alpha=kc)
        kh = ease_out((t - self.t0 - 0.8) / 0.4)
        if kh > 0:
            if self.tagline: paste_center(base, self.tagline, 540, 1420, alpha=kh * 0.85)
            if self.handle: paste_center(base, self.handle, 540, 1480, alpha=kh)


# --------------------------------------------------------------------- sound
def synth_sfx(events, total, path, sr=48000):
    """events: [(t, kind)] kind in whoosh|hit|pop|tick."""
    out = np.zeros(int(total * sr) + sr, np.float32)
    rng = np.random.default_rng(7)
    for t, kind in events:
        i = int(t * sr)
        if kind == "whoosh":
            n = int(0.55 * sr)
            noise = rng.standard_normal(n).astype(np.float32)
            env = np.sin(np.linspace(0, math.pi, n)) ** 2
            # sweeping one-pole low-pass
            y = np.zeros(n, np.float32); s = 0.0
            cut = np.linspace(0.02, 0.35, n) ** 1.5
            for j in range(n):
                s += cut[j] * (noise[j] - s); y[j] = s
            sig = y * env * 0.5
            i -= int(0.35 * sr)  # peak lands on the cut
        elif kind == "hit":
            n = int(0.9 * sr)
            tt = np.arange(n) / sr
            f = 48 + 60 * np.exp(-tt * 18)
            sig = np.sin(2 * math.pi * np.cumsum(f) / sr) * np.exp(-tt * 4.5) * 0.6
        elif kind == "pop":
            n = int(0.12 * sr)
            tt = np.arange(n) / sr
            sig = np.sin(2 * math.pi * (900 - 2500 * tt) * tt) * np.exp(-tt * 45) * 0.25
        elif kind == "tick":
            n = int(0.05 * sr)
            tt = np.arange(n) / sr
            sig = np.sin(2 * math.pi * 2200 * tt) * np.exp(-tt * 120) * 0.15
        else:
            continue
        i = max(0, i)
        seg = sig[: len(out) - i]
        out[i:i + len(seg)] += seg
    out = np.clip(out, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((out * 32767).astype(np.int16).tobytes())


class Checklist(Element):
    """Items ticking in one by one, upper-left. items: [(t, text)]; the last one is highlighted."""

    def __init__(self, items, t1, x=56, top=330, size=60):
        super().__init__(items[0][0], t1)
        f = font("Black", size)
        self.items = []
        for i, (t, s) in enumerate(items):
            last = i == len(items) - 1
            box = rounded_box(size, size, 14, YELLOW if last else (255, 255, 255, 235))
            d = ImageDraw.Draw(box)
            d.line([(size * 0.24, size * 0.52), (size * 0.43, size * 0.72), (size * 0.78, size * 0.3)], fill=BLACK, width=8, joint="curve")
            tx = text_layer(s, f, YELLOW if last else WHITE, stroke=9)
            img = Image.new("RGBA", (size + 10 + tx.width, max(tx.height, size + 40)), (0, 0, 0, 0))
            img.alpha_composite(box, (20, (img.height - size) // 2))
            img.alpha_composite(tx, (size - 10, (img.height - tx.height) // 2))
            self.items.append((t, img))
        self.x, self.top, self.lh = x, top, int(size * 1.32)

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        for i, (ti, img) in enumerate(self.items):
            k = ease_back((t - ti) / 0.28)
            if k <= 0:
                continue
            cx = self.x + img.width / 2 - (1 - min(1, k)) * 120
            paste_center(base, img, cx, self.top + i * self.lh, scale=0.85 + 0.15 * k, alpha=min(1, max(0, k)) * out)
