#!/usr/bin/env python3
"""covers_fijados: covers for the PINNED row ("Empieza aquí"), the three reels that introduce JP.

    tools/.venv/bin/python tools/covers_fijados.py el-taller/ep00-el-taller

Different from an episode row on purpose (covers2.py): no client, no acts. Each cover is the real frame of JP in
the workshop (not a cut-out), zoomed on him, with a hook from the take and a question bar QUIÉN · QUÉ · CÓMO
(the current one lit). On the profile the bar reads across the row; alone, each cover says which question it answers.

<episode>/cover/cover.json:
{
  "layout": "fijados",
  "kicker": "EL TALLER · EMPIEZA AQUÍ",
  "frames": [43.3, 955.8, 1283.6],          seconds in the take
  "face": [[825, 480], [795, 495], [765, 495]],   face center in each frame (1080x1920), to frame the zoom
  "zoom": 1.45,
  "hooks": [["SOY JORGE.", "CONSTRUYO", "<m>SOFTWARE</m>"], ...],
  "nav": ["¿QUIÉN?", "¿QUÉ?", "¿CÓMO?"]
}
Writes the same files as covers2: epNN-cover-{1,2,3}of3.jpg, epNN-row.jpg, epNN-covers.jpg, epNN-grid-preview.jpg
(the grid preview puts this row on top of the two newest episode rows, like the pinned row will sit).
"""
import glob, json, os, sys
from PIL import Image, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import covers2 as c2
from estilo import E as ESTILO

YELLOW = ESTILO["serie"]["color"]
FACE_Y = 690                                     # where JP's face sits on the cover (the hook goes below him)

CSS = """
@font-face { font-family: SFB; src: url('file:///Library/Fonts/SF-Pro-Display-Black.otf'); }
@font-face { font-family: SFH; src: url('file:///Library/Fonts/SF-Pro-Display-Heavy.otf'); }
@font-face { font-family: SFS; src: url('file:///Library/Fonts/SF-Pro-Display-Semibold.otf'); }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 3240px; height: 1920px; overflow: hidden; background: #000; -webkit-font-smoothing: antialiased; }
.t { position: absolute; top: 0; width: 1080px; height: 1920px; overflow: hidden; }
.ph { position: absolute; inset: 0; width: 1080px; height: 1920px; }
.sh { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.62) 0, rgba(0,0,0,.18) 20%, rgba(0,0,0,0) 34%,
      rgba(0,0,0,.05) 46%, rgba(0,0,0,.72) 60%, rgba(0,0,0,.9) 78%, #000 100%); }
.k { position: absolute; left: 64px; right: 64px; top: 262px; font-family: SFH; font-size: 34px; letter-spacing: .26em; color: Y; text-shadow: 0 2px 14px rgba(0,0,0,.9), 0 0 4px rgba(0,0,0,.8); }
.hl { position: absolute; left: 60px; right: 30px; top: 1010px; font-family: SFB; font-size: 128px; line-height: .94; letter-spacing: -.02em;
      color: #fff; text-shadow: 0 6px 30px rgba(0,0,0,.5); }
.hl > div + div { margin-top: 6px; }
m { background: Y; color: #111; padding: 0 .12em; margin: 0 -.04em; display: inline-block; transform: skewX(-7deg); }
m > span { display: inline-block; transform: skewX(7deg); }
.nav { position: absolute; left: 64px; right: 64px; top: 1560px; display: flex; gap: 16px; }
.nav span { flex: 1; text-align: center; font-family: SFH; font-size: 36px; letter-spacing: .04em; padding: 14px 0 12px;
            border-radius: 99px; border: 3px solid rgba(255,255,255,.28); color: rgba(255,255,255,.5); }
.nav span.now { background: Y; border-color: Y; color: #111; box-shadow: 0 0 34px rgba(255,210,63,.45); }
"""


def photo(mov, t, face, zoom, out, work):
    """The frame at t, zoomed so the face sits at (≈540, FACE_Y), always filling 1080x1920."""
    still = c2.frame(mov, t, f"{work}/t{float(t):.2f}.jpg")
    im = Image.open(still).convert("RGB")
    W, H = int(im.width * zoom), int(im.height * zoom)
    im = im.resize((W, H), Image.LANCZOS)
    ox = min(0, max(1080 - W, 540 - face[0] * zoom))
    oy = min(0, max(1920 - H, FACE_Y - face[1] * zoom))
    canvas = Image.new("RGB", (1080, 1920))
    canvas.paste(im, (int(ox), int(oy)))
    canvas = ImageEnhance.Contrast(ImageEnhance.Color(canvas).enhance(1.08)).enhance(1.05)
    canvas.save(out, quality=95)
    return out


def html(cfg, work):
    tiles = []
    for i in range(3):
        lines = "".join(f"<div>{l.replace('<m>', '<m><span>').replace('</m>', '</span></m>')}</div>" for l in cfg["hooks"][i])
        nav = "".join(f'<span class="{"now" if k == i else ""}">{n}</span>' for k, n in enumerate(cfg["nav"]))
        tiles.append(f"""<div class="t" style="left:{i * 1080}px">
  <img class="ph" src="{work}/ph{i + 1}.jpg"><div class="sh"></div>
  <div class="k">{cfg['kicker']}</div>
  <div class="hl">{lines}</div>
  <div class="nav">{nav}</div>
</div>""")
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS.replace('Y;', YELLOW + ';')}</style></head>" \
           f"<body><div style='position:relative;width:3240px;height:1920px'>{''.join(tiles)}</div></body></html>"


def newest_rows(n=2):
    rows = []
    for k in range(99, 0, -1):
        tiles = [glob.glob(f"{ROOT}/el-taller/ep{k:02d}-*/cover/ep{k:02d}-cover-{i}of3.jpg") for i in (1, 2, 3)]
        if all(tiles):
            rows.append([Image.open(t[0]).convert("RGB") for t in tiles])
        if len(rows) == n:
            break
    return rows


def build(ep, out=None):
    ep = os.path.abspath(ep)
    cfg = json.load(open(f"{ep}/cover/cover.json"))
    nn, out = cfg["ep"], out or f"{ep}/cover"
    work = f"{out}/.work"
    os.makedirs(work, exist_ok=True)
    mov = c2.take(ep, cfg)
    for i, t in enumerate(cfg["frames"]):
        photo(mov, t, cfg["face"][i], cfg.get("zoom", 1.45), f"{work}/ph{i + 1}.jpg", work)
    row = c2.render(html(cfg, work), f"{work}/row.png")
    row.save(f"{out}/ep{nn}-row.jpg", quality=95)
    tiles = [row.crop((k * 1080, 0, (k + 1) * 1080, 1920)) for k in range(3)]
    for k, t in enumerate(tiles):
        t.save(f"{out}/ep{nn}-cover-{k + 1}of3.jpg", quality=95)
    strip = Image.new("RGB", (540 * 3 + 40, 960), (24, 24, 24))
    for k, t in enumerate(tiles):
        strip.paste(t.resize((530, 950), Image.LANCZOS), (10 + k * 550, 5))
    strip.save(f"{out}/ep{nn}-covers.jpg", quality=92)
    c2.grid([tiles] + newest_rows(), f"{out}/ep{nn}-grid-preview.jpg", "@eltallerconjp · fijados arriba, episodios abajo")
    print(f"ok → {os.path.relpath(out, ROOT)}/ep{nn}-cover-{{1,2,3}}of3.jpg · ep{nn}-grid-preview.jpg")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    build(sys.argv[1])
