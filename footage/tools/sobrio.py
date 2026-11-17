"""sobrio: the raw look (JP, 2026-11-13, Ep. 10): no graphics, no sound effects, no tag.

    "make the edit way more sobrio. just keep it raw. with the subtitles on one part on spanish and then on another
    part subtly in english, word by word. only one word on screen at a time… when the reel starts you put Ruben as my
    name as if this was me talking on the news."

On when estilo.json reels.modo = "sobrio" (or reels.json "modo"). What it draws:
  - Spanish captions one word at a time (rk.Captions, max_words=1), synced to the voice
  - English, one word at a time, smaller and quieter, under the Spanish: each piece's "en" in reels.json, its words
    spread over that piece's Spanish words (so it keeps pace with the voice)
  - the opening: a news lower third (estilo.json reels.sobrio.nombre / rol), a glimpse of who is talking
  - the end: the last frame darkens, the reel's cta in plain type, the handle
Texts and positions: estilo.json reels.sobrio.
"""
from PIL import Image, ImageDraw, ImageFilter
import reelkit as rk
from estilo import E as ESTILO

S = ESTILO["reels"].get("sobrio", {})


def on(plan=None):
    return (plan or {}).get("modo", ESTILO["reels"].get("modo")) == "sobrio"


def captions_kw():
    return dict(max_words=1, pop=False, fade=0, active=rk.WHITE, upper=False, weight="Bold",
                size=S.get("es_size", 92), cy=S.get("es_y", 1290), stroke=8)


class Nada(rk.Element):
    """No corner tag."""
    def __init__(self, *a):
        super().__init__(0, 0)

    def draw(self, base, t):
        pass


class Zocalo(rk.Element):
    """The news lower third: a yellow rule, the name, the role under it."""
    def __init__(self, t0=0.35, dur=3.6, nombre=None, rol=None):
        super().__init__(t0, t0 + dur)
        nombre = nombre or S.get("nombre", "RUBÉN")
        rol = rol if rol is not None else S.get("rol", "")
        n = rk.text_layer(nombre, rk.font("Black", 78), rk.WHITE, stroke=0, shadow=False, tracking=3)
        n = n.crop(n.getbbox())
        r = None
        if rol:
            r = rk.text_layer(rol, rk.font("Medium", 34), (255, 255, 255, 215), stroke=0, shadow=False, tracking=2)
            r = r.crop(r.getbbox())
        padx, pady, gap, rule = 34, 28, 18, 10
        w = max(n.width, r.width if r else 0) + 2 * padx + rule
        h = n.height + (gap + r.height if r else 0) + 2 * pady
        box = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(box)
        d.rectangle((0, 0, w, h), fill=(12, 12, 12, 200))
        d.rectangle((0, 0, rule - 1, h), fill=rk.YELLOW)
        box.alpha_composite(n, (rule + padx, pady))
        if r:
            box.alpha_composite(r, (rule + padx, pady + n.height + gap))
        self.img = box
        self.x, self.y = S.get("zocalo_x", 64), S.get("zocalo_y", 1060)

    def draw(self, base, t):
        k_in = rk.ease_out((t - self.t0) / 0.45)
        k_out = rk.ease_out((self.t1 - t) / 0.35)
        w = int(self.img.width * k_in)
        if w <= 0:
            return
        img = self.img.crop((0, 0, w, self.img.height))
        if k_out < 1:
            a = img.getchannel("A").point(lambda v: int(v * k_out))
            img = img.copy(); img.putalpha(a)
        base.alpha_composite(img, (self.x, self.y))


class Ingles(rk.Element):
    """English, one word at a time. words: [(t0, t1, word)] in reel time."""
    def __init__(self, words):
        super().__init__(words[0][0] if words else 0, words[-1][1] if words else 0)
        self.words = words
        self.f = rk.font("Medium", S.get("en_size", 50))
        self.y = S.get("en_y", 1395)
        self.cache = {}

    def draw(self, base, t):
        for a, b, w in self.words:
            if a <= t < b:
                if w not in self.cache:
                    self.cache[w] = rk.text_layer(w, self.f, (255, 236, 160, 225), stroke=3, tracking=1)
                rk.paste_center(base, self.cache[w], 540, self.y)
                return


def ingles(pieces, spans, words, T, fixed=lambda s: s):
    """Each piece's "en" spread over the reel times of that piece's Spanish words."""
    out = []
    for p, (a, b) in zip(pieces, spans):
        en = (p.get("en") or "").split()
        es = [w for w in words if a - 0.03 <= w["a"] <= b + 0.03]
        if not en or not es:
            continue
        times = []
        for w in es:
            try:
                times.append((T(w["a"]), T(w["a"]) + max(0.12, w["b"] - w["a"])))
            except ValueError:
                pass
        if not times:
            continue
        # the Spanish words as one clock: a fraction of the English → the same fraction of the time he speaks
        dur = [t1 - t0 for t0, t1 in times]
        total = sum(dur)

        def clock(f):
            left = f * total
            for (t0, t1), d in zip(times, dur):
                if left <= d:
                    return t0 + left
                left -= d
            return times[-1][1]

        weights = [len(x) + 3 for x in en]
        tot, acc = sum(weights), 0
        for x, wt in zip(en, weights):
            out.append([clock(acc / tot), clock((acc + wt) / tot), x])
            acc += wt
    out.sort()
    for i in range(len(out) - 1):          # one word at a time; a short pause keeps the last word up
        out[i][1] = min(max(out[i][1], out[i][0] + 0.12) + 0.3, out[i + 1][0])
    return [tuple(w) for w in out]


class Final(rk.Element):
    """The end: the last frame darkens, the cta in plain type, the handle."""
    def __init__(self, t0, dur, still_path, ep, cta_lines, **kw):
        super().__init__(t0, t0 + dur)
        bg = Image.open(still_path).convert("RGB").resize((rk.W, rk.H))
        self.bg = Image.blend(bg, Image.new("RGB", (rk.W, rk.H), (8, 8, 8)), 0.72).convert("RGBA")
        # a line that starts with "~" is the English, smaller and quieter
        self.cta = [rk.text_layer(s[1:], rk.font("Medium", 40), (255, 236, 160, 210), stroke=0) if s.startswith("~") else
                    rk.text_layer(s, rk.font("Bold", 54), rk.YELLOW if hl else rk.WHITE, stroke=0) for s, hl in cta_lines]
        self.en = [s.startswith("~") for s, _ in cta_lines]
        self.firma = rk.text_layer(S.get("firma", rk.HANDLE), rk.font("Medium", 36), (255, 255, 255, 200), stroke=0,
                                   tracking=2)

    def draw(self, base, t):
        k = rk.ease_out((t - self.t0) / 0.5)
        bg = self.bg.copy(); bg.putalpha(self.bg.getchannel("A").point(lambda v: int(v * k)))
        base.alpha_composite(bg)
        n = len(self.cta)
        for i, l in enumerate(self.cta):
            kc = rk.ease_out((t - self.t0 - 0.3 - i * 0.15) / 0.5)
            if kc > 0:
                rk.paste_center(base, l, 540, 900 - (n - 1) * 37 + i * 74 + (16 if self.en[i] else 0), alpha=kc)
        kf = rk.ease_out((t - self.t0 - 0.8) / 0.5)
        if kf > 0:
            rk.paste_center(base, self.firma, 540, 1180, alpha=kf)


def silencio(events, total, path, sr=48000):
    """No sound effects: a silent track the mixer can still take."""
    import numpy as np, wave
    n = int(total * sr)
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes(np.zeros(n, dtype=np.int16).tobytes())
