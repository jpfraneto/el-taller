"""ep02kit: new graphics for El Taller ep. 02 (Constructora Aubel).

Builds on reelkit (fonts, text layers, easing, captions). Everything here is new
so ep. 02 doesn't look like a copy of ep. 01: screenshot cards, a phone that
scrolls a real web page, a menu that explodes into options, a quiz, rubber
stamps, an IG-style DM thread, a heartbeat pulse and a live-projects panel.
"""
import math, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import reelkit as rk
from reelkit import W, H, YELLOW, WHITE, BLACK, font, text_layer, paste_center, rounded_box, ease_out, ease_back, Element

GREEN = (0, 158, 59, 255)       # Aubel's brand green (site header)
RED = (235, 64, 64, 255)
IG_BLUE = (55, 151, 240, 255)


def shadowed(img, r=26, blur=22, alpha=150, dy=18):
    pad = blur * 2
    out = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    out.alpha_composite(rounded_box(img.width, img.height, r, (0, 0, 0, alpha)), (pad, pad + dy))
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(img, (pad, pad))
    return out


def round_corners(img, r):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), r, fill=255)
    a = Image.fromarray(np.minimum(np.array(img.getchannel("A")), np.array(m)))
    img.putalpha(a)
    return img


def sharpen_up(img, w):
    h = int(img.height * w / img.width)
    out = img.resize((w, h), Image.LANCZOS)
    if w > img.width * 1.2:
        out = out.filter(ImageFilter.UnsharpMask(2, 60, 2))
    return out


# ------------------------------------------------------------------ cards
class Card(Element):
    """A screenshot in a rounded card. Slides up in, optional slow scroll inside a
    window, optional highlight boxes [(t, (x0,y0,x1,y1) in image px)], optional label."""

    def __init__(self, t0, t1, img, width=900, cy=720, view_h=None, scroll=None, highlights=(),
                 label=None, tilt=0.0, radius=34, zoom_to=None):
        super().__init__(t0, t1)
        if isinstance(img, str):
            img = Image.open(img)
        self.src = sharpen_up(img.convert("RGBA"), width)
        self.k = width / img.width
        self.width, self.cy, self.radius, self.tilt = width, cy, radius, tilt
        self.view_h = min(view_h or self.src.height, self.src.height)
        self.scroll = scroll or [(t0, 0), (t1, 0)]  # [(t, y offset in image px)]
        self.highlights = highlights
        self.zoom_to = zoom_to  # (t, (x0,y0,x1,y1)) zoom into a tile
        self.label = rk.pill(label, font("Black", 36), BLACK, YELLOW) if label else None
        self._cache = {}

    def offset(self, t):
        pts = self.scroll
        if t <= pts[0][0]:
            return pts[0][1] * self.k
        for (ta, ya), (tb, yb) in zip(pts, pts[1:]):
            if ta <= t <= tb:
                x = (t - ta) / max(1e-6, tb - ta)
                x = x * x * (3 - 2 * x)
                return (ya + (yb - ya) * x) * self.k
        return pts[-1][1] * self.k

    def frame(self, t):
        y = int(min(max(0, self.offset(t)), self.src.height - self.view_h))
        key = y
        if key not in self._cache:
            self._cache.clear()
            crop = self.src.crop((0, y, self.width, y + self.view_h))
            self._cache[key] = round_corners(crop, self.radius)
        img = self._cache[key].copy()
        d = ImageDraw.Draw(img)
        for th, (x0, y0, x1, y1) in self.highlights:
            k = ease_back((t - th) / 0.35)
            if k <= 0:
                continue
            x0, y0, x1, y1 = [v * self.k for v in (x0, y0, x1, y1)]
            y0 -= y; y1 -= y
            g = 10 * (1 - min(1, k))
            pulse = 0.5 + 0.5 * math.sin((t - th) * 9)
            wd = int(9 + 3 * pulse)
            d.rounded_rectangle((x0 - g, y0 - g, x1 + g, y1 + g), 18, outline=YELLOW, width=wd)
        return img

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.45)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        img = self.frame(t)
        if self.zoom_to and t >= self.zoom_to[0]:
            tz, (x0, y0, x1, y1) = self.zoom_to
            z = ease_out((t - tz) / 0.6)
            x0, y0, x1, y1 = [v * self.k for v in (x0, y0, x1, y1)]
            y0 -= self.offset(t); y1 -= self.offset(t)
            cw = img.width + (x1 - x0 - img.width) * z
            ch = cw * img.height / img.width
            cx = img.width / 2 + ((x0 + x1) / 2 - img.width / 2) * z
            cyy = img.height / 2 + ((y0 + y1) / 2 - img.height / 2) * z
            box = (cx - cw / 2, cyy - ch / 2, cx + cw / 2, cyy + ch / 2)
            img = round_corners(img.crop(tuple(int(v) for v in box)).resize(img.size, Image.LANCZOS), self.radius)
        img = shadowed(img)
        if self.tilt:
            img = img.rotate(self.tilt * (1 - 0.3 * min(1, k)), Image.BICUBIC, expand=True)
        paste_center(base, img, 540, self.cy + (1 - k) * 260, scale=0.86 + 0.14 * k, alpha=min(1, k) * out)
        if self.label:
            kl = ease_back((t - self.t0 - 0.25) / 0.35)
            if kl > 0:
                top = self.cy - self.view_h / 2 + 4
                paste_center(base, self.label, 690, top, scale=0.7 + 0.3 * kl, alpha=min(1, kl) * out)


class Phone(Element):
    """A phone frame showing a (long) mobile screenshot, scrolled over time."""

    def __init__(self, t0, t1, img_path, scroll, screen_w=560, cy=760, label=None, blur_text=False):
        super().__init__(t0, t1)
        src = Image.open(img_path).convert("RGB")
        self.screen = src.resize((screen_w, int(src.height * screen_w / src.width)), Image.LANCZOS).convert("RGBA")
        self.sw, self.sh = screen_w, int(screen_w * 844 / 390)
        self.k = screen_w / 390  # scroll values are in CSS px of the 390-wide page
        self.scroll, self.cy = scroll, cy
        bez = 22
        fw, fh = self.sw + 2 * bez, self.sh + 2 * bez
        frame = rounded_box(fw, fh, 74, (18, 18, 20, 255))
        ImageDraw.Draw(frame).rounded_rectangle((3, 3, fw - 4, fh - 4), 72, outline=(70, 70, 76, 255), width=3)
        self.frame, self.bez = frame, bez
        self.mask = Image.new("L", (self.sw, self.sh), 0)
        ImageDraw.Draw(self.mask).rounded_rectangle((0, 0, self.sw - 1, self.sh - 1), 54, fill=255)
        self.label = rk.pill(label, font("Black", 36), BLACK, YELLOW) if label else None

    def offset(self, t):
        pts = self.scroll
        if t <= pts[0][0]:
            return pts[0][1]
        for (ta, ya), (tb, yb) in zip(pts, pts[1:]):
            if ta <= t <= tb:
                x = (t - ta) / max(1e-6, tb - ta)
                x = x * x * (3 - 2 * x)
                return ya + (yb - ya) * x
        return pts[-1][1]

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.45)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        y = int(min(self.offset(t) * self.k, self.screen.height - self.sh))
        scr = self.screen.crop((0, y, self.sw, y + self.sh))
        # motion blur while scrolling fast
        v = abs(self.offset(t + 1 / 30) - self.offset(t)) * self.k
        if v > 25:
            scr = scr.filter(ImageFilter.BoxBlur(min(6, v / 30)))
        scr.putalpha(self.mask)
        ph = self.frame.copy()
        ph.alpha_composite(scr, (self.bez, self.bez))
        # dynamic island
        ImageDraw.Draw(ph).rounded_rectangle((ph.width / 2 - 70, self.bez + 14, ph.width / 2 + 70, self.bez + 52), 20, fill=(0, 0, 0, 255))
        ph = shadowed(ph, r=74, blur=26, alpha=170)
        paste_center(base, ph, 540, self.cy + (1 - k) * 320, scale=0.85 + 0.15 * k, alpha=min(1, k) * out)
        if self.label:
            kl = ease_back((t - self.t0 - 0.3) / 0.35)
            if kl > 0:
                paste_center(base, self.label, 690, self.cy - self.sh / 2 - 6, scale=0.7 + 0.3 * kl, alpha=min(1, kl) * out)


# --------------------------------------------------------------- menu burst
class MenuBurst(Element):
    """Menu items pop up all over the place, then sway like they make you dizzy."""

    def __init__(self, t0, t1, items, every=0.16, dizzy_at=None, top=300, bottom=1150):
        super().__init__(t0, t1)
        rng = np.random.default_rng(4)
        f = font("Black", 40)
        self.items = []
        n = len(items)
        for i, s in enumerate(items):
            dark = i % 3 == 0
            img = rk.pill(s, f, WHITE if dark else BLACK, GREEN if dark else (255, 255, 255, 240), padx=30, pady=16)
            row = i % 7
            x = 100 + rng.uniform(0, 1) * 880
            y = top + (row + 0.5) * (bottom - top) / 7 + rng.uniform(-30, 30)
            x = min(max(x, img.width / 2 + 10), W - img.width / 2 - 10)
            self.items.append((t0 + i * every, img, x, y, rng.uniform(-7, 7), rng.uniform(0, 6.28)))
        self.dizzy_at = dizzy_at

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        dz = 0 if self.dizzy_at is None else ease_out((t - self.dizzy_at) / 0.6)
        for ti, img, x, y, rot, ph in self.items:
            k = ease_back((t - ti) / 0.25)
            if k <= 0:
                continue
            ang = rot + dz * 9 * math.sin(t * 3.2 + ph)
            dx = dz * 26 * math.sin(t * 2.4 + ph)
            im = img.rotate(ang, Image.BICUBIC, expand=True)
            paste_center(base, im, x + dx, y, scale=0.5 + 0.5 * k, alpha=min(1, k) * out)


# ------------------------------------------------------------------- quiz
class Quiz(Element):
    """'Listen first' flow: a question, options, a pick, then a recommendation."""

    def __init__(self, t0, t1, question, options, pick_i, pick_t, result_t, result_title, result_sub, result_img,
                 cy=700, step_label="PASO 1 DE 3"):
        super().__init__(t0, t1)
        self.cy = cy
        cw = 900
        fq, fo, fs = font("Black", 54), font("Black", 60), font("Bold", 30)
        # question card
        card = rounded_box(cw, 560, 44, (255, 255, 255, 250))
        d = ImageDraw.Draw(card)
        d.text((56, 52), step_label, font=fs, fill=(120, 120, 120, 255))
        d.rounded_rectangle((56, 100, 56 + 220, 108), 4, fill=GREEN)
        d.rounded_rectangle((56 + 220, 100, cw - 56, 108), 4, fill=(225, 225, 225, 255))
        y = 140
        for line in question:
            d.text((56, y), line, font=fq, fill=(20, 20, 20, 255)); y += 66
        self.card = card
        self.opt_y = y + 40
        self.opts = []
        ow = (cw - 112 - 3 * 24) // 4
        for i, s in enumerate(options):
            o = rounded_box(ow, 150, 30, (242, 242, 242, 255))
            ImageDraw.Draw(o).rounded_rectangle((0, 0, ow - 1, 149), 30, outline=(210, 210, 210, 255), width=3)
            on = rounded_box(ow, 150, 30, GREEN)
            for img, col in ((o, (30, 30, 30, 255)), (on, WHITE)):
                dd = ImageDraw.Draw(img)
                tw = dd.textlength(s, font=fo)
                dd.text(((ow - tw) / 2, 36), s, font=fo, fill=col)
            self.opts.append((56 + i * (ow + 24), o, on))
        self.pick_i, self.pick_t, self.result_t = pick_i, pick_t, result_t
        # recommendation card
        r = rounded_box(cw, 560, 44, (255, 255, 255, 250))
        d = ImageDraw.Draw(r)
        d.text((56, 46), "TE RECOMENDAMOS", font=fs, fill=GREEN)
        th = Image.open(result_img).convert("RGBA")
        th = th.resize((360, int(th.height * 360 / th.width)), Image.LANCZOS)
        th = round_corners(th.crop((0, 0, 360, min(th.height, 380))), 26)
        r.alpha_composite(th, (56, 110))
        tx = 56 + 360 + 40
        yy = 130
        for line in result_title:
            d.text((tx, yy), line, font=font("Black", 64), fill=(20, 20, 20, 255)); yy += 72
        yy += 10
        for line in result_sub:
            d.text((tx, yy), line, font=font("Semibold", 36), fill=(90, 90, 90, 255)); yy += 46
        btn = rk.pill("AGENDAR VISITA →", font("Black", 34), WHITE, GREEN, padx=34, pady=20)
        r.alpha_composite(btn, (tx - 20, 560 - btn.height - 30))
        self.result = r

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        k = ease_back((t - self.t0) / 0.45)
        if k <= 0:
            return
        if t < self.result_t:
            img = self.card.copy()
            for i, (x, o, on) in enumerate(self.opts):
                ko = ease_back((t - self.t0 - 0.35 - i * 0.12) / 0.3)
                if ko <= 0:
                    continue
                picked = i == self.pick_i and t >= self.pick_t
                im = on if picked else o
                if picked:
                    s = 1 + 0.12 * math.sin(min(1, (t - self.pick_t) / 0.25) * math.pi)
                    im = im.resize((int(im.width * s), int(im.height * s)), Image.BICUBIC)
                img.alpha_composite(im, (int(x - (im.width - o.width) / 2), int(self.opt_y - (im.height - o.height) / 2)))
            # little tap ripple
            if self.pick_t <= t < self.pick_t + 0.5:
                x, o, _ = self.opts[self.pick_i]
                rr = 30 + 160 * (t - self.pick_t)
                a = int(200 * (1 - (t - self.pick_t) / 0.5))
                cx, cy = x + o.width / 2, self.opt_y + 75
                ImageDraw.Draw(img).ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(0, 0, 0, a), width=6)
            img = shadowed(img, r=44)
            paste_center(base, img, 540, self.cy + (1 - k) * 260, scale=0.86 + 0.14 * k, alpha=min(1, k) * out)
        else:
            kr = ease_back((t - self.result_t) / 0.4)
            img = shadowed(self.result, r=44)
            # flip-in: squash horizontally
            sx = max(0.05, min(1, kr))
            im = img.resize((max(1, int(img.width * sx)), img.height), Image.BICUBIC)
            paste_center(base, im, 540, self.cy, alpha=out)


# ------------------------------------------------------------------ stamps
class Stamps(Element):
    """Rubber stamps slammed onto the frame, one by one. items: [(t, text, angle, cx, cy)]."""

    def __init__(self, items, t1, color=(255, 255, 255, 255), size=70):
        super().__init__(items[0][0], t1)
        f = font("Black", size)
        self.items = []
        for t, s, ang, cx, cy, *rest in items:
            col = rest[0] if rest else color
            tl = text_layer(s, f, col, stroke=0, shadow=False, tracking=3)
            tl = tl.crop(tl.getbbox())
            pad = 30
            img = Image.new("RGBA", (tl.width + 2 * pad + 16, tl.height + 2 * pad + 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.rounded_rectangle((8, 8, img.width - 9, img.height - 9), 16, fill=(0, 0, 0, 150), outline=col, width=8)
            img.alpha_composite(tl, (pad + 8, pad + 8))
            # worn ink texture
            rng = np.random.default_rng(len(s))
            a = np.array(img.getchannel("A")).astype(np.float32)
            a *= 0.82 + 0.18 * rng.random(a.shape)
            img.putalpha(Image.fromarray(a.astype(np.uint8)))
            img = img.rotate(ang, Image.BICUBIC, expand=True)
            self.items.append((t, img, cx, cy))

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        for ti, img, cx, cy in self.items:
            x = (t - ti) / 0.18
            if x < 0:
                continue
            s = 1.0 + 0.9 * (1 - ease_out(x))
            a = min(1, x * 2)
            paste_center(base, img, cx, cy, scale=s, alpha=a * out)


# --------------------------------------------------------------- heartbeat
class Pulse(Element):
    """Warm red vignette that beats like a heart. beats: list of times."""

    def __init__(self, t0, t1, beats):
        super().__init__(t0, t1)
        self.beats = beats
        yy = np.linspace(-1, 1, H)[:, None]
        xx = np.linspace(-1, 1, W)[None, :]
        r = np.sqrt(xx ** 2 * 0.9 + yy ** 2 * 0.55)
        a = np.clip((r - 0.35) / 0.75, 0, 1) ** 1.4
        arr = np.zeros((H, W, 4), np.uint8)
        arr[..., 0], arr[..., 1], arr[..., 2] = 230, 30, 60
        arr[..., 3] = (a * 235).astype(np.uint8)
        self.g = Image.fromarray(arr, "RGBA")
        self.alpha = np.array(self.g.getchannel("A")).astype(np.float32)

    def level(self, t):
        v = 0.25
        for b in self.beats:
            for dt, amp in ((0, 1.0), (0.24, 0.7)):
                x = t - b - dt
                if 0 <= x < 0.5:
                    v = max(v, 0.25 + amp * 0.75 * math.exp(-x * 9))
        return v

    def draw(self, base, t):
        k = min(ease_out((t - self.t0) / 0.3), ease_out((self.t1 - t) / 0.4)) * self.level(t)
        g = self.g.copy()
        g.putalpha(Image.fromarray((self.alpha * k).astype(np.uint8)))
        base.alpha_composite(g)


class Heart(Element):
    """A big heart outline that thumps with the beats, sitting behind a word."""

    def __init__(self, t0, t1, beats, cx=540, cy=470, size=430):
        super().__init__(t0, t1)
        n = 400
        th = np.linspace(0, 2 * math.pi, n)
        x = 16 * np.sin(th) ** 3
        y = -(13 * np.cos(th) - 5 * np.cos(2 * th) - 2 * np.cos(3 * th) - np.cos(4 * th))
        s = size / 34
        pts = [(size / 2 + 40 + xi * s, size / 2 + 40 + yi * s) for xi, yi in zip(x, y)]
        img = Image.new("RGBA", (size + 80, size + 80), (0, 0, 0, 0))
        ImageDraw.Draw(img).polygon(pts, fill=(230, 30, 60, 235))
        glow = img.filter(ImageFilter.GaussianBlur(24))
        out = Image.new("RGBA", img.size, (0, 0, 0, 0))
        out.alpha_composite(glow); out.alpha_composite(glow); out.alpha_composite(img)
        self.img, self.cx, self.cy, self.beats = out, cx, cy, beats

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.4)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        bump = 0
        for b in self.beats:
            for dt, amp in ((0, 0.14), (0.24, 0.09)):
                x = t - b - dt
                if 0 <= x < 0.4:
                    bump = max(bump, amp * math.exp(-x * 10))
        paste_center(base, self.img, self.cx, self.cy, scale=(0.6 + 0.4 * k) * (1 + bump), alpha=min(1, k) * out)


# ---------------------------------------------------------------- IG DMs
def dm_bubble(text, mine, maxw=820):
    f = font("Medium", 56)
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if f.getlength(trial) > maxw - 70 and cur:
            lines.append(cur); cur = wd
        else:
            cur = trial
    lines.append(cur)
    lw = int(max(f.getlength(l) for l in lines))
    w, h = lw + 76, len(lines) * 68 + 44
    if mine:
        g = np.zeros((h, w, 4), np.uint8)
        xs = np.linspace(0, 1, w)[None, :]
        c0, c1 = np.array([131, 58, 220]), np.array([60, 110, 245])
        col = c0 * (1 - xs[..., None]) + c1 * xs[..., None]
        g[..., :3] = np.broadcast_to(col, (h, w, 3)).astype(np.uint8)
        g[..., 3] = 255
        box = Image.fromarray(g, "RGBA")
        box = round_corners(box, 46)
        fg = WHITE
    else:
        box = rounded_box(w, h, 46, (38, 38, 42, 255))
        fg = WHITE
    d = ImageDraw.Draw(box)
    for i, l in enumerate(lines):
        d.text((38, 16 + i * 68), l, font=f, fill=fg)
    return shadowed(box, r=40, blur=14, alpha=120, dy=8)


class DMThread(Element):
    """Instagram-style DM thread on a dark panel. msgs: [(t, text, mine)]; seen_at: show 'Visto'."""

    def __init__(self, t1, msgs, title="constructora", top=300, seen_at=None, typing=None):
        super().__init__(msgs[0][0] - 0.35, t1)
        self.msgs = [(t, dm_bubble(s, mine), mine) for t, s, mine in msgs]
        self.top, self.seen_at, self.typing = top, seen_at, typing
        pw = 960
        head = rounded_box(pw, 140, 40, (12, 12, 14, 235))
        d = ImageDraw.Draw(head)
        g = np.zeros((84, 84, 4), np.uint8)
        g[..., 0], g[..., 1], g[..., 2], g[..., 3] = 225, 48, 108, 255
        av = Image.fromarray(g, "RGBA")
        m = Image.new("L", (84, 84), 0); ImageDraw.Draw(m).ellipse((0, 0, 83, 83), fill=255); av.putalpha(m)
        head.alpha_composite(av, (34, 28))
        d.text((140, 30), title, font=font("Bold", 44), fill=WHITE)
        d.text((140, 84), "Mensaje directo", font=font("Medium", 32), fill=(160, 160, 160, 255))
        self.head = head

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        kh = ease_back((t - self.t0) / 0.35)
        if kh <= 0:
            return
        paste_center(base, self.head, 540, self.top + 60 - (1 - kh) * 60, alpha=min(1, kh) * out)
        y = self.top + 170
        for t0, img, mine in self.msgs:
            if t < t0:
                break
            k = ease_back((t - t0) / 0.25)
            cx = 60 + img.width / 2 - 20 if not mine else 1020 - img.width / 2 + 20
            paste_center(base, img, cx, y + img.height / 2, scale=0.6 + 0.4 * k, alpha=min(1, k) * out)
            y += img.height - 18
        if self.typing and self.typing[0] <= t < self.typing[1]:
            dots = rounded_box(150, 76, 38, (38, 38, 42, 255))
            d = ImageDraw.Draw(dots)
            for i in range(3):
                a = 0.4 + 0.6 * max(0, math.sin(t * 9 - i * 0.9))
                d.ellipse((30 + i * 34, 28, 50 + i * 34, 48), fill=(200, 200, 200, int(255 * a)))
            paste_center(base, dots, 60 + 75, y + 50, alpha=out)
        if self.seen_at and t >= self.seen_at:
            k = ease_out((t - self.seen_at) / 0.3)
            s = text_layer("Visto", font("Semibold", 30), (170, 170, 170, 255), stroke=0, shadow=False)
            paste_center(base, s, 960, y + 20, alpha=k * out)


# ------------------------------------------------------------ price tags
class PriceTag(Element):
    """A swinging price tag. text changes at reveal_t (e.g. '$ ???' -> '$ 3.500')."""

    def __init__(self, t0, t1, before, after, reveal_t, cx=540, cy=520, caption=None):
        super().__init__(t0, t1)
        self.a = self.make(before, (90, 90, 90, 255), caption)
        self.b = self.make(after, (20, 20, 20, 255), caption)
        self.reveal_t, self.cx, self.cy = reveal_t, cx, cy

    @staticmethod
    def make(text, col, caption):
        f = font("Black", 110)
        tw = int(f.getlength(text))
        w, h = max(tw + 220, 560), 260 if caption else 220
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.polygon([(0, h / 2), (90, 0), (w, 0), (w, h), (90, h)], fill=YELLOW)
        d.ellipse((50, h / 2 - 20, 90, h / 2 + 20), fill=(30, 30, 30, 255))
        d.text((130, 34), text, font=f, fill=col)
        if caption:
            d.text((134, 172), caption, font=font("Bold", 40), fill=(60, 60, 60, 255))
        return shadowed(img, r=20, blur=16)

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.4)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        swing = 8 * math.exp(-(t - self.t0) * 2.2) * math.sin((t - self.t0) * 9)
        img = self.b if t >= self.reveal_t else self.a
        if self.reveal_t <= t < self.reveal_t + 0.25:
            sx = abs(math.cos((t - self.reveal_t) / 0.25 * math.pi))
            img = img.resize((max(1, int(img.width * max(0.05, sx))), img.height))
        img = img.rotate(swing - 6, Image.BICUBIC, expand=True)
        paste_center(base, img, self.cx, self.cy, scale=0.7 + 0.3 * k, alpha=min(1, k) * out)


# ---------------------------------------------------------- stack equation
class Stack(Element):
    """Pills stacking up, then a result line: HISTORIA + LO QUE HAS HECHO + TESTIMONIOS = CONFIANZA."""

    def __init__(self, items, result, result_t, t1, top=330):
        super().__init__(items[0][0], t1)
        f = font("Black", 54)
        self.items = [(t, rk.pill(s, f, BLACK, (255, 255, 255, 240), padx=36, pady=20)) for t, s in items]
        self.plus = text_layer("+", font("Black", 70), YELLOW, stroke=8)
        self.res = text_layer(result, font("Black", 116), YELLOW, stroke=12) if result else None
        self.eq = text_layer("=", font("Black", 90), WHITE, stroke=10)
        self.result_t, self.top = result_t, top

    def draw(self, base, t):
        out = ease_out((self.t1 - t) / 0.3)
        y = self.top
        for i, (ti, img) in enumerate(self.items):
            k = ease_back((t - ti) / 0.3)
            if k > 0:
                if i:
                    paste_center(base, self.plus, 540, y - 6, alpha=min(1, k) * out)
                    y += 62
                paste_center(base, img, 540 - (1 - min(1, k)) * 300, y + img.height / 2 - 20, alpha=min(1, k) * out)
            y += img.height - 10
        k = ease_back((t - self.result_t) / 0.35)
        if self.res is not None and k > 0:
            paste_center(base, self.eq, 540, y + 30, alpha=min(1, k) * out)
            paste_center(base, self.res, 540, y + 140, scale=0.6 + 0.4 * k, alpha=min(1, k) * out)


# ------------------------------------------------------------ live projects
class LiveProjects(Element):
    """Concept panel: obras en curso with progress bars filling up and a LIVE dot."""

    def __init__(self, t0, t1, rows, cy=640):
        super().__init__(t0, t1)
        self.rows, self.cy = rows, cy
        pw, ph = 920, 170 + len(rows) * 150
        p = rounded_box(pw, ph, 40, (255, 255, 255, 248))
        d = ImageDraw.Draw(p)
        d.text((56, 50), "OBRAS EN CURSO", font=font("Black", 54), fill=(20, 20, 20, 255))
        self.panel = p

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.45)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        p = self.panel.copy()
        d = ImageDraw.Draw(p)
        blink = 0.5 + 0.5 * math.sin(t * 6)
        d.ellipse((640, 66, 668, 94), fill=(235, 50, 50, int(120 + 135 * blink)))
        d.text((682, 58), "EN VIVO", font=font("Black", 38), fill=(235, 50, 50, 255))
        fl, fs = font("Bold", 40), font("Semibold", 30)
        for i, (name, stage, pct) in enumerate(self.rows):
            y = 160 + i * 150
            d.text((56, y), name, font=fl, fill=(25, 25, 25, 255))
            d.text((56, y + 52), stage, font=fs, fill=(120, 120, 120, 255))
            x = ease_out((t - self.t0 - 0.4 - i * 0.2) / 1.2) * pct
            d.rounded_rectangle((470, y + 30, 820, y + 58), 14, fill=(230, 230, 230, 255))
            if x > 0.01:
                d.rounded_rectangle((470, y + 30, 470 + 350 * x, y + 58), 14, fill=GREEN)
            d.text((834, y + 22), f"{int(x * 100)}%", font=font("Black", 32), fill=(25, 25, 25, 255))
        img = shadowed(p, r=40)
        paste_center(base, img, 540, self.cy + (1 - k) * 260, scale=0.86 + 0.14 * k, alpha=min(1, k) * out)


class Tint(Element):
    """Darken the video under a big graphic so it reads."""

    def __init__(self, t0, t1, alpha=120):
        super().__init__(t0, t1)
        self.alpha = alpha
        self.img = Image.new("RGBA", (W, H), (0, 0, 0, 255))

    def draw(self, base, t):
        k = min(ease_out((t - self.t0) / 0.3), ease_out((self.t1 - t) / 0.3))
        a = int(self.alpha * max(0, k))
        if a > 0:
            base.alpha_composite(Image.new("RGBA", (W, H), (0, 0, 0, a)))


# ------------------------------------------------------------------ sound
def synth_sfx(events, total, path, sr=48000):
    """Like reelkit.synth_sfx plus: thump (heartbeat), stamp, ding (DM), swish."""
    old = [(t, k) for t, k in events if k in ("whoosh", "hit", "pop", "tick")]
    rk.synth_sfx(old, total, path, sr)
    with wave.open(path) as w:
        out = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32767
    out = out.copy()
    rng = np.random.default_rng(11)
    for t, kind in events:
        i = int(t * sr)
        if kind == "thump":
            n = int(0.5 * sr); tt = np.arange(n) / sr
            one = np.sin(2 * math.pi * (55 + 30 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 14)
            sig = one * 0.75
            j = int(0.24 * sr)
            sig2 = np.zeros(n + j); sig2[:n] += sig; sig2[j:j + n] += sig * 0.6
            sig = sig2
        elif kind == "stamp":
            n = int(0.35 * sr); tt = np.arange(n) / sr
            sig = (np.sin(2 * math.pi * 70 * tt) * np.exp(-tt * 18) * 0.6
                   + rng.standard_normal(n) * np.exp(-tt * 60) * 0.25)
        elif kind == "ding":
            n = int(0.5 * sr); tt = np.arange(n) / sr
            sig = (np.sin(2 * math.pi * 1320 * tt) + 0.5 * np.sin(2 * math.pi * 1980 * tt)) * np.exp(-tt * 9) * 0.12
        elif kind == "swish":
            n = int(0.25 * sr); tt = np.arange(n) / sr
            noise = rng.standard_normal(n)
            sig = noise * np.sin(np.linspace(0, math.pi, n)) ** 2 * 0.12
            sig = np.convolve(sig, np.ones(8) / 8, "same")
        else:
            continue
        i = max(0, i)
        seg = sig[: len(out) - i]
        out[i:i + len(seg)] += seg
    out = np.clip(out, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
