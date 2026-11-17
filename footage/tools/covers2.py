#!/usr/bin/env python3
"""covers2: El Taller covers v2 ("La fila"), from a per-episode config. Spec: PIPELINE.md §3.

    tools/.venv/bin/python tools/covers2.py el-taller/ep05-slug        (or the episode's make_cover.py)

Reads <episode>/cover/cover.json:
{
  "ep": "05",                                   // → "EL TALLER · EP. 05", file names ep05-*
  "handle": "their.handle",                     // shown as @their.handle
  "pfp": "cover/their-pfp.png",                 // their IG picture, square (the IG ring is added here)
  "accent": "#4EF03E", "accent_ink": "#070B16", // client color for the highlighted word, and its text color
  "take": null,                                 // the raw .MOV (null = the biggest one in the episode's raw/ folder)
  "frames": [1005.6, 387.0, 924.0],             // seconds in the take, one per cover: tools/pick_frames.py helps
  "table_y": 1090,                              // y of the tabletop in the frame: JP is cut from there up (null = no table)
  "nudge": [0, 0, 0],                           // per cover, move JP left (-) / right (+) in px if a gesture crosses the edge
  "hooks": [["MI GIMNASIO", "VIVE EN UN", "<m>EXCEL</m>"], [...], [...]],  // <m>…</m> = the word on the accent color
  "names": ["TU DOMINIO", …],                   // optional: each reel's name at the bottom (default: the acts of a row of 3)
  "marca": "CG Limpiezas",                      // optional: whose chapter it is, on the band ("CAP. 09 · CG LIMPIEZAS"; default: the handle)
  "franja": "el-taller/brand/franja/x.jpg"      // optional: this chapter's own woven band (default: estilo.json portadas.franja)
}
The band (estilo.json portadas.franja, JP 2026-11-13): a photo of a real Mapuche-huilliche weaving, repeated across the whole
row so the three covers read as one chapter and separate it from the next; the middle cover carries "CAP. NN · MARCA".
No band image = no band (the covers stay as before).
N covers = N hooks (1 to 5; a row of 3 before 2026-11-10). Writes to <episode>/cover/: epNN-cover-{k}ofN.jpg (to
upload), epNN-row.jpg, epNN-covers.jpg (side by side), epNN-grid-preview.jpg (the profile after posting them, on top of
earlier episodes, cropped like the grid).
"""
import glob, json, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from estilo import E as ESTILO, rgba, path as estilo_path, TALLER, fuente
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BG = estilo_path(ESTILO["portadas"]["fondo"])          # el-taller/estilo.json
YELLOW = ESTILO["serie"]["color"]
ACTS = [(a["n"], a["nombre"]) for a in ESTILO["actos"]]
GRID_TOP, GRID_BOT = 240, 1680                       # what the profile grid shows of a 1080x1920 cover (3:4)

CSS = """
@font-face { font-family: SFB; src: url('file://FONT_Black'); }
@font-face { font-family: SFH; src: url('file://FONT_Heavy'); }
@font-face { font-family: SFS; src: url('file://FONT_Semibold'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ROWWpx; height: 1920px; overflow: hidden; background: #000; -webkit-font-smoothing: antialiased; }
.kicker { font-family: SFS; font-size: 30px; letter-spacing: .32em; color: YELLOW; }
.chip { display: inline-flex; align-items: center; gap: 14px; font-family: SFS; font-size: 36px; color: #fff; }
.pfp-img { width: 78px; height: 78px; display: block; }
.act { display: flex; align-items: center; gap: 22px; font-family: SFS; font-size: 34px; letter-spacing: .26em; color: #fff; }
.act b { font-family: SFH; letter-spacing: .02em; color: YELLOW; border: 3px solid YELLOW; border-radius: 99px; padding: 4px 22px; font-size: 34px; }
m { background: ACCENT; color: INK; padding: 0 .12em; margin: 0 -.04em; display: inline-block; transform: skewX(-7deg); }
m > span { display: inline-block; transform: skewX(7deg); }
.row { position: relative; width: ROWWpx; height: 1920px; overflow: hidden; }
.bg { position: absolute; inset: 0; background: url('BGURL') center 40%/cover; filter: blur(4px) brightness(.5) saturate(.85); transform: scale(1.03); }
.sh { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.55) 0, rgba(0,0,0,.1) 30%, rgba(0,0,0,.1) 55%, rgba(0,0,0,.9) 85%, #000 100%); }
.t { position: absolute; top: 0; width: 1080px; height: 1920px; overflow: hidden; }   /* each JP stays in his own cover */
.jp { position: absolute; left: 50%; bottom: 300px; height: 860px; -webkit-mask-image: linear-gradient(180deg, #000 82%, transparent 100%); }
.k { position: absolute; left: 64px; right: 64px; top: 268px; display: flex; justify-content: space-between; align-items: center; }
.hl { position: absolute; left: 60px; right: 30px; top: 360px; font-family: SFB; font-size: 128px; line-height: .94; letter-spacing: -.02em; color: #fff;
  text-shadow: 0 6px 30px rgba(0,0,0,.45); }
.hl > div + div { margin-top: 6px; }
.ac { position: absolute; left: 64px; right: 64px; top: 1522px; display: flex; align-items: center; justify-content: space-between; }
.sigue { font-family: SFS; font-size: 28px; letter-spacing: .24em; color: rgba(255,255,255,.6); }
/* progress: N segments on every cover, filled up to this one: ■□□ ■■□ ■■■ */
.prog { position: absolute; left: 64px; right: 64px; top: 1606px; display: flex; gap: 14px; }
.prog i { flex: 1; height: 16px; border-radius: 8px; background: rgba(255,255,255,.2); }
.prog i.done { background: YELLOW; }
.prog i.now { background: YELLOW; box-shadow: 0 0 0 5px GLOW22, 0 0 34px GLOW55; }
"""

# The band: one weaving across the whole row, at the top of what the profile grid shows (GRID_TOP); the header and the hook
# move down by its height.
CSS_FRANJA = """
.franja { position: absolute; left: 0; top: __FTOP__px; width: __ROWW__px; height: __FH__px; background: url('__FURL__') left center/auto 100% repeat-x;
  box-shadow: 0 4px 0 rgba(0,0,0,.55), 0 -4px 0 rgba(0,0,0,.55); }
.cap { position: absolute; left: 50%; top: __FMID__px; transform: translate(-50%, -50%); white-space: nowrap; padding: 12px 30px;
  background: #0c0b0a; border: 4px solid __Y__; border-radius: 16px; font-family: SFH; font-size: 46px; letter-spacing: .1em; color: __Y__; }
.k { top: __KTOP__px; } .hl { top: __HTOP__px; }
"""


# The weekend row (cover.json "finde": true, estilo.json portadas.finde; JP 2026-11-14: "it should be *felt* that they
# are for the weekend", then "just put the text on them without those infographics of the bottom"): a flat yellow page
# with the kicker and the hook in ink. No photo, no cutout, no act label, no progress bars.
CSS_FINDE = """
.bg { background: __FONDO__; filter: none; transform: none; }
.sh, .jp, .ac, .prog, .chip { display: none; }
.kicker { color: __TINTA__; font-size: 34px; }
.hl { top: 960px; transform: translateY(-50%); font-size: 122px; color: __TINTA__; text-shadow: none; }
m { background: __TINTA__; color: __FONDO__; }
"""


def load(ep):
    cfg = json.load(open(f"{ep}/cover/cover.json"))
    cfg.setdefault("accent_ink", "#070B16")
    cfg.setdefault("table_y", None)
    n = len(cfg["hooks"])
    cfg["nudge"] = (cfg.get("nudge") or [])[:n] + [0] * max(0, n - len(cfg.get("nudge") or []))
    assert 1 <= n <= 5 and len(cfg["frames"]) == n, f"cover.json: {n} hooks need {n} frames (has {len(cfg['frames'])})"
    return cfg


def labels(cfg):
    """[(tag, name)] per cover: "2/4" + the reel's name; a classic row of 3 without names keeps its acts."""
    n = len(cfg["hooks"])
    if not cfg.get("names") and n == 3:
        return ACTS
    names = cfg.get("names") or [""] * n
    return [(f"{k}/{n}", names[k - 1]) for k in range(1, n + 1)]


def take(ep, cfg):
    if cfg.get("take"):
        return cfg["take"] if os.path.isabs(cfg["take"]) else os.path.join(ROOT, cfg["take"])
    from ingest import raw_dir, VIDEO
    movs = [f for pat in VIDEO for f in glob.glob(f"{raw_dir(ep)}/{pat}")]
    if not movs:
        raise SystemExit("cover.json: no \"take\" and no .MOV in the episode's raw/ folder")
    return max(movs, key=os.path.getsize)


def frame(mov, t, out):
    if not os.path.exists(out):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", mov, "-frames:v", "1", "-q:v", "2", out], check=True)
    return out


def jp_cutout(still, table_y, out):
    """JP from the photo (Apple Vision person mask), from the tabletop up."""
    import covers                                       # its _mask() builds and caches <still>.mask.png
    m = covers._mask(still).filter(ImageFilter.GaussianBlur(1.2))
    im = Image.open(still).convert("RGBA"); im.putalpha(m)
    x0, y0, x1, y1 = m.point(lambda v: 255 if v > 40 else 0).getbbox()
    im.crop((x0, y0, x1, table_y or y1)).save(out)
    return out


def avatar(pfp, out):
    import covers
    covers.avatar(pfp, 240, ring=12).save(out)
    return out


def html(cfg, work):
    def mark(line):
        return line.replace("<m>", "<m><span>").replace("</m>", "</span></m>")
    f = franja(cfg)
    chip = f'<span class="chip"><img class="pfp-img" src="{work}/avatar.png">@{cfg["handle"]}</span>'
    tiles = []
    N = len(cfg["hooks"])
    fila = cfg.get("fila", not cfg.get("names") and N == 3)   # the old row: "SIGUE ›" pointed to the next tile
    kicker = (ESTILO["portadas"].get("finde", {}).get("kicker", "EL TALLER · FIN DE SEMANA") if cfg.get("finde")
              else ESTILO["portadas"]["kicker"].format(ep=cfg["ep"]))
    for i in range(N):
        n, name = labels(cfg)[i]
        lines = "".join(f"<div>{mark(l)}</div>" for l in cfg["hooks"][i])
        prog = "".join(f'<i class="{"done" if k < i else "now" if k == i else ""}"></i>' for k in range(N))
        tiles.append(f"""<div class="t" style="left:{i * 1080}px">
  <img class="jp" src="{work}/jp{i + 1}.png" style="transform: translateX(calc(-46% + {cfg['nudge'][i]}px))">
  <div class="k"><span class="kicker">{kicker}</span>{chip if (cfg.get('chips') or [True] * N)[i] else ''}</div>
  <div class="hl">{lines}</div>
  <div class="ac"><div class="act"><b>{n}</b>{name}</div>{'<span class="sigue">SIGUE ›</span>' if fila and i < 2 else ''}</div>
  <div class="prog">{prog}</div>
  {f'<div class="cap">CAP. {cfg["ep"]} · {(cfg.get("marca") or cfg["handle"]).upper()}</div>' if f and i == N // 2 else ''}
</div>""")
    r, g, b, _ = rgba(YELLOW)
    css = (CSS.replace("GLOW22", f"rgba({r},{g},{b},.22)").replace("GLOW55", f"rgba({r},{g},{b},.55)").replace("YELLOW", YELLOW).replace("ACCENT", cfg["accent"]).replace("INK", cfg["accent_ink"])
           .replace("BGURL", f"file://{BG}").replace("ROWW", str(1080 * N)).replace("FONT_Black", fuente("Black")).replace("FONT_Heavy", fuente("Heavy"))
           .replace("FONT_Semibold", fuente("Semibold")))
    if f:
        fh = int(f.get("alto") or 120)
        band_css = CSS_FRANJA
        for k, v in {"FTOP": GRID_TOP, "FH": fh, "FMID": GRID_TOP + fh // 2, "FURL": f"file://{f['imagen']}", "KTOP": 268 + fh + 24,
                     "HTOP": 360 + fh + 24, "ROWW": 1080 * N, "Y": YELLOW}.items():
            band_css = band_css.replace(f"__{k}__", str(v))
        css += band_css
    if cfg.get("finde"):
        fin = ESTILO["portadas"].get("finde", {})
        css += CSS_FINDE.replace("__FONDO__", fin.get("fondo", YELLOW)).replace("__TINTA__", fin.get("tinta", "#14110f"))
    band ="<div class='franja'></div>" if f else ""
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body><div class='row'>" \
           f"<div class='bg'></div><div class='sh'></div>{band}{''.join(tiles)}</div></body></html>"


def franja(cfg):
    """The band for this chapter: its own weaving (cover.json "franja") or the series' (estilo.json portadas.franja), or None."""
    base = dict(ESTILO["portadas"].get("franja") or {})
    img = cfg.get("franja") or base.get("imagen")
    if not img:
        return None
    img = estilo_path(img)
    if not os.path.exists(img):
        raise SystemExit(f"franja: no encuentro {img}")
    return dict(base, imagen=img)


def render(page, out, w=3240, h=1920):
    src = out.rsplit(".", 1)[0] + ".html"
    open(src, "w").write(page)
    with tempfile.TemporaryDirectory() as prof:          # own profile: sharing the everyday one fails now and then
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
    return Image.open(out).convert("RGB")


def feed_order(ep, nn):
    """An earlier episode's covers as the profile shows them (newest first): publish.json is posting order."""
    d = glob.glob(f"{TALLER}/ep{nn}-*")
    if not d:
        return []
    pub = f"{d[0]}/publish.json"
    if os.path.exists(pub):
        covs = [os.path.join(d[0], it["cover"]) for it in json.load(open(pub)) if it.get("cover")]
        return [c for c in reversed(covs) if os.path.exists(c)]
    return sorted(glob.glob(f"{d[0]}/cover/ep{nn}-cover-*of*.jpg"))


def previous_tiles(nn, n=6):
    tiles = []
    for k in range(int(nn) - 1, 0, -1):
        tiles += [Image.open(p).convert("RGB") for p in feed_order(None, f"{k:02d}")]
        if len(tiles) >= n:
            break
    return tiles[:n]


def grid(tiles, out, label, cols=3):
    tw, th, gap, head = 360, 480, 4, 92
    rows = (len(tiles) + cols - 1) // cols
    im = Image.new("RGB", (tw * cols + gap * (cols - 1), head + (th + gap) * rows - gap), "white")
    ImageDraw.Draw(im).text((20, 28), label, fill=(20, 20, 20), font=ImageFont.truetype(fuente("Semibold"), 30))
    for i, t in enumerate(tiles):
        r, c = divmod(i, cols)
        im.paste(t.crop((0, GRID_TOP, 1080, GRID_BOT)).resize((tw, th), Image.LANCZOS), (c * (tw + gap), head + r * (th + gap)))
    im.save(out, quality=92)


def build(ep, out=None):
    """out: write somewhere else than <ep>/cover (episode.py muestra uses it to try a style without touching the covers)."""
    ep = os.path.abspath(ep)
    if json.load(open(f"{ep}/cover/cover.json")).get("layout") == "fijados":   # the pinned row: its own generator
        import covers_fijados
        return covers_fijados.build(ep, out)
    cfg = load(ep)
    nn = cfg["ep"]
    covers_dir = f"{ep}/cover"
    out = out or covers_dir
    work = f"{out}/.work"
    os.makedirs(work, exist_ok=True)
    stills = [f"{covers_dir}/frames/t{float(t):.2f}.jpg" if os.path.isdir(f"{covers_dir}/frames") else f"{work}/t{float(t):.2f}.jpg"
              for t in cfg["frames"]]
    mov = take(ep, cfg) if not all(os.path.exists(p) for p in stills) else None   # saved stills: no take needed
    for i, (t, p) in enumerate(zip(cfg["frames"], stills)):
        still = frame(mov, t, p)
        jp_cutout(still, cfg["table_y"], f"{work}/jp{i + 1}.png")
    pfp = cfg["pfp"] if os.path.isabs(cfg["pfp"]) else os.path.join(ep, cfg["pfp"])
    avatar(pfp, f"{work}/avatar.png")
    N = len(cfg["hooks"])
    row = render(html(cfg, work), f"{work}/row.png", w=1080 * N)
    row.save(f"{out}/ep{nn}-row.jpg", quality=95)
    tiles = [row.crop((k * 1080, 0, (k + 1) * 1080, 1920)) for k in range(N)]
    for old in glob.glob(f"{out}/ep{nn}-cover-*of*.jpg"):           # a re-plan can change N
        os.remove(old)
    for k, t in enumerate(tiles):
        t.save(f"{out}/ep{nn}-cover-{k + 1}of{N}.jpg", quality=95)
    strip = Image.new("RGB", (540 * N + 40, 960), (24, 24, 24))
    for k, t in enumerate(tiles):
        strip.paste(t.resize((530, 950), Image.LANCZOS), (10 + k * 550, 5))
    strip.save(f"{out}/ep{nn}-covers.jpg", quality=92)
    fila = cfg.get("fila", not cfg.get("names") and N == 3)     # a row of 3 went out 3/3 → 1/3: 1/3 on the left
    nuevos = tiles if fila else list(reversed(tiles))           # one a day, in order: the last one ends up first
    grid(nuevos + previous_tiles(nn), f"{out}/ep{nn}-grid-preview.jpg",
         f"{ESTILO['serie']['nombre'].title()} · Ep. {nn} · @{cfg['handle']}")
    print(f"ok → {os.path.relpath(out, ROOT)}/ep{nn}-cover-{{1..{N}}}of{N}.jpg · ep{nn}-grid-preview.jpg")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    build(sys.argv[1])
