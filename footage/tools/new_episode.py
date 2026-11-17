#!/usr/bin/env python3
"""Start a new El Taller episode: creates the episode folder + its raw/ folder (PIPELINE.md stage 1).

usage: tools/.venv/bin/python tools/new_episode.py 05 la-tienda "La Tienda" [--prototype-from ep04-endemico]

Creates el-taller/ep05-la-tienda/ with README (the 3 acts + the to-do), cover/cover.json (covers v2),
make_cover.py, and empty folders; and raw/<today>_el-taller-ep05_la-tienda/ for the footage.
--prototype-from copies that episode's prototype/ as a starting point (code only: no node_modules, no local
database, no secrets, no client photos) and renames the Worker, the database and the subdomain to the new slug.

After recording: AirDrop the .MOV into the episode folder or its raw folder, then
  tools/.venv/bin/python tools/ingest.py el-taller/ep05-la-tienda
"""
import datetime, os, re, shutil, sys, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from estilo import TALLER as EPS, RAW                 # el-taller/ + footage/raw for JP; TALLER_DIR=… for an owner

README = """# Ep. {nn} · {name}

- **Business:** who they are, where, what they sell, IG handle, website.
- **Proposal in one line:** "aquí estoy, esto propongo": the one thing we'd build.
- **Raw:** `../../raw/{rawdir}/`
- **Prototype:** `prototype/`: the code for the proposal (what 3/3 shows working). Live: https://{slug}.jpfraneto.com

## The 3 acts (write BEFORE recording: one long take, loosely in this order)

| Act | What to say | What to show |
|---|---|---|
| **1/3 El caso** | | their IG grid / website / place |
| **2/3 El nudo** | | screenshot of the friction |
| **3/3 La propuesta** | | the prototype running on a phone |

Check earlier episodes for repeated ideas (see ../NARRATIVE.md). "IA" when it helps people understand, never abused.

## Private, never in a reel
-

## To do (stages: ../../PIPELINE.md · one command: `tools/.venv/bin/python tools/episode.py ep{nn}-{slug}` from footage/)
- [ ] Demo night: business + the 3 acts above · their IG picture → `cover/pfp.png` · handle + brand color → `cover/cover.json`
- [ ] Assets the reels can show → `assets/`: IG/website screenshots (png), prototype screen recordings (`assets/rec/*.mp4`, + `.json` events if scripted)
- [ ] Prototype → `prototype/` · deploy · real data only (theirs + legal public data; nothing invented)
- [ ] Record (one take) → AirDrop the .MOV into this folder
- [ ] `episode.py ep{nn}-{slug}` → ingest, frames, plan (Claude), drafts, covers → stops at **review**
- [ ] Review on the phone: `episode.py ep{nn}-{slug} review` → "Enviar cambios" (re-plans) or "Aprobar" (finals)
- [ ] Show the business privately → `episode.py ep{nn}-{slug} publish`
"""

COVER = '''#!/usr/bin/env python3
"""Ep. {nn} {name}: the 3 reel covers (covers v2, "La fila") from cover/cover.json → cover/. Spec: ../../PIPELINE.md §3.

usage: ../../tools/.venv/bin/python make_cover.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
import covers2

if __name__ == "__main__":
    covers2.build(HERE)
'''

COVER_JSON = """{{
  "ep": "{nn}",
  "handle": "their.handle",
  "pfp": "cover/pfp.png",
  "accent": "#FFD23F",
  "accent_ink": "#111111",
  "take": null,
  "frames": [0, 0, 0],
  "table_y": 1090,
  "nudge": [0, 0, 0],
  "hooks": [
    ["HOOK 1/3", "EN TRES", "<m>LÍNEAS</m>"],
    ["HOOK 2/3", "<m>LA FRICCIÓN</m>", "EN CORTO."],
    ["HOOK 3/3", "LO QUE", "<m>CONSTRUÍ</m>"]
  ]
}}
"""

SKIP = {"node_modules", ".wrangler", ".dev.vars", ".seed.sql", "fotos", "video"}


def copy_prototype(src_ep, ep, slug):
    src = f"{EPS}/{src_ep}/prototype"
    dst = f"{ep}/prototype"
    if os.listdir(dst):
        print("prototype/ ya tiene archivos: no copio nada")
        return
    shutil.copytree(src, dst, dirs_exist_ok=True, ignore=lambda d, names: [n for n in names if n in SKIP])
    conf = open(f"{dst}/wrangler.jsonc").read()
    m = re.search(r'"database_name":\s*"([^"]+)"', conf)                    # D1 prototypes (Ep. 04, 07)
    old = m.group(1) if m else re.search(r'"pattern":\s*"([^".]+)\.jpfraneto\.com"', conf).group(1)  # KV ones (Ep. 06)
    conf = re.sub(r'"kv_namespaces":\s*\[[^\]]*\]', '"kv_namespaces": [{ "binding": "CREATE-ME", "id": "npx wrangler kv namespace create ' + slug + '" }]', conf)
    open(f"{dst}/wrangler.jsonc", "w").write(conf)
    for f in ("wrangler.jsonc", "package.json"):
        p = f"{dst}/{f}"
        s = open(p).read().replace(f"{old}.jpfraneto.com", f"{slug}.jpfraneto.com").replace(f'"{old}-app"', f'"{slug}-app"')
        s = s.replace(old, slug)                                                       # db name, door key, comments
        s = re.sub(r'"database_id":\s*"[^"]*"', '"database_id": "CREATE-ME: npx wrangler d1 create ' + slug + '"', s)
        s = re.sub(r'"(COACH_PHONES|GYM_WA)":\s*"[^"]*"', r'"\1": ""', s)
        open(p, "w").write(s)
    print(f"prototype/ copiado desde {src_ep}: Worker {slug}-app · https://{slug}.jpfraneto.com")
    print("  → falta: crear la base (D1 o KV, ver wrangler.jsonc) y pegar su id, adaptar src/worker.js y public/, npm install")


def main():
    src_ep = sys.argv[sys.argv.index("--prototype-from") + 1] if "--prototype-from" in sys.argv else None
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a != src_ep]
    if len(args) != 3:
        raise SystemExit(__doc__)
    nn, slug, name = args[0].zfill(2), args[1], args[2]
    today = datetime.date.today().isoformat()
    ep = f"{EPS}/ep{nn}-{slug}"
    existing = sorted(glob.glob(f"{RAW}/*_el-taller-ep{nn}_{slug}"))
    rawdir = os.path.basename(existing[-1]) if existing else f"{today}_el-taller-ep{nn}_{slug}"
    os.makedirs(f"{RAW}/{rawdir}", exist_ok=True)
    for d in ("transcript", "assets", "reels", "cover", "prototype", "proxy"):
        os.makedirs(f"{ep}/{d}", exist_ok=True)
    files = {"README.md": README.format(nn=nn, name=name, rawdir=rawdir, slug=slug),
             "make_cover.py": COVER.format(nn=nn, name=name),
             "cover/cover.json": COVER_JSON.format(nn=nn)}
    for rel, text in files.items():
        if not os.path.exists(f"{ep}/{rel}"):
            open(f"{ep}/{rel}", "w").write(text)
    if src_ep:
        copy_prototype(src_ep, ep, slug)
    # camera files dropped straight into the episode folder → raw/
    for f in glob.glob(f"{ep}/*.[mM][oO][vV]") + glob.glob(f"{ep}/*.[mM][pP]4"):
        shutil.move(f, f"{RAW}/{rawdir}/")
        print("moved", os.path.basename(f), "→ raw/" + rawdir)
    print("episode:", ep)
    print("footage:", f"{RAW}/{rawdir}")


if __name__ == "__main__":
    main()
