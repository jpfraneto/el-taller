#!/usr/bin/env python3
"""historial: jpfraneto.com = the list of every episode (os/web/public/episodios/, served by the el-taller worker; the
jpfraneto-resume worker shows it at jpfraneto.com/ and /reporte/<handle>/).

Each row: the brand's IG picture + handle, its sector, the episode's 3 chapters on @eltallerconjp (the reels), its
Reconócete report (one page, jpfraneto.com/reporte/<handle>/) and the prototype on <slug>.jpfraneto.com. Below everything,
a fixed button to the paywall. New episode = one more entry in EPISODIOS, then:

  uv run --with markdown --with pillow python footage/el-taller/historial.py
  cd os/web && npx wrangler deploy

The report is the newest el-taller/reconocer/<handle>/<fecha>/reporte.md (tools/reconocer.py <handle>); the picture is
that capture's foto.jpg, or the episode's own pfp when there is no capture. The chapters come from the Instagram API
(tools/publish_ig.py's credentials): the -01/-02/-03 reels in each episode's publish-log.json, or, for episodes posted by
hand, the posts that mention the brand. Last good answer cached in historial-reels.json, so it builds offline too.
"""
import datetime, glob, html, json, os, re, sys, urllib.parse, urllib.request
import markdown
from PIL import Image

TALLER = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(TALLER, "..", "..", "os", "web", "public", "episodios"))
SITIO = "https://jpfraneto.com"
ARCHIVOS = "https://eltallerconjp.jpfraneto.com"   # where the files live (jpfraneto.com only shows the pages)
RECONOCER = os.path.join(TALLER, "reconocer")
CACHE = os.path.join(TALLER, "historial-reels.json")

# n, handle (None = no Instagram), name shown when there's no handle, sector, prototype on jpfraneto.com as
# "<subdomain>[/path]" (None = no prototype), fallback picture. The link always opens the product itself, the thing the
# brand's customers would use (JP, 2026-11-15), never a pitch page (/propuesta/, an IG "rediseño").
EPISODIOS = [
    (10, "campoymar_chiloe", None, "Alimentos · pastelería sin azúcar", "campoymar", "ep10-campoymar/cover/pfp.jpg"),
    (9, "cglimpiezas", None, "Servicios del hogar · limpieza de alfombras y tapices", "cglimpiezas/cotiza/", "ep09-cglimpiezas/cover/pfp.png"),
    (8, None, "parcelasyterrenos.cl", "Inmobiliaria · marketplace de parcelas sin comisión", "parcelasyterrenos", "ep08-parcelasyterrenos/cover/pfp.png"),
    (7, "arboldelilith", None, "Bienestar · círculos de mujeres y terapias", "arboldelilith", "ep07-arboldelilith/cover/pfp.png"),
    (6, "automotriztuauto.cl", None, "Automotriz · autos seminuevos", "tuauto", "ep06-tuauto/cover/pfp.png"),
    (5, "refugiosumbralsur", None, "Construcción · refugios modulares", "umbralsur", "ep05-umbral-sur/cover/pfp.png"),
    (4, "endemico.ft", None, "Deporte y salud · entrenamiento funcional", "endemico", "ep04-endemico/cover/endemico-pfp.png"),
    (3, "lajuntaescalada", None, "Deporte · gimnasio de escalada", "lajunta", "ep03-la-junta/assets/raw/ig-pfp.png"),
    (2, "constructora_aubel", None, "Construcción · casas llave en mano", "aubel", "ep02-aubel/assets/raw/ig-pfp.png"),
    # Ep. 01 · El Galpón: out for now (JP, 2026-11-13). Careful: @elgalpon on IG is a clothing store in Argentina, not this one.
]


def ultima(handle):
    """The newest Reconócete capture of a handle → its folder, or None."""
    if not handle:
        return None
    caps = sorted(glob.glob(f"{RECONOCER}/{handle}/*/reporte.md"))
    return os.path.dirname(caps[-1]) if caps else None


def foto(n, cap, fallback):
    """The brand's picture, square 160 px, into episodios/pfp/ → its URL, or None."""
    src = f"{cap}/foto.jpg" if cap and os.path.exists(f"{cap}/foto.jpg") else (fallback and os.path.join(TALLER, fallback))
    if not src or not os.path.exists(src):
        return None
    os.makedirs(f"{OUT}/pfp", exist_ok=True)
    im = Image.open(src).convert("RGB")
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((160, 160), Image.LANCZOS)
    im.save(f"{OUT}/pfp/{n:02d}.jpg", quality=86)
    return f"{ARCHIVOS}/episodios/pfp/{n:02d}.jpg"


def capitulos():
    """{episode n: [(permalink, thumbnail url), …] in order 1/3, 2/3, 3/3}, from @eltallerconjp's posts."""
    try:
        sys.path.insert(0, os.path.join(TALLER, "..", "tools"))
        import publish_ig
        cfg = publish_ig.load_env()
        url = f"{publish_ig.host(cfg)}/{cfg['IG_API_VERSION']}/{cfg['IG_USER_ID']}/media?" + urllib.parse.urlencode(
            {"fields": "timestamp,caption,thumbnail_url,media_url,permalink", "limit": 100, "access_token": cfg["IG_ACCESS_TOKEN"]})
        posts = []
        while url:
            d = json.load(urllib.request.urlopen(url, timeout=30))
            posts += d["data"]
            url = d.get("paging", {}).get("next")
    except (Exception, SystemExit) as e:
        print(f"Instagram API unavailable ({e}); using {os.path.basename(CACHE)}")
        return {int(k): v for k, v in json.load(open(CACHE)).items()}
    logs = {}                                         # shortcode → (episode n, chapter)
    for f in glob.glob(f"{TALLER}/ep*/publish-log.json"):
        n = int(re.match(r"ep(\d+)", os.path.basename(os.path.dirname(f)))[1])
        for nombre, x in json.load(open(f)).items():
            m = re.search(r"-0([123])-", nombre)
            if isinstance(x, dict) and x.get("permalink"):
                logs[x["permalink"].rstrip("/").split("/")[-1]] = (n, int(m[1]) if m else None)
    caps = {}
    sueltos = {}                                      # posts without a log, by the brand they mention
    for p in posts:
        code = p["permalink"].rstrip("/").split("/")[-1]
        tile = (p["permalink"], p.get("thumbnail_url") or p.get("media_url"))
        if code in logs:
            n, cap = logs[code]
            if cap:
                caps.setdefault(n, {})[cap] = tile
        else:
            for n, handle, *_ in EPISODIOS:
                if handle and f"@{handle}" in (p.get("caption") or ""):
                    sueltos.setdefault(n, []).append((p["timestamp"], tile))
    for n, lista in sueltos.items():
        if n not in caps:                             # posted 3/3 first, so the newest is 1/3
            lista.sort(reverse=True)
            caps[n] = {i + 1: t for i, (_, t) in enumerate(lista[:3])}
    out = {n: [c[i] for i in sorted(c)] for n, c in caps.items()}
    json.dump(out, open(CACHE, "w"), indent=1)
    return out


def portadas(n, tiles):
    """The chapters' covers, 3:4 like the IG grid, into episodios/reels/ → [(permalink, image url), …]."""
    os.makedirs(f"{OUT}/reels", exist_ok=True)
    out = []
    for i, (link, thumb) in enumerate(tiles, 1):
        dest = f"{OUT}/reels/{n:02d}-{i}.jpg"
        if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(CACHE):
            try:
                im = Image.open(urllib.request.urlopen(thumb, timeout=30)).convert("RGB")
                w, h = im.size
                ch = min(h, round(w * 4 / 3))
                im.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch)).resize((360, 480), Image.LANCZOS).save(dest, quality=82)
            except Exception as e:
                if not os.path.exists(dest):
                    print(f"  no cover for {link}: {e}")
                    continue
        out.append((link, f"{ARCHIVOS}/episodios/reels/{n:02d}-{i}.jpg?v={int(os.path.getmtime(dest))}"))
    return out


HEAD = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="El Taller con JP">
<meta property="og:locale" content="es_CL">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="theme-color" content="#14110f">
<link rel="icon" href="{archivos}/episodios/icono.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700;900&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root {{ --bg: #14110f; --fg: #f4efe6; --mute: rgba(244,239,230,.62); --dim: rgba(244,239,230,.38); --y: #ffd23f; --line: rgba(255,255,255,.12);
    --head: "Inter Tight", "Inter", system-ui, sans-serif; --sans: "Inter", system-ui, -apple-system, sans-serif; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); -webkit-font-smoothing: antialiased; }}
  a {{ color: inherit; text-decoration: none; }}
  main {{ max-width: 620px; margin: 0 auto; padding: 18px 16px 40px; }}
  .marca {{ font-family: var(--head); font-weight: 900; font-size: 13px; letter-spacing: .16em; text-transform: uppercase; }}
  .pfp {{ width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #2a2622; display: block; }}
  .pfp.vacia {{ display: grid; place-items: center; font-family: var(--head); font-weight: 900; color: var(--dim); }}
  .btn {{ display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; padding: 7px 12px;
    border: 1px solid var(--line); border-radius: 999px; white-space: nowrap; }}
  .btn:hover {{ border-color: rgba(255,210,63,.6); color: var(--y); }}
  .btn.y {{ background: var(--y); color: var(--bg); border-color: var(--y); }}
  .btn.y:hover {{ color: var(--bg); filter: brightness(1.06); }}
  .btn.off {{ color: var(--dim); border-style: dashed; pointer-events: none; }}
{css}
</style>
</head>
<body>
<main>
"""

CSS_LISTA = """  main { padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 22px; }
  header p { margin: 0; font-size: 13px; color: var(--dim); }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: 22px 48px minmax(0, 1fr); column-gap: 12px; row-gap: 12px; align-items: center;
    padding: 18px 0; border-top: 1px solid var(--line); }
  li:last-child { border-bottom: 1px solid var(--line); }
  .caps { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; border-radius: 10px; overflow: hidden; }
  .caps a { display: block; aspect-ratio: 3 / 4; background: #2a2622; }
  .caps img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .caps a:hover img { opacity: .85; }
  .n { font-family: var(--head); font-weight: 700; font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
  .quien { min-width: 0; }
  .quien b { display: block; font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quien b a:hover { color: var(--y); }
  .quien span { display: block; font-size: 13px; color: var(--mute); margin-top: 2px; }
  .links { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
  .cta { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; padding: 28px 16px calc(14px + env(safe-area-inset-bottom));
    background: linear-gradient(to bottom, rgba(20,17,15,0), var(--bg) 42%); }
  .cta a { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 588px; min-height: 68px;
    margin: 0 auto; padding: 10px 20px; border-radius: 18px; background: var(--y); color: var(--bg);
    box-shadow: 0 10px 34px rgba(255,210,63,.24); transition: transform .12s ease; }
  .cta a:active { transform: scale(.98); }
  .cta b { font-family: var(--head); font-weight: 900; font-size: 21px; letter-spacing: -.01em; text-transform: uppercase; line-height: 1.05; }
  .cta span { font-size: 13px; font-weight: 600; opacity: .72; margin-top: 3px; }
"""

CSS_REPORTE = """  nav { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 26px; }
  nav a.volver { font-size: 13px; color: var(--mute); }
  nav a.volver:hover { color: var(--fg); }
  .quien { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 8px; }
  .quien .pfp { width: 64px; height: 64px; }
  .quien b { display: block; font-family: var(--head); font-weight: 900; font-size: 22px; overflow-wrap: anywhere; }
  .quien span { display: block; font-size: 13px; color: var(--mute); margin-top: 2px; }
  article { font-size: 16px; line-height: 1.55; color: rgba(244,239,230,.86); }
  article h1 { font-family: var(--head); font-weight: 900; font-size: 13px; letter-spacing: .2em; text-transform: uppercase; color: var(--y); margin: 22px 0 6px; }
  article h2 { font-family: var(--head); font-weight: 900; font-size: 20px; margin: 30px 0 8px; color: var(--fg); }
  article p { margin: 10px 0; }
  article em { color: var(--dim); font-style: normal; font-size: 13px; }
  article strong { color: var(--fg); font-weight: 600; }
  article ul, article ol { padding-left: 20px; margin: 10px 0; }
  article li { margin: 7px 0; }
  article li::marker { color: var(--y); }
  .fin { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--line); }
"""

FOOT = "</main>\n</body>\n</html>\n"


def pfp_tag(url, alt):
    return f'<img class="pfp" src="{url}" alt="{html.escape(alt)}" loading="lazy">' if url else '<span class="pfp vacia">·</span>'


def reporte(handle, cap, sector, pfp, proto_url):
    md = open(f"{cap}/reporte.md").read()
    md = re.sub(r"^# .*\n", "", md, count=1)          # the title becomes the header with the picture
    cuerpo = markdown.markdown(md)
    proto = (f'<a class="btn y" href="{proto_url}">Ver el prototipo →</a>' if proto_url else "")
    page = HEAD.format(title=f"Reconócete · @{handle}", desc=f"Lo que @{handle} tiene público hoy, en una página.", css=CSS_REPORTE, archivos=ARCHIVOS)
    page += f"""  <nav><a class="marca" href="{SITIO}/">El Taller con JP</a><a class="volver" href="{SITIO}/">← todos los episodios</a></nav>
  <div class="quien">{pfp_tag(pfp, handle)}<div><b><a href="https://instagram.com/{handle}" target="_blank" rel="noopener">@{handle}</a></b><span>{html.escape(sector)}</span></div></div>
  <article>
    <h1>Reconócete</h1>
{cuerpo}
  </article>
  <div class="fin">{proto}<a class="btn" href="{SITIO}/">Todos los episodios</a></div>
"""
    os.makedirs(f"{OUT}/reporte/{handle}", exist_ok=True)
    open(f"{OUT}/reporte/{handle}/index.html", "w").write(page + FOOT)


def main():
    filas = []
    reels = capitulos()
    for n, handle, nombre, sector, slug, fallback in EPISODIOS:
        cap = ultima(handle)
        pfp = foto(n, cap, fallback)
        sub, _, ruta = (slug or "").partition("/")
        proto_url = f"https://{sub}.jpfraneto.com/{ruta}" if slug else None
        if cap:
            reporte(handle, cap, sector, pfp, proto_url)
        quien = (f'<a href="https://instagram.com/{handle}" target="_blank" rel="noopener">@{handle}</a>' if handle
                 else html.escape(nombre))
        links = (f'<a class="btn" href="{SITIO}/reporte/{handle}/">Reporte</a>' if cap
                 else '<span class="btn off">Reporte</span>')
        links += (f'<a class="btn y" href="{proto_url}">Prototipo →</a>' if proto_url
                  else '<span class="btn off">Prototipo</span>')
        tiles = portadas(n, reels.get(n, []))
        caps = "".join(f'<a href="{link}" target="_blank" rel="noopener" aria-label="Capítulo {i} de 3">'
                       f'<img src="{img}" alt="" loading="lazy"></a>' for i, (link, img) in enumerate(tiles, 1))
        filas.append(f"""    <li><span class="n">{n:02d}</span>{pfp_tag(pfp, handle or nombre)}
      <div class="quien"><b>{quien}</b><span>{html.escape(sector)}</span></div>
      {f'<div class="caps">{caps}</div>' if caps else ''}
      <div class="links">{links}</div></li>""")
        print(f"{n:02d} {handle or nombre}: capítulos={len(tiles)} reporte={'sí' if cap else 'no'} pfp={'sí' if pfp else 'no'} prototipo={proto_url}")
    desc = "Cada marca que pasó por El Taller: su sector, su reporte y el prototipo que construimos."
    page = HEAD.format(title="El Taller con JP", desc=desc, css=CSS_LISTA, archivos=ARCHIVOS)
    page += f"""  <header><span class="marca">El Taller con JP</span><p>{len(EPISODIOS)} marcas</p></header>
  <ol>
{chr(10).join(filas)}
  </ol>
</main>
<div class="cta"><a href="https://eltallerconjp.jpfraneto.com/espacio/"><b>Trabajemos 1:1</b><span>5 cupos disponibles</span></a></div>
</body>
</html>
"""
    open(f"{OUT}/index.html", "w").write(page)


if __name__ == "__main__":
    main()
