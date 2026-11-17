#!/usr/bin/env python3
"""longcut: the whole take → the long YouTube episode (PIPELINE.md §4, item 12).

    tools/.venv/bin/python tools/longcut.py el-taller/ep04-endemico             render everything → <ep>/long/
    tools/.venv/bin/python tools/longcut.py el-taller/ep04-endemico --check     print the cut (segments, chapters) only
    tools/.venv/bin/python tools/longcut.py el-taller/ep04-endemico --stills    one still per panel state (look at the layout)
    tools/.venv/bin/python tools/longcut.py el-taller/ep04-endemico --preview 90   only the first 90 s of the cut
    tools/.venv/bin/python tools/longcut.py el-taller/ep04-endemico --thumb     only srt, youtube.txt and the thumbnail

The frame is 16:9: JP's vertical take in the center (608x1080), the episode and chapter on the left, what he's talking
about on the right (screenshots or screen recordings). Pauses longer than GAP are cut (jump cuts) from the aligned words.

Reads <ep>/long.json (times are SOURCE seconds in the raw take; they snap to the nearest gap between words):
{
  "take": "raw/…/IMG_4619.MOV",
  "start": 54.0, "end": 1403.0,               // first and last second kept
  "skip": [[a, b, "why"]],                    // ranges removed (retakes, private things)
  "acts": [[t, 1], [t, 2], [t, 3]],           // where El caso / El nudo / La propuesta begin ([] for a rant: no act block)
  "chapters": [[t, "Título"]],                // YouTube chapters, also shown on the left
  "panels": [[t, "assets/raw/x.png" | "assets/rec/x.mp4" | null, "etiqueta"]],   // right side, from t on
  "title": "…", "hook": ["LINE", "<m>WORD</m>", "LINE"], "thumb_frame": 123.4,
  "summary": "…", "links": [["Prototipo", "https://…"]], "review_notes": ["…"],
  // optional: "business", "handle", "pfp", "accent", "accent_ink" (default: cover/cover.json), "fixes": {"Alceba": "Seba"}
}
Writes <ep>/long/: epNN-long.mp4 (1920x1080, 29.97 fps) · epNN-long.srt (captions on the cut's timeline) ·
epNN-thumb.jpg (1280x720) · epNN-youtube.txt (title, description with chapters, tags) · cut.json (segments, for checks)
"""
import concurrent.futures as cf, glob, hashlib, html, json, os, re, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BG = f"{ROOT}/el-taller/brand/taller-vacio.jpg"
YELLOW = "#FFD23F"
ACTS = {1: "EL CASO", 2: "EL NUDO", 3: "LA PROPUESTA"}

FPS_N, FPS_D = 30000, 1001
FPS = FPS_N / FPS_D
SR = 48000
GAP = 0.75            # a silence longer than this is cut
PRE, POST = 0.14, 0.24  # air kept before the first word and after the last word of each piece
W, H = 1920, 1080
VX, VW = 656, 608     # the take: x and width (full height)
BOX = (1312, 96, 1872, 924)   # right panel media box (x0, y0, x1, y1); the label goes under it


# ------------------------------------------------------------------ plan
def load(ep):
    cfg = json.load(open(f"{ep}/long.json"))
    cov = {}
    if os.path.exists(f"{ep}/cover/cover.json"):
        cov = json.load(open(f"{ep}/cover/cover.json"))
    for k in ("handle", "pfp", "accent", "accent_ink"):
        if k not in cfg and k in cov:
            cfg[k] = cov[k]
    cfg.setdefault("accent", YELLOW)
    cfg.setdefault("accent_ink", "#111111")
    cfg.setdefault("skip", [])
    cfg.setdefault("fixes", {})
    for k in ("chapters", "acts", "panels", "skip"):
        cfg.setdefault(k, [])
        cfg[k].sort(key=lambda r: r[0])
    cfg["nn"] = os.path.basename(ep)[2:4]
    cfg["take"] = cfg["take"] if os.path.isabs(cfg["take"]) else os.path.join(ROOT, cfg["take"])
    return cfg


def words(ep, take):
    stem = os.path.basename(take).rsplit(".", 1)[0]
    p = f"{ep}/transcript/{stem}.aligned.json"
    if os.path.exists(p):
        ws = [(w["t"], w["a"], w["b"]) for w in json.load(open(p))]
    else:                                                           # whisper one-word segments (less exact)
        d = json.load(open(f"{ep}/transcript/{stem}.words.json"))
        ws = [(s["text"].strip(), s["offsets"]["from"] / 1000, s["offsets"]["to"] / 1000)
              for s in d["transcription"] if s["text"].strip()]
        print(f"  ! no {stem}.aligned.json: using whisper word times (cuts less exact)")
    return [(t, a, min(b, a + 1.5)) for t, a, b in ws if b >= a]


def in_skip(t, skips):
    return any(a <= t <= b for a, b, *_ in skips)


def cut(cfg, ws):
    """[(f0, f1)] output-grid frame ranges of the source (f1 exclusive) to keep, in order."""
    start, end, skips = cfg["start"], cfg["end"], cfg["skip"]
    keep = [w for w in ws if start <= (w[1] + w[2]) / 2 <= end and not in_skip((w[1] + w[2]) / 2, skips)]
    groups = []
    for t, a, b in keep:
        crosses = groups and any(s0 < a and e0 > groups[-1][1] for s0, e0, *_ in skips)
        if groups and a - groups[-1][1] < GAP and not crosses:
            groups[-1][1] = max(groups[-1][1], b)
        else:
            groups.append([a, b])
    segs = []
    for i, (a, b) in enumerate(groups):
        lo = max(a - PRE, start - 0.05, segs[-1][1] if segs else 0)
        hi = b + POST
        if i + 1 < len(groups):
            hi = min(hi, (b + groups[i + 1][0]) / 2 if groups[i + 1][0] - b < 2 * POST else hi)
        for s0, e0, *_ in skips:                                    # never bleed into a skipped range
            if s0 >= b - 0.01 and hi > s0:
                hi = s0
            if e0 <= a + 0.01 and lo < e0:
                lo = e0
        segs.append([lo, hi])
    frames = []
    for a, b in segs:
        f0, f1 = round(a * FPS), round(b * FPS)
        if frames and f0 <= frames[-1][1]:
            frames[-1][1] = max(frames[-1][1], f1)
        elif f1 - f0 >= 3:
            frames.append([f0, f1])
    return frames


def mapper(frames):
    """src seconds → output seconds."""
    starts, cum = [], 0
    for f0, f1 in frames:
        starts.append((f0, f1, cum))
        cum += f1 - f0

    def out(t):
        f = t * FPS
        for f0, f1, c in starts:
            if f < f1:
                return (c + max(0, f - f0)) / FPS
        return cum / FPS
    out.total = cum / FPS
    return out


def states(cfg, out, total):
    """Output-time intervals where the left/right panels don't change: [(t0, t1, chapter, act, panel, label)]."""
    marks = sorted({0.0} | {round(out(t), 3) for t, *_ in cfg["chapters"] + cfg["acts"] + cfg.get("panels", [])})
    marks = [m for m in marks if m < total - 0.05]

    def at(lst, t, default):
        cur = default
        for row in lst:
            if out(row[0]) <= t + 1e-3:
                cur = row
        return cur
    res = []
    for i, m in enumerate(marks):
        t1 = marks[i + 1] if i + 1 < len(marks) else total
        ch = at(cfg["chapters"], m, [0, ""])[1]
        act = at(cfg["acts"], m, [0, 0])[1]          # 0 = no acts (a rant): the act block is hidden
        pn = at(cfg.get("panels", []), m, [0, None, ""])
        key = (ch, act, pn[1], pn[2] if len(pn) > 2 else "")
        if res and res[-1][2:] == key:
            res[-1] = (res[-1][0], t1) + key
        else:
            res.append((m, t1) + key)
    return res


def fmt(t, srt=False):
    if srt:
        ms = round(t * 1000)
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    t = int(t)
    return f"{t // 3600}:{t // 60 % 60:02d}:{t % 60:02d}" if t >= 3600 else f"{t // 60}:{t % 60:02d}"


# ------------------------------------------------------------------ panels (HTML → PNG with headless Chrome)
CSS = """
@font-face { font-family: SFB; src: url('file:///Library/Fonts/SF-Pro-Display-Black.otf'); }
@font-face { font-family: SFH; src: url('file:///Library/Fonts/SF-Pro-Display-Heavy.otf'); }
@font-face { font-family: SFS; src: url('file:///Library/Fonts/SF-Pro-Display-Semibold.otf'); }
@font-face { font-family: SFM; src: url('file:///Library/Fonts/SF-Pro-Display-Medium.otf'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1920px; height: 1080px; overflow: hidden; background: #000; -webkit-font-smoothing: antialiased; color: #fff; }
.bg { position: absolute; inset: -20px; background: url('BGURL') center 40%/cover; filter: blur(14px) brightness(.32) saturate(.8); }
.vid { position: absolute; left: 656px; top: 0; width: 608px; height: 1080px; background: #000;
  box-shadow: 0 0 80px rgba(0,0,0,.7); }
.left { position: absolute; left: 64px; top: 92px; width: 528px; bottom: 92px; display: flex; flex-direction: column; }
.kicker { font-family: SFS; font-size: 22px; letter-spacing: .32em; color: YELLOW; }
.chip { margin-top: 26px; display: flex; align-items: center; gap: 16px; font-family: SFS; font-size: 28px; }
.chip img { width: 64px; height: 64px; }
.ch { margin-top: auto; font-family: SFB; font-size: 62px; line-height: 1.0; letter-spacing: -.015em;
  text-shadow: 0 4px 24px rgba(0,0,0,.5); }
.act { margin-top: 40px; display: flex; align-items: center; gap: 18px; font-family: SFS; font-size: 24px; letter-spacing: .26em; }
.act b { font-family: SFH; letter-spacing: .02em; color: YELLOW; border: 2.5px solid YELLOW; border-radius: 99px; padding: 3px 16px; font-size: 24px; }
.prog { margin-top: 22px; display: flex; gap: 10px; }
.prog i { flex: 1; height: 10px; border-radius: 5px; background: rgba(255,255,255,.18); }
.prog i.done { background: YELLOW; }
.prog i.now { background: YELLOW; box-shadow: 0 0 0 4px rgba(255,210,63,.2), 0 0 26px rgba(255,210,63,.5); }
.foot { margin-top: 44px; font-family: SFM; font-size: 20px; color: rgba(255,255,255,.5); letter-spacing: .04em; }
.media { position: absolute; left: BX0px; top: BY0px; width: BWpx; height: BHpx; display: flex; align-items: center; justify-content: center; }
.media img.shot { max-width: 100%; max-height: 100%; border-radius: 22px; box-shadow: 0 20px 60px rgba(0,0,0,.6);
  border: 1px solid rgba(255,255,255,.12); }
.media .hole { border-radius: 22px; background: #000; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
.label { position: absolute; left: BX0px; width: BWpx; top: LYpx; text-align: center; font-family: SFS; font-size: 24px;
  letter-spacing: .14em; color: rgba(255,255,255,.82); text-transform: uppercase; }
.card { display: flex; flex-direction: column; align-items: center; gap: 30px; text-align: center; }
.card img { width: 300px; height: 300px; }
.card .h { font-family: SFB; font-size: 46px; }
.card .u { font-family: SFM; font-size: 24px; color: rgba(255,255,255,.6); letter-spacing: .04em; }
"""


def media_size(path):
    if path.endswith(".mp4"):
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
                            "-of", "json", path], capture_output=True, text=True)
        s = json.loads(r.stdout)["streams"][0]
        w, h = s["width"], s["height"]
        if any(abs(d.get("rotation", 0)) == 90 for d in s.get("side_data_list", [])):
            w, h = h, w
        return w, h
    return Image.open(path).size


def fit(w, h):
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    s = min(bw / w, bh / h)
    fw, fh = int(w * s) // 2 * 2, int(h * s) // 2 * 2
    return fw, fh, BOX[0] + (bw - fw) // 2 // 2 * 2, BOX[1] + (bh - fh) // 2 // 2 * 2


def state_html(ep, cfg, work, st):
    t0, t1, ch, act, panel, label = st
    prog = "".join(f'<i class="{"done" if k < act else "now" if k == act else ""}"></i>' for k in (1, 2, 3))
    chip = f'<div class="chip"><img src="{work}/avatar.png">@{html.escape(cfg["handle"])}</div>' if cfg.get("handle") else ""
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    if panel is None:
        link = next((u for n, u in cfg.get("links", []) if "rototipo" in n), "")
        media = (f'<div class="card"><img src="{work}/avatar-big.png"><div class="h">{html.escape(cfg.get("business", ""))}</div>'
                 f'<div class="u">{html.escape(link.replace("https://", ""))}</div></div>')
        label_html = ""
    else:
        path = os.path.join(ep, panel)
        fw, fh, x, y = fit(*media_size(path))
        if panel.endswith(".mp4"):
            media = f'<div class="hole" style="width:{fw}px;height:{fh}px"></div>'
        else:
            media = f'<img class="shot" src="file://{path}">'
        label_html = f'<div class="label" style="top:{y + fh + 26}px">{html.escape(label or "")}</div>' if label else ""
    css = (CSS.replace("YELLOW", YELLOW).replace("BGURL", f"file://{BG}").replace("BX0", str(BOX[0])).replace("BY0", str(BOX[1]))
           .replace("BW", str(bw)).replace("BH", str(bh)).replace("LY", str(BOX[3] + 26)))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>
<div class="bg"></div><div class="vid"></div>
<div class="left"><div class="kicker">EL TALLER · EP. {cfg['nn']}</div>{chip}
<div class="ch">{html.escape(ch)}</div>
{f'<div class="act"><b>{act}/3</b>{ACTS[act]}</div><div class="prog">{prog}</div>' if act else ""}
<div class="foot">El Taller con JP</div></div>
<div class="media">{media}</div>{label_html}
</body></html>"""


def chrome_png(page, out, w=W, h=H):
    src = out.rsplit(".", 1)[0] + ".html"
    open(src, "w").write(page)
    with tempfile.TemporaryDirectory() as prof:
        for _ in range(3):
            r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                                f"--user-data-dir={prof}", "--no-first-run", "--force-device-scale-factor=1",
                                f"--window-size={w},{h}", "--virtual-time-budget=4000", f"--screenshot={out}", f"file://{src}"],
                               capture_output=True)
            if r.returncode == 0 and os.path.exists(out):
                break
        else:
            raise RuntimeError(f"chrome failed: {r.stderr.decode()[-400:]}")
    os.remove(src)
    return out


def avatars(ep, cfg, work):
    import covers
    pfp = cfg.get("pfp")
    if pfp:
        pfp = pfp if os.path.isabs(pfp) else os.path.join(ep, pfp)
    if not pfp or not os.path.exists(pfp):
        pfp = f"{ROOT}/el-taller/brand/pfp.jpg"
    covers.avatar(pfp, 128, ring=7).save(f"{work}/avatar.png")
    covers.avatar(pfp, 300, ring=12).save(f"{work}/avatar-big.png")


def render_states(ep, cfg, work, sts):
    os.makedirs(f"{work}/states", exist_ok=True)
    jobs = {}
    with cf.ThreadPoolExecutor(4) as pool:
        for i, st in enumerate(sts):
            out = f"{work}/states/{i:03d}.png"
            jobs[pool.submit(chrome_png, state_html(ep, cfg, work, st), out)] = i
        for f in cf.as_completed(jobs):
            f.result()
    return [f"{work}/states/{i:03d}.png" for i in range(len(sts))]


def rounded_mask(w, h, r, out):
    S = 3
    m = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * S - 1, h * S - 1), r * S, fill=255)
    m.resize((w, h), Image.LANCZOS).save(out)
    return out


# ------------------------------------------------------------------ audio
def cut_audio(take, frames, out_wav, limit=None):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", take, "-map", "0:a:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32)
    fade = int(0.006 * SR)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    parts, cum_f, cum_s = [], 0, 0
    for f0, f1 in frames:
        s0 = round(f0 / FPS * SR)
        cum_f += f1 - f0
        n = round(cum_f / FPS * SR) - cum_s                      # sample-exact against the video frame count
        cum_s += n
        seg = a[s0:s0 + n].copy()
        if len(seg) < n:
            seg = np.pad(seg, (0, n - len(seg)))
        if n > 2 * fade:
            seg[:fade] *= ramp
            seg[-fade:] *= ramp[::-1]
        parts.append(seg)
        if limit and cum_f / FPS >= limit:
            break
    y = np.concatenate(parts)
    if limit:
        y = y[:int(limit * SR)]
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    import wave
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)
    return out_wav


def loudnorm_args(wav):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "highpass=f=70,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    m = json.loads(r.stderr[r.stderr.rindex("{"):r.stderr.rindex("}") + 1])
    return (f"highpass=f=70,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
            f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")


# ------------------------------------------------------------------ captions, text, thumbnail
def captions(cfg, ws, frames, out, path):
    fixes = cfg["fixes"]
    kept = []
    for t, a, b in ws:
        m = (a + b) / 2 * FPS
        if any(f0 <= m < f1 for f0, f1 in frames):
            for k, v in fixes.items():
                t = re.sub(rf"\b{re.escape(k)}\b", v, t)
            kept.append((t, out(a), out(b)))
    cues, cur = [], []
    for w in kept:
        if cur and (len(" ".join(x[0] for x in cur + [w])) > 42 or w[1] - cur[-1][2] > 0.6 or w[2] - cur[0][1] > 3.6):
            cues.append(cur); cur = []
        cur.append(w)
    if cur:
        cues.append(cur)
    with open(path, "w") as f:
        for i, c in enumerate(cues, 1):
            end = min(c[-1][2] + 0.3, cues[i][0][1] if i < len(cues) else c[-1][2] + 0.3)
            f.write(f"{i}\n{fmt(c[0][1], True)} --> {fmt(end, True)}\n{' '.join(x[0] for x in c)}\n\n")


def youtube_text(cfg, out, path):
    ch = []
    for i, (t, name) in enumerate(cfg["chapters"]):
        ch.append((0 if i == 0 else out(t), name))
    h = cfg.get("handle")                                           # JP, 2026-11-17: "@endemico.ft - Le hice una APP…"
    title = f"@{h} - {cfg['title']}" if h and h != "eltallerconjp" else cfg["title"]
    if len(title) > 100:
        print(f"  ! title: {len(title)} chars, YouTube allows 100")
    lines = [title, "", "=" * 40, "", cfg["summary"].strip(), ""]
    lines += [f"{fmt(t)} {name}" for t, name in ch]
    lines += [""] + [f"{n}: {u}" for n, u in cfg.get("links", [])]
    lines += ["", "El Taller con JP: elijo un negocio real, encuentro dónde se le escapa la energía y le construyo un prototipo.",
              "Cuéntame de tu negocio y te doy ideas: https://instagram.com/eltallerconjp", "",
              "#ElTaller #emprendimiento #negocios"]
    open(path, "w").write("\n".join(lines) + "\n")
    short = [c for c in zip(ch, ch[1:]) if c[1][0] - c[0][0] < 10]
    if len(ch) < 3 or short:
        print(f"  ! chapters: YouTube needs >= 3, each >= 10 s ({len(ch)} chapters, short: {short})")


THUMB_CSS = """
@font-face { font-family: SFB; src: url('file:///Library/Fonts/SF-Pro-Display-Black.otf'); }
@font-face { font-family: SFS; src: url('file:///Library/Fonts/SF-Pro-Display-Semibold.otf'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1280px; height: 720px; overflow: hidden; background: #000; -webkit-font-smoothing: antialiased; }
.bg { position: absolute; inset: -10px; background: url('BGURL') center 40%/cover; filter: blur(5px) brightness(.45) saturate(.85); }
.sh { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.75) 0, rgba(0,0,0,.35) 55%, rgba(0,0,0,0) 100%); }
.jp { position: absolute; right: -10px; bottom: 0; height: 690px; -webkit-mask-image: linear-gradient(180deg, #000 85%, transparent 100%); }
.k { position: absolute; left: 56px; top: 48px; font-family: SFS; font-size: 24px; letter-spacing: .3em; color: YELLOW; }
.hl { position: absolute; left: 52px; top: 108px; width: 760px; font-family: SFB; font-size: 112px; line-height: .93; letter-spacing: -.02em; color: #fff;
  text-shadow: 0 6px 30px rgba(0,0,0,.5); }
.hl > div + div { margin-top: 6px; }
m { background: ACCENT; color: INK; padding: 0 .12em; margin: 0 -.04em; display: inline-block; transform: skewX(-7deg); }
m > span { display: inline-block; transform: skewX(7deg); }
.chip { position: absolute; left: 56px; bottom: 50px; display: flex; align-items: center; gap: 16px; font-family: SFS; font-size: 32px; color: #fff; }
.chip img { width: 76px; height: 76px; }
"""


def thumbnail(ep, cfg, work, path):
    import covers2
    still = f"{work}/thumb-frame.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(cfg["thumb_frame"]), "-i", cfg["take"], "-frames:v", "1", "-q:v", "2", still], check=True)
    table_y = None
    if os.path.exists(f"{ep}/cover/cover.json"):
        table_y = json.load(open(f"{ep}/cover/cover.json")).get("table_y")
    covers2.jp_cutout(still, table_y, f"{work}/thumb-jp.png")
    lines = "".join("<div>" + l.replace("<m>", "<m><span>").replace("</m>", "</span></m>") + "</div>" for l in cfg["hook"])
    chip = f'<div class="chip"><img src="{work}/avatar.png">@{html.escape(cfg["handle"])}</div>' if cfg.get("handle") else ""
    css = (THUMB_CSS.replace("YELLOW", YELLOW).replace("ACCENT", cfg["accent"]).replace("INK", cfg["accent_ink"])
           .replace("BGURL", f"file://{BG}"))
    page = (f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body><div class='bg'></div>"
            f"<img class='jp' src='{work}/thumb-jp.png'><div class='sh'></div><div class='k'>EL TALLER · EP. {cfg['nn']}</div>"
            f"<div class='hl'>{lines}</div>{chip}</body></html>")
    png = chrome_png(page, f"{work}/thumb.png", 1280, 720)
    Image.open(png).convert("RGB").save(path, quality=93)


# ------------------------------------------------------------------ video
def render(ep, cfg, frames, sts, pngs, work, out_mp4, limit=None):
    total = sum(f1 - f0 for f0, f1 in frames) / FPS
    dur = min(total, limit) if limit else total
    wav = cut_audio(cfg["take"], frames, f"{work}/audio.wav", limit)
    af = loudnorm_args(wav)
    # panel track: one still per state, exact durations on the 29.97 grid
    cc, last = ["ffconcat version 1.0"], pngs[0]
    for (t0, t1, *_), png in zip(sts, pngs):
        if t0 >= dur:
            break
        cc += [f"file '{png}'", f"duration {min(t1, dur) - t0:.6f}"]
        last = png
    cc += [f"file '{last}'"]                                         # the concat demuxer needs the last one twice
    open(f"{work}/panels.ffconcat", "w").write("\n".join(cc) + "\n")
    # the stills → a plain video first: fed through the concat demuxer into the overlay, ffmpeg queued take frames
    # (17 GB in 30 s, Ep. 11) until macOS killed it. Two ordinary video inputs overlay in ~200 MB.
    bg = f"{work}/bg-{'preview' if limit else 'full'}.mp4"
    key = json.dumps([cc, [hashlib.md5(open(x, "rb").read()).hexdigest() for x in pngs], dur])
    if not (os.path.exists(bg) and os.path.exists(bg + ".key") and open(bg + ".key").read() == key):
        subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-stats", "-y", "-f", "concat", "-safe", "0",
                        "-i", f"{work}/panels.ffconcat", "-vf", f"fps={FPS_N}/{FPS_D},format=yuv420p", "-t", f"{dur:.3f}",
                        "-c:v", "h264_videotoolbox", "-b:v", "2M", bg], check=True)
        open(bg + ".key", "w").write(key)

    def tree(xs):                                                   # balanced: ffmpeg's parser can't take 150 terms in a row
        return xs[0] if len(xs) == 1 else f"({tree(xs[:len(xs) // 2])}+{tree(xs[len(xs) // 2:])})"
    sel = tree([f"between(n,{f0},{f1 - 1})" for f0, f1 in frames])
    # pass 1: the cut take alone, small. In one graph with the panels, ffmpeg queued panel frames in memory while the 4K
    # take decoded and dropped its skips: swap filled the disk and the render was killed at ~15 min (Ep. 11, 2026-11-17).
    take = f"{work}/take-{'preview' if limit else 'full'}.mp4"
    key = json.dumps([cfg["take"], frames, dur])
    if not (os.path.exists(take) and os.path.exists(take + ".key") and open(take + ".key").read() == key):
        subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-stats", "-y", "-i", cfg["take"], "-an",
                        "-vf", f"fps={FPS_N}/{FPS_D},select='{sel}',setpts=N/({FPS_N}/{FPS_D})/TB,scale={VW}:{H}:flags=lanczos,format=yuv420p",
                        "-t", f"{dur:.3f}", "-c:v", "h264_videotoolbox", "-b:v", "12M", "-r", f"{FPS_N}/{FPS_D}", take], check=True)
        open(take + ".key", "w").write(key)
    inputs = ["-i", take, "-i", bg, "-i", wav]
    g = [f"[0:v]setpts=PTS-STARTPTS,format=yuv420p[take]",
         f"[1:v]setpts=PTS-STARTPTS,format=yuv420p[bg]",
         f"[bg][take]overlay={VX}:0:eof_action=endall[v0]"]
    cur, k = "v0", 3
    for (t0, t1, ch, act, panel, label) in sts:
        if not panel or not panel.endswith(".mp4") or t0 >= dur:
            continue
        path = os.path.join(ep, panel)
        fw, fh, x, y = fit(*media_size(path))
        d = min(t1, dur) - t0
        mask = rounded_mask(fw, fh, 22, f"{work}/mask-{fw}x{fh}.png")
        inputs += ["-stream_loop", "-1", "-t", f"{d:.3f}", "-i", path, "-loop", "1", "-t", f"{d:.3f}", "-i", mask]
        g += [f"[{k}:v]fps={FPS_N}/{FPS_D},scale={fw}:{fh},format=yuva420p[r{k}]",
              f"[{k + 1}:v]fps={FPS_N}/{FPS_D},scale={fw}:{fh},format=gray[m{k}]",
              f"[r{k}][m{k}]alphamerge,setpts=PTS-STARTPTS+{t0:.4f}/TB[a{k}]",
              f"[{cur}][a{k}]overlay={x}:{y}:eof_action=pass:enable='between(t,{t0:.4f},{t0 + d:.4f})'[v{k}]"]
        cur, k = f"v{k}", k + 2
    g += [f"[2:a]{af}[aout]"]
    open(f"{work}/graph.txt", "w").write(";\n".join(g))
    cmd = (["ffmpeg", "-hide_banner", "-v", "error", "-stats", "-y"] + inputs +
           ["-/filter_complex", f"{work}/graph.txt", "-map", f"[{cur}]", "-map", "[aout]", "-t", f"{dur:.3f}",
            "-c:v", "h264_videotoolbox", "-b:v", "9M", "-maxrate", "14M", "-bufsize", "18M", "-profile:v", "high",
            "-r", f"{FPS_N}/{FPS_D}", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-movflags", "+faststart", out_mp4])
    subprocess.run(cmd, check=True)


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    from episode import resolve
    ep = resolve(args[0])
    cfg = load(ep)
    nn = cfg["nn"]
    ws = words(ep, cfg["take"])
    frames = cut(cfg, ws)
    out = mapper(frames)
    sts = states(cfg, out, out.total)
    src = (cfg["end"] - cfg["start"]) - sum(b - a for a, b, *_ in cfg["skip"])
    print(f"ep{nn}: {len(frames)} pieces · {fmt(out.total)} of {fmt(src)} kept (pauses cut: {src - out.total:.0f} s) · {len(sts)} panel states")
    dest = f"{ep}/long"
    work = f"{dest}/.work"
    os.makedirs(work, exist_ok=True)
    json.dump({"fps": [FPS_N, FPS_D], "frames": frames, "states": sts}, open(f"{dest}/cut.json", "w"))
    if "--check" in args:
        for t, name in cfg["chapters"]:
            print(f"  {fmt(out(t))}  {name}")
        return
    avatars(ep, cfg, work)
    pngs = render_states(ep, cfg, work, sts)
    if "--stills" in args:
        print(f"ok → {os.path.relpath(work, ROOT)}/states/")
        return
    captions(cfg, ws, frames, out, f"{dest}/ep{nn}-long.srt")
    youtube_text(cfg, out, f"{dest}/ep{nn}-youtube.txt")
    thumbnail(ep, cfg, work, f"{dest}/ep{nn}-thumb.jpg")
    if "--thumb" in args:                                           # only the texts + thumbnail (after a thumb_frame change)
        print(f"ok → {os.path.relpath(dest, ROOT)}/ep{nn}-thumb.jpg")
        return
    limit = float(args[args.index("--preview") + 1]) if "--preview" in args else None
    mp4 = f"{dest}/ep{nn}-long{'-preview' if limit else ''}.mp4"
    render(ep, cfg, frames, sts, pngs, work, mp4, limit)
    print(f"ok → {os.path.relpath(dest, ROOT)}/ ({os.path.basename(mp4)}, srt, thumb, youtube.txt)")


if __name__ == "__main__":
    main()
