#!/usr/bin/env python3
"""episode: take an El Taller episode from the recording to published. Runs every automatic stage, stops where JP
has to look (PIPELINE.md). State is read from the files on disk; <episode>/status.json keeps approvals and timings.

    tools/.venv/bin/python tools/episode.py                          all episodes: where each one is, what's next
    tools/.venv/bin/python tools/episode.py ep05-slug                run until the next checkpoint
    tools/.venv/bin/python tools/episode.py all                      the same, for every episode with work to do
    tools/.venv/bin/python tools/episode.py watch                    leave it running: AirDrop a take → it runs by itself
    tools/.venv/bin/python tools/episode.py ep05-slug review         the review page on the phone (same wifi)
    tools/.venv/bin/python tools/episode.py ep05-slug feedback "el 2/3 parte lento; el hook del 3/3 no es mío"
    tools/.venv/bin/python tools/episode.py ep05-slug frames 4,1,7   choose the cover frames (ranks in candidates.jpg)
    tools/.venv/bin/python tools/episode.py ep05-slug approve        checkpoint 1 OK → final reels + covers
    tools/.venv/bin/python tools/episode.py ep05-slug publish        checkpoint 2: shows the posting schedule, asks once
    tools/.venv/bin/python tools/episode.py ep05-slug publish ahora  the same, but the whole row goes out now (2 min apart)
    tools/.venv/bin/python tools/episode.py agenda                   what's scheduled, everywhere; posts what's due
    tools/.venv/bin/python tools/episode.py ep05-slug learn          JP's feedback on this episode → el-taller/TASTE.md
    tools/.venv/bin/python tools/episode.py ep05-slug muestra        try el-taller/estilo.json on this episode: covers +
                                                                     end cards → <ep>/muestra/muestra.jpg (nothing published changes)
    tools/.venv/bin/python tools/episode.py ep05-slug youtube        after publish: the long version (long.json → longcut) +
                                                                     opens YouTube Studio and shows the files: JP drags them in
    tools/.venv/bin/python tools/episode.py ep05-slug youtube https://youtu.be/AAA raw https://youtu.be/BBB
                                                                     where they went → long/youtube-log.json
    tools/.venv/bin/python tools/episode.py ep05-slug youtube limpiar   only once both are noted: the take, .work/ and the
                                                                     long .mp4 leave the Mac (YouTube keeps them)

Stages (auto unless marked):
  ingest   .MOV → proxy + transcript + aligned words           (tools/ingest.py)
  frames   best frames of JP + face position                    (tools/pick_frames.py)
  plan     Claude: 1–5 reels (as many as the take has), hooks, captions   (tools/plan_episode.py)
  drafts   the draft reels, B&W, fast                            (DRAFT=1 tools/autoreel.py)
  covers   one cover per reel + grid preview                     (tools/covers2.py)
  review   ◆ JP: watch drafts + covers + captions → approve or feedback
  finals   final reels from the raw take                         (tools/autoreel.py)
  publish  ◆ JP: approve the posting schedule (one reel per slot of estilo.json "publicacion")
  posted   each reel goes out at its time while `watch` (or `agenda`) runs   (tools/publish_ig.py)
  youtube  ◆ JP drags the long version (public) and the raw take (private, the backup) into YouTube Studio; then
           `youtube limpiar` frees the Mac. The business owner gets the whole video, not only the reels.

Whose reels: the episode's taller (estilo.TALLER): footage/el-taller for JP, ~/ElTaller/<negocio>/redes for an owner
(TALLER_DIR=… or run it on an episode inside that folder). Its estilo.json, TASTE.md, raw/ and Instagram credentials.
"""
import datetime, glob, html, json, os, socket, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
PY = sys.executable
IDS = ["01-el-caso", "02-el-nudo", "03-la-propuesta"]          # rows of 3 (before reels.json named its own)
VIDEO = ("*.[mM][oO][vV]", "*.[mM][pP]4")
sys.path.insert(0, HERE)
import estilo
from estilo import E as ESTILO
EPS = estilo.TALLER
SERIE = ESTILO["serie"]["nombre"].title()


def entorno(ep=None):
    """What every tool needs to work for this episode's business: its taller, its raw takes, its Instagram."""
    t = estilo.taller_de(ep) if ep else None
    return {"TALLER_DIR": t or EPS, "TALLER_RAW": estilo.RAW,
            "IG_ENV": os.path.expanduser(ESTILO["publicacion"].get("instagram_env", "~/.config/eltaller/instagram.env"))}


# ------------------------------------------------------------------ helpers
def resolve(name):
    if os.path.isdir(name):
        return os.path.abspath(name)
    hits = sorted(glob.glob(f"{EPS}/{name}*")) or sorted(glob.glob(f"{EPS}/ep{name.zfill(2)}-*"))
    if not hits:
        raise SystemExit(f"no encuentro el episodio {name!r} en el-taller/")
    return hits[0]


def nn(ep):
    return os.path.basename(ep)[2:4]


def mtime(*paths):
    ts = [os.path.getmtime(p) for p in paths if os.path.exists(p)]
    return min(ts) if ts and len(ts) == len(paths) else 0


def newest(*paths):
    ts = [os.path.getmtime(p) for p in paths if os.path.exists(p)]
    return max(ts) if ts else 0


def status(ep):
    p = f"{ep}/status.json"
    return json.load(open(p)) if os.path.exists(p) else {}


def save_status(ep, **kw):
    s = status(ep)
    s.update(kw)
    json.dump(s, open(f"{ep}/status.json", "w"), ensure_ascii=False, indent=1)
    return s


def log_time(ep, stage, secs):
    s = status(ep)
    s.setdefault("timings", {})[stage] = round(secs)
    json.dump(s, open(f"{ep}/status.json", "w"), ensure_ascii=False, indent=1)


def run(ep, stage, cmd, env=None):
    print(f"\n━━ {stage} ━━  {' '.join(os.path.relpath(c, ROOT) if c.startswith(ROOT) else c for c in cmd[1:])}", flush=True)
    t = time.time()
    r = subprocess.run(cmd, cwd=ROOT, env={**os.environ, **entorno(ep), **(env or {})})
    log_time(ep, stage, time.time() - t)
    if r.returncode:
        notify(f"Ep. {nn(ep)}: falló {stage}")
        raise SystemExit(f"✗ {stage} falló (código {r.returncode}). Arréglalo y vuelve a correr episode.py {os.path.basename(ep)}")


def notify(msg):
    subprocess.run(["osascript", "-e", f'display notification "{msg}" with title "{SERIE}"'], capture_output=True)


def takes(ep):
    from ingest import raw_dir
    dropped = [f for pat in VIDEO for f in glob.glob(f"{ep}/{pat}")]
    d = sorted(glob.glob(f"{estilo.RAW}/*_el-taller-ep{nn(ep)}_{os.path.basename(ep)[5:]}"))
    raw = [f for pat in VIDEO for f in glob.glob(f"{d[-1]}/{pat}")] if d else []
    return dropped, raw


def reel_files(ep, draft):
    d = f"{ep}/reels/draft" if draft else f"{ep}/reels"
    ids = IDS
    if os.path.exists(f"{ep}/reels.json"):          # the pinned row has its own ids (01-quien-soy …)
        ids = [r["id"] for r in json.load(open(f"{ep}/reels.json")).get("reels", [])] or IDS
    return [f"{d}/el-taller-ep{nn(ep)}-{i}.mp4" for i in ids]


def n_reels(ep):
    if os.path.exists(f"{ep}/reels.json"):
        return len(json.load(open(f"{ep}/reels.json")).get("reels", [])) or 3
    return 3


def cover_files(ep):
    n = n_reels(ep)
    return [f"{ep}/cover/ep{nn(ep)}-cover-{k}of{n}.jpg" for k in range(1, n + 1)] + [f"{ep}/cover/ep{nn(ep)}-grid-preview.jpg"]


def publicados(ep):
    p = f"{ep}/publish-log.json"
    return json.load(open(p)) if os.path.exists(p) else {}


def items(ep):
    p = f"{ep}/publish.json"
    return json.load(open(p)) if os.path.exists(p) else []


def todo_publicado(ep):
    it, log = items(ep), publicados(ep)
    return bool(it) and all(os.path.basename(x["file"]) in log for x in it)


# ------------------------------------------------------------------- stages
def state(ep):
    """[(stage, done, detail)] from the files on disk."""
    s = status(ep)
    dropped, raw = takes(ep)
    aligned = glob.glob(f"{ep}/transcript/*.aligned.json")
    plan = f"{ep}/reels.json"
    drafts, finals = reel_files(ep, True), reel_files(ep, False)
    covers = cover_files(ep)
    cover_json = f"{ep}/cover/cover.json"
    out = [
        ("record", bool(dropped or raw or aligned), "graba y AirDrop el .MOV a la carpeta del episodio"),
        ("ingest", bool(aligned) and not dropped, "transcripción + palabras alineadas"),
        ("frames", os.path.exists(f"{ep}/cover/frames/candidates.json"), "mejores frames de JP"),
        ("plan", os.path.exists(plan), "Claude planea los reels (1 a 5)"),
        ("drafts", mtime(*drafts) > newest(plan), "borradores"),
        ("covers", mtime(*covers) > newest(cover_json), "covers + grilla"),
        ("review", s.get("approved", 0) > newest(plan, cover_json), "◆ JP revisa y aprueba"),
        ("finals", mtime(*finals) > newest(plan), "reels finales"),
        ("publish", bool(s.get("agenda") or s.get("published")), "◆ JP aprueba la agenda de publicación"),
        ("posted", bool(s.get("published")) or todo_publicado(ep), proximo(ep)),
    ]
    return out


def proximo(ep):
    log = publicados(ep)
    pend = [x for x in items(ep) if os.path.basename(x["file"]) not in log and x.get("cuando")]
    if not pend:
        return "se publican solos, a su hora (deja `episode.py watch` corriendo)"
    t = datetime.datetime.fromisoformat(pend[0]["cuando"])
    return f"próximo: {t:%a %d %b %H:%M} ({len(pend)} por salir; `watch` los publica)"


def next_stage(ep):
    for name, done, detail in state(ep):
        if not done:
            return name, detail
    return None, "publicado"


def ensure_cover_inputs(ep):
    """Fill what covers2 needs and nobody gave: frames (top picks), pfp (placeholder), table_y, nudge, take."""
    p = f"{ep}/cover/cover.json"
    cfg = json.load(open(p)) if os.path.exists(p) else {"ep": nn(ep)}
    if cfg.get("layout") == "fijados":          # pinned row: covers_fijados.py, no client picture or table
        return
    changed = []
    cand = f"{ep}/cover/frames/candidates.json"
    n = len(cfg.get("hooks") or []) or 3
    have = [f for f in (cfg.get("frames") or []) if f]
    if len(have) < n and os.path.exists(cand):
        c = [x["t"] for x in json.load(open(cand)) if x["t"] not in have]
        cfg["frames"] = have + c[:n - len(have)]
        changed.append(f"frames = {n} ({', '.join(str(x) for x in cfg['frames'])})")
    elif len(have) > n:
        cfg["frames"] = have[:n]
    cfg.setdefault("table_y", 1090)
    cfg["nudge"] = (cfg.get("nudge") or [])[:n] + [0] * max(0, n - len(cfg.get("nudge") or []))
    cfg.setdefault("accent_ink", "#111111")
    pfp = cfg.get("pfp") or "cover/pfp.png"
    if not os.path.exists(pfp if os.path.isabs(pfp) else f"{ep}/{pfp}"):
        from PIL import Image, ImageDraw, ImageFont
        im = Image.new("RGB", (480, 480), cfg.get("accent", "#FFD23F"))
        f = ImageFont.truetype(estilo.fuente("Black"), 260)
        letter = (cfg.get("handle") or "?")[0].upper()
        d = ImageDraw.Draw(im)
        d.text((240, 240), letter, font=f, fill=cfg.get("accent_ink", "#111111"), anchor="mm")
        im.save(f"{ep}/cover/pfp-placeholder.png")
        cfg["pfp"] = "cover/pfp-placeholder.png"
        changed.append("pfp = provisoria (falta cover/pfp.png: la foto de su IG)")
    if changed:
        json.dump(cfg, open(p, "w"), ensure_ascii=False, indent=1)
        print("  cover.json:", *changed, sep="\n   · ")


def advance(ep):
    """Run every automatic stage until a checkpoint (or the end)."""
    print(f"\n▶ {os.path.basename(ep)}")
    for name, done, detail in state(ep):
        if done:
            continue
        if name == "record":
            print(f"\n◆ falta la grabación: {detail}\n  ({os.path.relpath(ep, ROOT)}/)")
            return name
        if name == "ingest":
            run(ep, "ingest", [PY, f"{HERE}/ingest.py", ep])
        elif name == "frames":
            run(ep, "frames", [PY, f"{HERE}/pick_frames.py", ep])
        elif name == "plan":
            run(ep, "plan", [PY, f"{HERE}/plan_episode.py", ep])
        elif name == "drafts":
            run(ep, "drafts", [PY, f"{HERE}/autoreel.py", ep], env={"DRAFT": "1"})
        elif name == "covers":
            ensure_cover_inputs(ep)
            run(ep, "covers", [PY, "-c", f"import sys; sys.path.insert(0, {HERE!r}); import covers2; covers2.build({ep!r})"])
        elif name == "review":
            page = build_review(ep)
            notify(f"Ep. {nn(ep)} listo para revisar")
            print(f"\n◆ CHECKPOINT 1 · revisar: {os.path.relpath(page, ROOT)}")
            print(f"  en el teléfono:  tools/.venv/bin/python tools/episode.py {os.path.basename(ep)} review")
            print(f"  cambios:         … episode.py {os.path.basename(ep)} feedback \"lo que no te gustó\"")
            print(f"  otros frames:    … episode.py {os.path.basename(ep)} frames 4,1,7   (ver cover/frames/candidates.jpg)")
            print(f"  ok:              … episode.py {os.path.basename(ep)} approve")
            return name
        elif name == "finals":
            run(ep, "finals", [PY, f"{HERE}/autoreel.py", ep])
        elif name == "publish":
            build_review(ep)
            notify(f"Ep. {nn(ep)}: finales listos")
            print(f"\n◆ CHECKPOINT 2 · reels finales en {os.path.relpath(ep, ROOT)}/reels/")
            print("  antes de publicar: muéstraselo al negocio (privado). Después, la agenda (un reel por horario):")
            print(f"  tools/.venv/bin/python tools/episode.py {os.path.basename(ep)} publish        (o `publish ahora`)")
            return name
        elif name == "posted":
            publicar_pendientes(ep)
            if not todo_publicado(ep):
                print(f"\n· {proximo(ep)}")
                return name
    print("\n✓ publicado")
    return None


# ------------------------------------------------------------- review page
def dijo(ep, r):
    """What JP says in a reel: its punctuated captions (from the cut), or the plan's words."""
    for d in (f"{ep}/.work/{r.get('id')}", f"{ep}/.work/draft/{r.get('id')}"):
        if os.path.exists(f"{d}/caption_words.json"):
            return " ".join(w["t"] for w in json.load(open(f"{d}/caption_words.json")))
    return " ".join(p["say"] for p in r.get("pieces", []))


def build_review(ep):
    """<episode>/review/index.html: the row as it will look, drafts (or finals), Claude's notes, and the ritual: under
    each reel what JP said in the take, and an empty box where he writes the caption himself (2026-11-13: "no quiero que
    mis posts estén escritos con IA… quiero escribir"). It saves as he types (POST /caption → publish.json)."""
    n = nn(ep)
    os.makedirs(f"{ep}/review", exist_ok=True)
    finals = all(os.path.exists(f) and os.path.getmtime(f) >= os.path.getmtime(d) if os.path.exists(d) else os.path.exists(f)
                 for f, d in zip(reel_files(ep, False), reel_files(ep, True)))
    files = reel_files(ep, not finals)
    pub = {os.path.basename(x["file"]): x for x in items(ep)}
    reels = json.load(open(f"{ep}/reels.json")).get("reels", []) if os.path.exists(f"{ep}/reels.json") else []
    notes = open(f"{ep}/plan-notes.md").read() if os.path.exists(f"{ep}/plan-notes.md") else ""
    v = int(time.time())
    cols = ""
    N = len(files)
    log = publicados(ep)
    for k, f in enumerate(files, 1):
        rel = os.path.relpath(f, ep)
        if os.path.basename(f) in log:          # already on Instagram: nothing left to look at or write
            continue
        it = pub.get(os.path.basename(f), {})
        r = reels[k - 1] if k - 1 < len(reels) else {}
        cuando = ""
        if it.get("cuando"):
            cuando = f"<p class=\"cu\">sale el {datetime.datetime.fromisoformat(it['cuando']):%a %d %b · %H:%M}</p>"
        quien = "".join(f"<p class=\"q\"><b>{lab}</b> {html.escape(r[key])}</p>" for lab, key in (("para:", "para"), ("dice:", "idea")) if r.get(key))
        cover = it.get("cover") or f"cover/ep{n}-cover-{k}of{N}.jpg"
        cols += f"""<section><h2>{k}/{N}{(' · ' + html.escape(r['nombre'])) if r.get('nombre') else ''}</h2>{cuando}{quien}
<video src="../{rel}?v={v}" poster="../{cover}?v={v}" controls playsinline preload="none"></video>
<details><summary>lo que dijiste en la take</summary><p class="dijo">{html.escape(dijo(ep, r))}</p></details>
<form class="cap" method="post" action="/caption" data-file="{html.escape(it.get('file', rel))}">
<input type="hidden" name="file" value="{html.escape(it.get('file', rel))}">
<textarea name="text" placeholder="tu caption">{html.escape(it.get("caption", ""))}</textarea>
<button class="fb">Guardar</button><span class="st"></span></form></section>"""
    # the day's stories (historias.json → historias/, rendered with PLAN=historias.json autoreel.py): posted by hand
    hist = ""
    if os.path.exists(f"{ep}/historias.json"):
        for r in json.load(open(f"{ep}/historias.json")).get("reels", []):
            f = f"{ep}/historias/el-taller-ep{n}-{r['id']}.mp4"
            f = f if os.path.exists(f) else f"{ep}/historias/draft/el-taller-ep{n}-{r['id']}.mp4"
            if os.path.exists(f):
                hist += f"""<section><h2>{html.escape(r.get('act', ''))} · {html.escape(r.get('nombre', ''))}</h2>
<p class="q">{html.escape(r.get('idea', ''))}</p>
<video src="../{os.path.relpath(f, ep)}?v={v}" controls playsinline preload="none"></video></section>"""
    if hist:
        hist = f'<h1 style="margin-top:24px">Historias · <b>se suben a mano</b>, con link al 1/3</h1><div class="row">{hist}</div>'
    # the weekend row (finde.json → finde/, el-taller/fin-de-semana.md): its own reels and covers, captions like the row's
    finde = ""
    if os.path.exists(f"{ep}/finde.json"):
        fr = json.load(open(f"{ep}/finde.json")).get("reels", [])
        for k, r in enumerate(fr, 1):
            rel = f"finde/el-taller-ep{n}-{r['id']}.mp4"
            if not os.path.exists(f"{ep}/{rel}"):
                continue
            it = pub.get(os.path.basename(rel), {})
            cuando = ""
            if it.get("cuando"):
                cuando = f"<p class=\"cu\">sale el {datetime.datetime.fromisoformat(it['cuando']):%a %d %b · %H:%M}</p>"
            quien = "".join(f"<p class=\"q\"><b>{lab}</b> {html.escape(r[key])}</p>" for lab, key in (("para:", "para"), ("dice:", "idea")) if r.get(key))
            caja = (f"""<form class="cap" method="post" action="/caption" data-file="{html.escape(rel)}">
<input type="hidden" name="file" value="{html.escape(rel)}">
<textarea name="text" placeholder="tu caption">{html.escape(it.get("caption", ""))}</textarea>
<button class="fb">Guardar</button><span class="st"></span></form>""" if it else "")
            finde += f"""<section><h2>{html.escape(r.get('act', f'{k}/{len(fr)}'))} · {html.escape(r.get('nombre', ''))}</h2>{cuando}{quien}
<video src="../{rel}?v={v}" poster="../{it.get('cover') or f'finde/cover/finde-cover-{k}of{len(fr)}.jpg'}?v={v}" controls playsinline preload="none"></video>
<details><summary>lo que dijiste en la take</summary><p class="dijo">{html.escape(" ".join(p["say"] for p in r.get("pieces", [])))}</p></details>
{caja}</section>"""
    if finde:
        finde = (f'<h1 style="margin-top:24px">Fin de semana · <b>{len(fr)} reels</b></h1>'
                 f'<img class="grid" src="../finde/cover/finde-grid-preview.jpg?v={v}"><div class="row">{finde}</div>')
        hist = finde + hist
    fila = (f"""<h1>{SERIE} · Ep. {n} · <b>{'finales' if finals else 'borradores'}</b> · {N} reel{'s' if N > 1 else ''}</h1>
<img class="grid" src="../cover/ep{n}-grid-preview.jpg?v={v}">
<div class="row">{cols}</div>""" if cols else f"<h1>{SERIE} · Ep. {n} · <b>publicado</b></h1>")
    page = f"""<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ep. {n} · revisión</title>
<style>*{{box-sizing:border-box}} img,video{{max-width:100%}} body{{overflow-x:hidden;background:#111;color:#eee;font:15px -apple-system,system-ui;margin:0;padding:16px}}
h1{{font-size:20px;margin:0 0 12px}} h1 b{{color:#FFD23F}} .grid{{width:100%;max-width:720px;border-radius:12px}}
.row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}}
section{{background:#1c1c1c;border-radius:14px;padding:12px}} h2{{margin:0 0 8px;color:#FFD23F}}
video{{width:100%;aspect-ratio:9/16;border-radius:10px;display:block;margin-bottom:8px;background:#000}}
pre{{white-space:pre-wrap;font:13px/1.45 -apple-system,system-ui;color:#ccc}}
form{{background:#1c1c1c;border-radius:14px;padding:12px;margin-top:16px}} textarea{{width:100%;min-height:110px;
background:#000;color:#eee;border:1px solid #333;border-radius:10px;padding:10px;font:15px -apple-system,system-ui;box-sizing:border-box}}
button{{font:600 16px -apple-system;padding:12px 18px;border-radius:12px;border:0;margin:8px 8px 0 0}}
.ok{{background:#FFD23F;color:#111}} .fb{{background:#333;color:#eee}} details{{margin-top:16px}} .msg{{color:#FFD23F}}
.q{{margin:0 0 6px;color:#bbb;font-size:13px}} .q b{{color:#eee}} .cu{{margin:0 0 6px;color:#FFD23F;font-size:13px}}
.cap{{background:none;padding:0;margin-top:8px}} .cap textarea{{min-height:200px}} .st{{color:#888;font-size:13px}}
summary{{color:#aaa;font-size:13px;cursor:pointer}} .dijo{{color:#bbb;font-size:13px;line-height:1.5}}</style>
{fila}
{hist}
<form method="post" action="/feedback"{' hidden' if not cols else ''}><b>¿Qué cambio?</b> (se lo paso a Claude y vuelvo a armar los borradores)
<textarea name="text" placeholder="ej: el 2 sobra. El 1 parte lento, abre con la frase del Excel. El hook del 3 no suena a mí."></textarea>
<button class="fb">Enviar cambios</button><button class="ok" formaction="/approve">Aprobar → finales</button>
<span class="msg">{html.escape(status(ep).get("server_msg", ""))}</span></form>
<details><summary>Notas del plan</summary><pre>{html.escape(notes)}</pre></details>
<script>
document.querySelectorAll('form.cap').forEach(f => {{
  const t = f.querySelector('textarea'), st = f.querySelector('.st'); let timer;
  const save = async () => {{
    st.textContent = 'guardando…';
    const r = await fetch('/caption', {{method: 'POST', headers: {{'content-type': 'application/json'}},
                                        body: JSON.stringify({{file: f.dataset.file, text: t.value}})}});
    st.textContent = r.ok ? 'guardado' : 'no se guardó';
  }};
  t.addEventListener('input', () => {{ st.textContent = ''; clearTimeout(timer); timer = setTimeout(save, 900); }});
  f.addEventListener('submit', e => {{ e.preventDefault(); clearTimeout(timer); save(); }});
}});
</script>
</html>"""
    path = f"{ep}/review/index.html"
    open(path, "w").write(page)
    return path


def serve(ep, port=8833):
    """The review page for the phone, on the local network. Feedback/approve buttons run episode.py in the background."""
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    from urllib.parse import parse_qs
    build_review(ep)
    me = os.path.basename(ep)

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ep, **k)

        def log_message(self, *a):
            pass

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
            if self.path == "/caption":           # JP's caption → publish.json (JSON from the page, or the plain form)
                d = json.loads(body) if body.startswith("{") else {k: v[0] for k, v in parse_qs(body).items()}
                plan = items(ep)
                for x in plan:
                    if x["file"] == d.get("file"):
                        x["caption"] = d.get("text", "").replace("\r\n", "\n").strip()
                json.dump(plan, open(f"{ep}/publish.json", "w"), ensure_ascii=False, indent=1)
                build_review(ep)                    # a reload shows what he wrote
                if body.startswith("{"):
                    self.send_response(200); self.send_header("Content-Length", "0"); self.end_headers()
                else:
                    self.send_response(303); self.send_header("Location", "/review/"); self.end_headers()
                return
            text = parse_qs(body).get("text", [""])[0].strip()
            logf = open(f"{ep}/review/server.log", "a")
            if self.path == "/approve":
                subprocess.Popen([PY, __file__, me, "approve"], cwd=ROOT, stdout=logf, stderr=logf)
                msg = "Aprobado: armando los finales (te aviso en el Mac)."
            elif text:
                subprocess.Popen([PY, __file__, me, "feedback", text], cwd=ROOT, stdout=logf, stderr=logf)
                msg = "Recibido: Claude está re-planeando y re-armando los borradores (~5 min). Recarga después."
            else:
                msg = "Escribe algo antes de enviar."
            save_status(ep, server_msg=msg)
            build_review(ep)
            self.send_response(303)
            self.send_header("Location", "/review/")
            self.end_headers()

    ip = subprocess.run(["ipconfig", "getifaddr", "en0"], capture_output=True, text=True).stdout.strip() or \
        socket.gethostbyname(socket.gethostname())
    print(f"Revisión de Ep. {nn(ep)} en el teléfono (misma wifi):  http://{ip}:{port}/review/")
    print("Ctrl-C para cerrar.")
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()


# ---------------------------------------------------------------- commands
def dashboard():
    rows = []
    for ep in sorted(glob.glob(f"{EPS}/ep[0-9][0-9]-*")):
        if os.path.exists(f"{ep}/make_reels.py") and not os.path.exists(f"{ep}/reels.json"):
            rows.append((os.path.basename(ep), "—", "hecho a mano (antes del pipeline automático)"))
            continue
        stage, detail = next_stage(ep)
        rows.append((os.path.basename(ep), stage or "✓", detail))
    w = max(len(r[0]) for r in rows) if rows else 10
    print(f"{'episodio':<{w}}  {'siguiente':<9}  qué")
    for name, stage, detail in rows:
        mark = "◆" if stage in ("record", "review", "publish") else " "
        stage = "agenda" if stage == "posted" else stage
        print(f"{name:<{w}}  {mark}{stage:<8}  {detail}")
    print("\n◆ = te toca a ti. Lo demás corre solo:  tools/.venv/bin/python tools/episode.py <episodio>  (o `all`)")


def feedback(ep, text):
    t = time.time()
    run(ep, "replan", [PY, f"{HERE}/plan_episode.py", ep, "--feedback", text])
    save_status(ep, server_msg="", approved=0)
    advance(ep)
    log_time(ep, "feedback_round", time.time() - t)


def frames(ep, ranks):
    cand = json.load(open(f"{ep}/cover/frames/candidates.json"))
    by = {c["rank"]: c["t"] for c in cand}
    p = f"{ep}/cover/cover.json"
    cfg = json.load(open(p))
    cfg["frames"] = [by[int(r)] for r in ranks.split(",")]
    json.dump(cfg, open(p, "w"), ensure_ascii=False, indent=1)
    print("cover.json frames =", cfg["frames"])
    advance(ep)


def muestra(ep):
    """Render this episode with the current el-taller/estilo.json into <ep>/muestra/, next to what exists today.
    Cheap (seconds): covers from cached frames, and 2 still frames per reel from the draft pipeline (PREVIEW)."""
    from PIL import Image, ImageDraw, ImageFont
    import covers2
    t = time.time()
    out = f"{ep}/muestra"
    os.makedirs(out, exist_ok=True)
    covers2.build(ep, out=out)
    nn_ = nn(ep)
    N = n_reels(ep)
    rows = [("hoy", [f"{ep}/cover/ep{nn_}-cover-{i}of{N}.jpg" for i in range(1, N + 1)]),
            ("con estilo.json", [f"{out}/ep{nn_}-cover-{i}of{N}.jpg" for i in range(1, N + 1)])]
    if os.path.exists(f"{ep}/reels.json"):
        stills = []
        for rid in [r["id"] for r in json.load(open(f"{ep}/reels.json")).get("reels", [])]:
            draft = f"{ep}/reels/draft/el-taller-ep{nn_}-{rid}.mp4"
            if not os.path.exists(draft):
                continue
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", draft],
                                       capture_output=True, text=True).stdout or 0)
            end = round(dur - 1.0, 2)
            env = dict(os.environ, **entorno(ep), DRAFT="1", PREVIEW=f"8,{end}")
            subprocess.run([PY, f"{HERE}/autoreel.py", ep, rid], env=env, capture_output=True)
            prev = f"{ep}/.work/draft/{rid}"
            for ts, name in ((8.0, "medio"), (end, "final")):
                src = f"{prev}/prev_{ts:06.2f}.jpg"
                if os.path.exists(src):
                    dst = f"{out}/{rid}-{name}.jpg"
                    os.replace(src, dst)
                    stills.append(dst)
        if stills:
            rows.append(("reels: un momento y la tarjeta final", stills))
    tw, th, head = 270, 480, 44
    cols = max(len(r[1]) for r in rows)
    sheet = Image.new("RGB", (tw * cols, (th + head) * len(rows)), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(estilo.fuente("Semibold"), 26)
    for r, (label, files) in enumerate(rows):
        y = r * (th + head)
        d.text((12, y + 8), label, fill=(230, 230, 230), font=f)
        for c, p in enumerate(files):
            if os.path.exists(p):
                sheet.paste(Image.open(p).convert("RGB").resize((tw, th)), (c * tw, y + head))
    path = f"{out}/muestra.jpg"
    sheet.save(path, quality=90)
    print(f"muestra ({time.time() - t:.0f} s) → {os.path.relpath(path, ROOT)}")
    if sys.stdout.isatty():
        subprocess.run(["open", path])


def approve(ep):
    save_status(ep, approved=time.time(), approved_at=datetime.datetime.now().isoformat(timespec="minutes"), server_msg="")
    stage = advance(ep)
    if os.path.exists(f"{ep}/feedback.md"):
        learn(ep)
    return stage


def ocupados(salvo=None):
    """Slots already promised to other episodes of this taller (so two episodes never post at the same time)."""
    out = []
    for e in glob.glob(f"{EPS}/ep[0-9][0-9]-*"):
        if e == salvo:
            continue
        log = publicados(e)
        out += [datetime.datetime.fromisoformat(x["cuando"]) for x in items(e)
                if x.get("cuando") and os.path.basename(x["file"]) not in log]
    return out


def publish(ep, ahora=False):
    """Checkpoint 2: one reel per slot of estilo.json "publicacion" (from the next free slot; `ahora`: the whole row now,
    2 minutes apart). Asks once;
    then `watch` / `agenda` post each one at its time (publish_ig.py, already-posted ones are skipped)."""
    if not status(ep).get("approved"):
        raise SystemExit("primero: episode.py <ep> approve")
    missing = [f for f in reel_files(ep, False) + cover_files(ep)[:-1] if not os.path.exists(f)]
    if missing:
        raise SystemExit("faltan: " + ", ".join(os.path.relpath(m, ep) for m in missing))
    plan, log = items(ep), publicados(ep)
    pend = [x for x in plan if os.path.basename(x["file"]) not in log]
    sin = [os.path.basename(x["file"]) for x in pend if not x.get("caption", "").strip()]
    if sin:   # the captions are JP's: nothing goes out without his text
        raise SystemExit(f"faltan tus captions ({', '.join(sin)}): escríbelas en `episode.py {os.path.basename(ep)} review`")
    if not pend:
        print("ya está todo publicado"); return
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(ESTILO["publicacion"]["zona"])
    if ahora:  # the whole row now, 2 minutes apart so it lands in order (JP, 2026-11-12: "publish it now, after having it ready")
        t0 = datetime.datetime.now(tz).replace(second=0, microsecond=0)
        slots = [t0 + datetime.timedelta(minutes=2 * i) for i in range(len(pend))]
    else:
        slots = estilo.agenda(len(pend), ocupados=ocupados(ep))
    for x, t in zip(pend, slots):
        x["cuando"] = t.isoformat(timespec="minutes")
    handle = ESTILO["serie"]["handle"]
    print(f"\nAgenda de Ep. {nn(ep)} en {handle} (un reel por horario: {', '.join(ESTILO['publicacion']['horas'])}):")
    for x in pend:
        t = datetime.datetime.fromisoformat(x["cuando"])
        print(f"  {t:%a %d %b %H:%M}  {os.path.basename(x['file'])}  · “{x['caption'].splitlines()[0]}”")
    if input(f"\n¿Los publico así en {handle}? Escribe 'publicar': ").strip().lower() != "publicar":
        print("No agendé nada.")
        return
    json.dump(plan, open(f"{ep}/publish.json", "w"), ensure_ascii=False, indent=1)
    save_status(ep, agenda=datetime.datetime.now().isoformat(timespec="minutes"))
    publicar_pendientes(ep)
    print(f"✓ agendado. {proximo(ep)}")


def publicar_pendientes(ep, quiet=False):
    """Post every scheduled reel whose time has come (only with an approved agenda)."""
    if not status(ep).get("agenda") or status(ep).get("published"):
        return
    # One poster at a time: the launchd agent, `watch` and a manual `agenda` can overlap, and Meta takes minutes to
    # process a reel, so without this lock two of them posted the same reel twice (Ep. 07, 2026-11-10).
    import fcntl
    lock = open(f"{ep}/.publish.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(f"· {os.path.basename(ep)}: ya hay otra publicación en curso", flush=True)
        return
    from zoneinfo import ZoneInfo
    now = datetime.datetime.now(ZoneInfo(ESTILO["publicacion"]["zona"]))
    for x in items(ep):
        name = os.path.basename(x["file"])
        if name in publicados(ep) or not x.get("cuando") or datetime.datetime.fromisoformat(x["cuando"]) > now:
            continue
        if x.get("nube"):                        # sent to the cloud (tools/nube.py): it posts it, `agenda` copies the result
            continue
        if not x.get("caption", "").strip():     # the captions are JP's: a due reel waits for his text, never goes out empty
            if not quiet:
                print(f"· {name}: le toca, pero espera tu caption (episode.py {os.path.basename(ep)} review)", flush=True)
            continue
        print(f"→ publicando {name} ({x['cuando']})", flush=True)
        r = subprocess.run([PY, f"{HERE}/publish_ig.py", ep, "--solo", name], cwd=ROOT, env={**os.environ, **entorno(ep)})
        if r.returncode:
            notify(f"Ep. {nn(ep)}: no se pudo publicar {name}")
            return
        notify(f"Publicado: {name}")
    if todo_publicado(ep):
        save_status(ep, published=datetime.datetime.now().isoformat(timespec="minutes"))
        print(f"✓ Ep. {nn(ep)}: todo publicado. Revisa el perfil en el teléfono (recorte 3:4).")


def agenda_todo():
    """What's scheduled in this taller, and post what's due."""
    filas = []
    try:                                         # what the cloud posted (tools/nube.py) → each publish-log.json
        import nube
        if os.path.exists(nube.ENV):
            nube.estado(quiet=True)
    except Exception as ex:
        print(f"· nube: {ex}")
    for e in sorted(glob.glob(f"{EPS}/ep[0-9][0-9]-*")):
        publicar_pendientes(e)
        log = publicados(e)
        for x in items(e):
            if x.get("cuando") and os.path.basename(x["file"]) not in log:
                filas.append((x["cuando"], os.path.basename(e), ("☁ " if x.get("nube") else "") + os.path.basename(x["file"]),
                              (x.get("caption", "").strip().splitlines() or ["(sin caption: espera la tuya)"])[0]))
    if not filas:
        print("nada agendado")
    for c, e, f, cap in sorted(filas):
        print(f"{datetime.datetime.fromisoformat(c):%a %d %b %H:%M}  {e:<24} {f}  · “{cap}”")


def learn(ep):
    """Distill this episode's feedback into TASTE.md (Claude proposes the new file; the old one is kept)."""
    fb = open(f"{ep}/feedback.md").read() if os.path.exists(f"{ep}/feedback.md") else ""
    if not fb.strip():
        print("sin feedback en este episodio: nada que aprender")
        return
    taste_p = f"{EPS}/TASTE.md"
    taste = open(taste_p).read()
    prompt = f"""This is TASTE.md, the style memory of the El Taller reel pipeline:

{taste}

During Ep. {nn(ep)}, JP gave this feedback on the drafts (each block made Claude re-plan the reels):

{fb}

Rewrite TASTE.md so the next episode is planned with these lessons: turn each piece of feedback into a short, general
rule in the right section (not a one-off fix for this episode), merge with or replace rules it contradicts, and add one
dated line under "Lessons by episode" (Ep. {nn(ep)}, {datetime.date.today()}). Keep everything else. Output only the file."""
    r = subprocess.run(["claude", "-p", "--model", "opus", "--tools", "", "--no-session-persistence"], input=prompt,
                       capture_output=True, text=True, timeout=900)
    new = r.stdout.strip()
    if r.returncode or not new.startswith("#"):
        print("✗ learn: claude no devolvió el archivo", r.stderr[-500:])
        return
    os.makedirs(f"{EPS}/.taste-history", exist_ok=True)
    os.replace(taste_p, f"{EPS}/.taste-history/TASTE-{datetime.datetime.now():%Y%m%d-%H%M%S}.md")
    open(taste_p, "w").write(new + "\n")
    print(f"✓ TASTE.md actualizado con lo aprendido en Ep. {nn(ep)} (versión anterior en el-taller/.taste-history/)")


def waiting_for_take():
    """Episodes that still need their recording. Planned or published ones never count, even on a Mac where their
    takes and transcripts aren't (they're not in git): a fresh clone must not make old episodes look empty."""
    out = []
    for ep in sorted(glob.glob(f"{EPS}/ep[0-9][0-9]-*")):
        st = status(ep)
        if os.path.exists(f"{ep}/make_reels.py") or os.path.exists(f"{ep}/reels.json") or st.get("published") or st.get("agenda"):
            continue
        if next_stage(ep)[0] == "record":
            out.append(ep)
    return out


def watch(inbox=os.path.expanduser("~/Downloads"), every=30, min_gb=0.3):
    """AirDrop lands in ~/Downloads. A new long take (> min_gb, size stable) goes to the one episode waiting for its
    recording, then that episode runs to its next checkpoint. Several episodes waiting → the take's name decides
    (rename it to ep05.MOV) or it waits for you."""
    print(f"Escuchando {inbox} (cada {every} s). Ctrl-C para parar.")
    seen = {}
    while True:
        for e in sorted(glob.glob(f"{EPS}/ep[0-9][0-9]-*")):   # the posting schedule
            try:
                publicar_pendientes(e)
            except Exception as ex:                                # one bad episode never stops the watch
                print(f"✗ {os.path.basename(e)}: {ex}")
        for f in [f for pat in VIDEO for f in glob.glob(f"{inbox}/{pat}")]:
            size = os.path.getsize(f)
            if size < min_gb * 1e9:
                continue
            if seen.get(f) != size:                      # still arriving
                seen[f] = size
                continue
            waiting = waiting_for_take()
            named = [ep for ep in waiting if f"ep{nn(ep)}" in os.path.basename(f).lower()]
            target = named[0] if named else (waiting[0] if len(waiting) == 1 else None)
            if not target:
                if f not in seen.get("_told", []):
                    notify(f"{os.path.basename(f)}: ¿de qué episodio? Renómbralo epNN.MOV")
                    print(f"? {os.path.basename(f)}: {len(waiting)} episodios esperan toma; renómbralo epNN.MOV")
                    seen.setdefault("_told", []).append(f)
                continue
            dest = f"{target}/{os.path.basename(f)}"
            os.replace(f, dest)
            print(f"\n{os.path.basename(f)} → {os.path.basename(target)}")
            notify(f"Toma recibida → Ep. {nn(target)}. Procesando…")
            try:
                advance(target)
            except SystemExit as e:
                print(e)
        time.sleep(every)


# ------------------------------------------------------------------ youtube (JP, 2026-11-17: "subir el video a youtube y borrarlo")
STUDIO = "https://studio.youtube.com/channel/UCCZafDkcHupxPdUViJ7WK9A/videos/upload?d=ud"   # El Taller con JP


def youtube(ep, a):
    """The whole take → YouTube: the long cut public (the owner watches all of it), the raw take private (the backup).
    Uploads go through Studio by hand: the API locks uploads from unaudited projects to private."""
    log_p = f"{ep}/long/youtube-log.json"
    log = json.load(open(log_p)) if os.path.exists(log_p) else {}
    cfg = json.load(open(f"{ep}/long.json")) if os.path.exists(f"{ep}/long.json") else None
    take = os.path.join(ROOT, cfg["take"]) if cfg and not os.path.isabs(cfg["take"]) else cfg and cfg["take"]
    long_mp4 = f"{ep}/long/ep{nn(ep)}-long.mp4"
    if a and a[0] == "limpiar":
        if not (log.get("youtube") and log.get("raw")):
            raise SystemExit(f"✗ falta anotar dónde quedaron: episode.py {os.path.basename(ep)} youtube <url-largo> raw <url-raw>")
        gone = [p for p in (take, long_mp4) if p and os.path.exists(p)]
        gone += [d for d in (f"{ep}/.work", f"{ep}/long/.work") if os.path.isdir(d)]
        size = sum(os.path.getsize(p) if os.path.isfile(p) else
                   sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(p) for f in fs) for p in gone)
        for p in gone:
            subprocess.run(["rm", "-rf", p], check=True)
            print(f"  borrado {os.path.relpath(p, ROOT)}")
        log["limpiado"] = datetime.date.today().isoformat()
        json.dump(log, open(log_p, "w"), indent=1)
        print(f"✓ {size / 1e9:.1f} GB liberados. En YouTube: {log['youtube']} (público) · {log['raw']} (raw, privado)")
        return
    if a:                                                   # youtube <url> [raw <url>]
        if "raw" in a:
            log["raw"] = a[a.index("raw") + 1]
            a = a[:a.index("raw")]
        if a:
            log.update(youtube=a[0], channel="@eltallerconjp", published=datetime.date.today().isoformat(), visibility="public")
        os.makedirs(f"{ep}/long", exist_ok=True)
        json.dump(log, open(log_p, "w"), indent=1)
        print(json.dumps(log, indent=1))
        if log.get("youtube") and log.get("raw"):
            print(f"\nCuando Studio diga que los dos terminaron de subir (no antes: una URL existe desde el 0%):\n"
                  f"  episode.py {os.path.basename(ep)} youtube limpiar")
        return
    if not cfg:
        raise SystemExit(f"✗ falta {os.path.relpath(ep, ROOT)}/long.json (Claude lo escribe del transcript, como ep05/ep11)")
    if not os.path.exists(long_mp4):
        run(ep, "long", [PY, f"{HERE}/longcut.py", ep])
    subprocess.run(["open", STUDIO])
    subprocess.run(["open", "-R", long_mp4])
    print(f"""
◆ YouTube Studio quedó abierto. Arrastra:
  1. {os.path.relpath(long_mp4, ROOT)}  → público. Título, descripción y capítulos: long/ep{nn(ep)}-youtube.txt ·
     miniatura: long/ep{nn(ep)}-thumb.jpg · subtítulos: long/ep{nn(ep)}-long.srt
  2. {os.path.relpath(take, ROOT)}  → privado, título "ep{nn(ep)} {os.path.basename(ep)[5:]} RAW" (el respaldo)
Después: episode.py {os.path.basename(ep)} youtube <url-largo> raw <url-raw>   y   … youtube limpiar""")


def main():
    a = sys.argv[1:]
    if not a:
        return dashboard()
    if a[0] in ("-h", "--help", "help"):
        raise SystemExit(__doc__)
    if a[0] == "watch":
        return watch()
    if a[0] == "agenda":
        return agenda_todo()
    if a[0] == "all":
        for ep in sorted(glob.glob(f"{EPS}/ep[0-9][0-9]-*")):
            if os.path.exists(f"{ep}/make_reels.py") and not os.path.exists(f"{ep}/reels.json"):
                continue                                     # hand-made episodes (Ep. 01–04)
            advance(ep)
        return dashboard()
    ep = resolve(a[0])
    cmd = a[1] if len(a) > 1 else "run"
    if cmd == "run":
        advance(ep)
    elif cmd == "status":
        for name, done, detail in state(ep):
            print(f"{'✓' if done else '·'} {name:<8} {detail}")
        print(json.dumps(status(ep).get("timings", {}), indent=1))
    elif cmd == "review":
        serve(ep, int(a[2]) if len(a) > 2 else 8833)
    elif cmd == "feedback":
        feedback(ep, " ".join(a[2:]) or sys.exit("feedback \"texto\""))
    elif cmd == "frames":
        frames(ep, a[2])
    elif cmd == "approve":
        approve(ep)
    elif cmd == "publish":
        publish(ep, ahora=len(a) > 2 and a[2] == "ahora")
    elif cmd == "learn":
        learn(ep)
    elif cmd == "muestra":
        muestra(ep)
    elif cmd == "youtube":
        youtube(ep, a[2:])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
