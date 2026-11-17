"""autokit: the generic graphics an automatic reel plan can use (on top of reelkit + ep02kit).

Taken from Ep. 04's kit.py and made brand-neutral: the client's accent color comes from reels.json.
El Taller's yellow stays for the series layer (tag, captions, end card).

  BRoll        full-screen cutaway to another clip (under captions + tag)
  PhoneVideo   a screen recording of the prototype inside a phone
  LaptopVideo  a screen recording in a browser window
  Button       a big "pay" button that drops in; optionally crossed out (it doesn't exist)

autoreel.py sets WORK (cache dir), ACCENT and INK before building.
"""
import os, subprocess
from PIL import Image, ImageDraw
import reelkit as rk
import ep02kit as ek
from reelkit import W, H, WHITE, BLACK, font, text_layer, paste_center, rounded_box, ease_out, ease_back, Element

WORK = os.path.expanduser("~/.cache/el-taller-autokit")
ACCENT = (255, 210, 63, 255)
INK = (17, 17, 17, 255)
RED = (235, 64, 64, 255)
DRAFT = os.environ.get("DRAFT", "") not in ("", "0")


def hex_rgba(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


class BRoll(Element):
    """Full-screen cutaway: clip from `ss` seconds, slow push-in. Drawn under the tag and captions."""
    z = -1

    def __init__(self, t0, t1, clip, ss, push=0.06, focus=(0.5, 0.45), label=None, speed=1.0):
        super().__init__(t0, t1)
        dur = (t1 - t0) * speed + 0.4
        name = os.path.splitext(os.path.basename(clip))[0]
        self.dir = f"{WORK}/broll/{name}-{ss:.2f}-{dur:.2f}-{'d' if DRAFT else 'f'}"
        if not os.path.exists(f"{self.dir}/done"):
            os.makedirs(self.dir, exist_ok=True)
            vf = f"fps={rk.FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},{rk.GRADE}"
            if DRAFT:
                vf += ",scale=270:480,hue=s=0"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{ss:.3f}", "-i", clip, "-t", f"{dur:.3f}",
                            "-vf", vf, "-q:v", "3", f"{self.dir}/%04d.jpg"], check=True)
            open(f"{self.dir}/done", "w").close()
        self.n = len([f for f in os.listdir(self.dir) if f.endswith(".jpg")])
        self.push, self.focus, self.speed = push, focus, speed
        self.label = None
        if label:
            a, b = (label + [""])[:2] if isinstance(label, list) else label
            la = rk.pill(a, font("Black", 34), INK, ACCENT, padx=22, pady=12)
            img_w, parts = la.width, [(la, 0)]
            if b:
                lb = text_layer(b, font("Bold", 32), WHITE, stroke=0, tracking=2)
                lb = lb.crop(lb.getbbox())
                parts.append((lb, la.width + 18)); img_w += lb.width + 24
            img = Image.new("RGBA", (img_w, la.height + 20), (0, 0, 0, 0))
            for p, x in parts:
                img.alpha_composite(p, (x, (la.height - p.height) // 2))
            self.label = img

    def draw(self, base, t):
        i = min(self.n, int((t - self.t0) * rk.FPS * self.speed) + 1)
        fr = Image.open(f"{self.dir}/{i:04d}.jpg").convert("RGB")
        p = (t - self.t0) / max(0.1, self.t1 - self.t0)
        s = 1 + self.push * p
        fw, fh = fr.size
        cw, ch = fw / s, fh / s
        x0, y0 = (fw - cw) * self.focus[0], (fh - ch) * self.focus[1]
        base.alpha_composite(fr.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch)).convert("RGBA"))
        if self.label:
            k = ease_out((t - self.t0 - 0.2) / 0.4) * ease_out((self.t1 - t) / 0.2)
            if k > 0:
                lab = self.label if k >= 1 else Image.blend(Image.new("RGBA", self.label.size, (0, 0, 0, 0)), self.label, k)
                base.alpha_composite(lab, (max(0, int(56 - (1 - k) * 80)), 1560))


class _RecFrames:
    """Frames of a screen recording, extracted once (30 fps) at the size they're drawn."""

    def __init__(self, video, width, crop=None):
        name = os.path.splitext(os.path.basename(video))[0]
        tag = f"{width}" + (f"-{'-'.join(map(str, crop))}" if crop else "")
        self.dir = f"{WORK}/rec/{name}-{tag}"
        if not os.path.exists(f"{self.dir}/done") or os.path.getmtime(video) > os.path.getmtime(f"{self.dir}/done"):
            os.makedirs(self.dir, exist_ok=True)
            for f in os.listdir(self.dir):
                os.remove(f"{self.dir}/{f}")
            vf = (f"crop={crop[2] - crop[0]}:{crop[3] - crop[1]}:{crop[0]}:{crop[1]}," if crop else "") + \
                 f"fps=30,scale={width}:-2:flags=lanczos"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", vf, "-q:v", "2", f"{self.dir}/%05d.jpg"],
                           check=True)
            open(f"{self.dir}/done", "w").close()
        self.n = len([f for f in os.listdir(self.dir) if f.endswith(".jpg")])
        self.size = Image.open(f"{self.dir}/00001.jpg").size

    def at(self, src_t):
        i = min(self.n, max(1, int(src_t * 30) + 1))
        return Image.open(f"{self.dir}/{i:05d}.jpg").convert("RGBA")


def _src_time(keys, t):
    """keys: [(reel_t, src_t[, speed]), ...]: from each key the recording plays at 1x (or speed) until the next."""
    cur = keys[0]
    for k in keys:
        if t >= k[0]:
            cur = k
    speed = cur[2] if len(cur) > 2 else 1.0
    return cur[1] + max(0.0, t - cur[0]) * speed


class PhoneVideo(Element):
    """A screen recording of the prototype inside a phone, synced to the voice with keys."""

    def __init__(self, t0, t1, video, keys, screen_w=480, cy=850, label=None, x=540):
        super().__init__(t0, t1)
        self.fr = _RecFrames(video, screen_w)
        self.sw, self.sh = screen_w, int(screen_w * 844 / 390)
        self.keys, self.cy, self.x = keys, cy, x
        bez = 20
        fw, fh = self.sw + 2 * bez, self.sh + 2 * bez
        frame = rounded_box(fw, fh, 70, (18, 18, 20, 255))
        ImageDraw.Draw(frame).rounded_rectangle((3, 3, fw - 4, fh - 4), 68, outline=(70, 70, 76, 255), width=3)
        self.frame, self.bez = frame, bez
        self.mask = Image.new("L", (self.sw, self.sh), 0)
        ImageDraw.Draw(self.mask).rounded_rectangle((0, 0, self.sw - 1, self.sh - 1), 52, fill=255)
        self.label = rk.pill(label, font("Black", 34), INK, ACCENT, padx=24, pady=12) if label else None

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.45)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        scr = self.fr.at(_src_time(self.keys, t)).crop((0, 0, self.sw, self.sh))
        scr.putalpha(self.mask)
        ph = self.frame.copy()
        ph.alpha_composite(scr, (self.bez, self.bez))
        ph = ek.shadowed(ph, r=70, blur=26, alpha=170)
        paste_center(base, ph, self.x, self.cy + (1 - k) * 320, scale=0.85 + 0.15 * k, alpha=min(1, k) * out)
        if self.label:
            kl = ease_back((t - self.t0 - 0.3) / 0.35)
            if kl > 0:
                paste_center(base, self.label, self.x, self.cy - self.sh / 2 - 30, scale=0.7 + 0.3 * kl,
                             alpha=min(1, kl) * out)


class LaptopVideo(Element):
    """A screen recording in a browser window (the owner's computer), optionally cropped."""

    def __init__(self, t0, t1, video, keys, crop=None, width=1000, cy=760, label=None, url=""):
        super().__init__(t0, t1)
        self.fr = _RecFrames(video, width, crop)
        self.keys, self.cy = keys, cy
        bar = 58
        w, h = width, self.fr.size[1] + bar
        win = rounded_box(w, h, 22, (236, 236, 238, 255))
        d = ImageDraw.Draw(win)
        for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
            d.ellipse((22 + i * 30, 20, 40 + i * 30, 38), fill=c + (255,))
        d.rounded_rectangle((140, 12, w - 140, 46), 12, fill=(255, 255, 255, 255))
        if url:
            f = font("Semibold", 22)
            d.text((w / 2 - d.textlength(url, font=f) / 2, 17), url, font=f, fill=(90, 90, 96, 255))
        self.win, self.bar = win, bar
        self.label = rk.pill(label, font("Black", 34), INK, ACCENT, padx=24, pady=12) if label else None

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.45)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        img = self.win.copy()
        img.alpha_composite(self.fr.at(_src_time(self.keys, t)), (0, self.bar))
        img = ek.shadowed(ek.round_corners(img, 22), r=22)
        paste_center(base, img, 540, self.cy + (1 - k) * 260, scale=0.86 + 0.14 * k, alpha=min(1, k) * out)
        if self.label:
            kl = ease_back((t - self.t0 - 0.3) / 0.35)
            if kl > 0:
                paste_center(base, self.label, 540, self.cy - img.height / 2 + 10, scale=0.7 + 0.3 * kl,
                             alpha=min(1, kl) * out)


class Button(Element):
    """A big accent-colored button that drops in. struck_t: crossed out in red from then on (it doesn't exist)."""

    def __init__(self, t0, t1, text, cy=560, struck_t=None):
        super().__init__(t0, t1)
        f = font("Black", 84)
        tw = int(ImageDraw.Draw(Image.new("RGBA", (1, 1))).textlength(text, font=f))
        w, h = tw + 140, 170
        img = rounded_box(w, h, 34, ACCENT)
        ImageDraw.Draw(img).text(((w - tw) / 2, 34), text, font=f, fill=INK)
        self.img = ek.shadowed(img, r=34)
        self.cy, self.struck_t = cy, struck_t

    def draw(self, base, t):
        k = ease_back((t - self.t0) / 0.4)
        out = ease_out((self.t1 - t) / 0.3)
        if k <= 0:
            return
        img = self.img
        if self.struck_t is not None and t >= self.struck_t:
            img = img.copy()
            d = ImageDraw.Draw(img)
            x = ease_out((t - self.struck_t) / 0.25)
            pad = 70
            d.line((pad, img.height - pad, pad + (img.width - 2 * pad) * x,
                    img.height - pad - (img.height - 2 * pad) * x), fill=RED, width=16)
            img.alpha_composite(Image.new("RGBA", img.size, (0, 0, 0, int(110 * x))))
        paste_center(base, img, 540, self.cy + (1 - min(1, k)) * 60, scale=0.7 + 0.3 * k, alpha=min(1, k) * out)
