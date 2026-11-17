#!/usr/bin/env python3
"""autoreel: an episode's reels (1 to 5; rows of 3 before 2026-11-10) from data (<episode>/reels.json).

    tools/.venv/bin/python tools/autoreel.py el-taller/ep05-slug --check            resolve every phrase, print the script
    DRAFT=1 tools/.venv/bin/python tools/autoreel.py el-taller/ep05-slug [01-el-caso ...]   drafts → reels/draft/
    tools/.venv/bin/python tools/autoreel.py el-taller/ep05-slug [...]               finals from the raw take
    PLAN=historias.json tools/.venv/bin/python tools/autoreel.py el-taller/ep05-slug   another plan of the same take
                                              (same format) → <episode>/historias/ (e.g. the day's stories, Ep. 09)

reels.json says WHAT is said and shown; this file turns it into cuts and timed graphics (tools/taller.py renders).
Everything is anchored to words JP says, never to seconds, so a plan survives re-cuts:

{
  "ep": "05", "name": "La Tienda",
  "take": "IMG_1234",                       optional: transcript/<take>.aligned.json (default: the only/longest one)
  "face": [630, 560],                       optional: face center in the 1080x1920 frame (default: pick_frames' take.json)
  "accent": "#4EF03E", "accent_ink": "#070B16",   the client's color (buttons, labels); El Taller yellow stays for the rest
  "fixes": [["sea", "Seba"], ["mercado pago", "Mercado Pago"]],   caption corrections (heard → written)
  "tag": "EMPIEZA AQUÍ", "endcard": "EMPIEZA AQUÍ",   optional: replace "EPISODIO 5" in the top tag / end card (pinned row)
  "reels": [{
    "id": "01-el-caso", "act": "1/3",          id = file name, act = the tag ("1/4"); plan_episode sets both
    "nombre": "EL CASO", "para": "…", "idea": "…",   optional: the reel's name, who it's for, its one idea (the review shows them)
    "pieces": [{"t": 112.8, "say": "siempre me causa gracia que el Seba maneja todo con una planilla Excel"}, ...],
              # t = about when it's said in the take (±40 s); say = the exact words, in order. Pauses/"em" are cut.
    "graphics": [
      {"type": "title",   "lines": ["TODO UN GIMNASIO", "*EN UN EXCEL*"], "until": "planilla"},
      {"type": "callout", "at": "todo el negocio", "through": "su cabeza", "lines": ["TODO EL NEGOCIO", "*EN SU CABEZA*"]},
      {"type": "stamp",   "at": "cinco años", "for": 2.5, "text": "5 AÑOS"},
      {"type": "image",   "at": "aquí tenemos", "until": "requiere", "src": "assets/ig-profile.png", "label": "@ENDEMICO.FT"},
      {"type": "phone",   "at": "la persona viene", "until": "perfectamente", "src": "assets/rec/checkin.mp4", "from": 1.0,
                          "label": "EL ALUMNO", "keys": [["pum", "whatsapp code"]], "w": 480},   w = screen width (bigger = more readable)
      {"type": "laptop",  "at": ..., "src": "assets/rec/planilla.mp4", "from": 10.4, "crop": [30, 120, 1400, 920], "url": "x.jpfraneto.com"},
      {"type": "broll",   "at": ..., "src": "raw/2026-10-21_x/IMG_4213.MOV", "from": 3.0, "label": ["SEBA", "KINESIÓLOGO"]},
      {"type": "button",  "at": "no existe", "for": 1.5, "text": "PAGAR $100.000", "struck": "botón"}
    ],
    "cta": ["Sigue en 2/3:", "*El nudo →*"]           optional (default: estilo.json "cta"; rows of 3: by act)
  }]
}
<episode>/encuadre.json (optional, tools/encuadre.py): {"hide": [[x0, y0, x1, y1]], "avoid": [[s0, s1]]} = what must
never be in frame (1080x1920 px) and seconds of the take that can't be used; each cut gets its own crop (Ep. 09: the beer).
Anchors: "at" = when the phrase starts ("start" = 0). End: "until" = when that phrase starts · "through" = when it ends ·
"for" = seconds · default: the next graphic's start (max 4 s). A repeated phrase takes "#2", "#3" ("planilla#2").
"*WORD*" in lines = highlighted (yellow). Phrases are searched only inside this reel's own words.
"""
import difflib, json, os, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import reelkit as rk
from estilo import E as ESTILO

PLAN = os.environ.get("PLAN", "reels.json")     # another plan file → its own output folder (stories: historias.json)

# From el-taller/estilo.json (tools/estilo.py has the defaults)
FILLERS = set(ESTILO["reels"]["muletillas"])
DEFAULT_CTA = {a["n"]: a["cta"] for a in ESTILO["actos"]}   # rows of 3 (Ep. 05–06)
SFX = {k: [(0, v)] if isinstance(v, str) else [tuple(x) for x in v] for k, v in ESTILO["reels"]["sonidos"].items()}


class PlanError(Exception):
    pass


def styled(lines):
    """["A", "*B*"] → [("A", False), ("B", True)]"""
    return [(s.strip("*"), s.startswith("*") and s.endswith("*")) for s in lines]


# ------------------------------------------------------------------ loading
def load(ep):
    path = f"{ep}/{PLAN}"
    if not os.path.exists(path):
        raise SystemExit(f"falta {os.path.relpath(path, ROOT)} (lo escribe tools/plan_episode.py)")
    plan = json.load(open(path))
    take = plan.get("take")
    if not take:
        al = sorted(glob.glob(f"{ep}/transcript/*.aligned.json"), key=os.path.getsize)
        if not al:
            raise SystemExit("no hay transcript/*.aligned.json: corre tools/ingest.py primero")
        take = os.path.basename(al[-1]).split(".")[0]
    plan["_take"] = take
    plan["_words"] = json.load(open(f"{ep}/transcript/{take}.aligned.json"))
    for w in plan["_words"]:
        w.setdefault("n", rk.norm(w["t"]))
    return plan


def find_raw(ep, take):
    sys.path.insert(0, HERE)
    from ingest import raw_dir
    for ext in ("MOV", "mov", "MP4", "mp4"):
        p = f"{raw_dir(ep)}/{take}.{ext}"
        if os.path.exists(p):
            return p
    raise SystemExit(f"no encuentro la toma {take} en {os.path.relpath(raw_dir(ep), ROOT)}/")


# ------------------------------------------------------------ resolving text
def resolve_piece(words, piece):
    """{"t", "say"} → (first word's start, last word's start), + a warning if the match wasn't exact."""
    toks = [t for t in rk.norm(piece["say"]).split() if t not in FILLERS]
    if not toks:
        raise PlanError(f"pieza vacía: {piece}")
    near = float(piece.get("t", 0))
    cand = [i for i, w in enumerate(words) if abs(w["a"] - near) <= 45]
    if not cand:
        raise PlanError(f"no hay palabras cerca de t={near}: {piece['say']!r}")
    lo, hi = cand[0], cand[-1]
    seq = [(i, w["n"]) for i, w in enumerate(words[lo:hi + 1], lo) if w["n"] not in FILLERS]
    ns = [n for _, n in seq]
    L = len(toks)
    hits = [k for k in range(len(ns) - L + 1) if ns[k:k + L] == toks]
    if hits:
        k = min(hits, key=lambda k: abs(words[seq[k][0]]["a"] - near))
        return (words[seq[k][0]]["a"], words[seq[k + L - 1][0]]["a"]), None
    # fuzzy: best window of about the same length
    best = (0, None)
    for k in range(len(ns)):
        for m in (L - 2, L - 1, L, L + 1, L + 2):
            if m < 1 or k + m > len(ns):
                continue
            r = difflib.SequenceMatcher(None, ns[k:k + m], toks, autojunk=False).ratio()
            if r > best[0] or (r == best[0] and best[1] and abs(words[seq[k][0]]["a"] - near) <
                                                            abs(words[seq[best[1][0]][0]]["a"] - near)):
                best = (r, (k, m))
    r, km = best
    if r < 0.72 or km is None:
        raise PlanError(f"no encuentro cerca de t={near}: {piece['say']!r} (mejor parecido {r:.0%})")
    k, m = km
    heard = " ".join(ns[k:k + m])
    return (words[seq[k][0]]["a"], words[seq[k + m - 1][0]]["a"]), f"aprox. {r:.0%}: dijo «{heard}»"


def reel_words(words, spans):
    """The words this reel keeps, in reel order, with their source times."""
    out = []
    for a, b in spans:
        out += [w for w in words if a - 0.03 <= w["a"] <= b + 0.03 and w["n"] not in FILLERS]
    return out


def find_anchor(rw, phrase):
    """'planilla#2' → (first word, last word) of the 2nd occurrence inside the reel."""
    occ = 1
    if "#" in phrase:
        phrase, n = phrase.rsplit("#", 1)
        occ = int(n)
    toks = rk.norm(phrase).split()
    ns = [w["n"] for w in rw]
    hits = [k for k in range(len(ns) - len(toks) + 1) if ns[k:k + len(toks)] == toks]
    if len(hits) < occ:
        raise PlanError(f"«{phrase}» no se dice en este reel" + (f" {occ} veces" if occ > 1 else ""))
    k = hits[occ - 1]
    return rw[k], rw[k + len(toks) - 1]


def eventos(video):
    """A screen recording's named moments (<video>.json "events": [[seconds, name], …]) → {name: seconds}."""
    j = video.rsplit(".", 1)[0] + ".json"
    return {name: s for s, name in json.load(open(j)).get("events", [])} if os.path.exists(j) else {}


def evento(ev, name):
    """Seconds of an event: a number, an exact name, or a fragment that appears in exactly one name."""
    if not isinstance(name, str):
        return float(name)
    if name in ev:
        return float(ev[name])
    try:
        return float(name)
    except ValueError:
        pass
    hits = [k for k in ev if rk.norm(name) in rk.norm(k)]
    if len(hits) == 1:
        return float(ev[hits[0]])
    raise PlanError(f"evento {name!r}: {'ninguno coincide' if not hits else 'coincide con varios: ' + ', '.join(hits)}"
                    f" (eventos: {', '.join(ev) or 'esta grabación no tiene'})")


def resolve_reel(words, reel, ep=None):
    """Source-time version of a reel: spans + every graphic's (at, end) in source words. Raises PlanError.
    With ep, also checks that each screen recording's key events exist."""
    spans, warns = [], []
    for p in reel["pieces"]:
        span, w = resolve_piece(words, p)
        spans.append(span)
        if w:
            warns.append(f"pieza t={p.get('t')}: {w}")
    rw = reel_words(words, spans)
    errs = []
    if ep and os.path.exists(f"{ep}/encuadre.json"):
        for s0, s1 in json.load(open(f"{ep}/encuadre.json")).get("avoid", []):
            for (a, b), p in zip(spans, reel["pieces"]):
                if a < s1 and s0 < b + 0.6:
                    errs.append(f"pieza t={p.get('t')} cae en {s0}–{s1} s, que no se puede mostrar (encuadre.json): "
                                "usa otras palabras")
    for g in reel.get("graphics", []):
        for key in ("at", "until", "through", "struck"):
            v = g.get(key)
            if isinstance(v, str) and v not in ("start", "end"):
                try:
                    find_anchor(rw, v)
                except PlanError as e:
                    errs.append(f"{g['type']} {key}: {e}")
        ev = eventos(os.path.join(ep, g["src"])) if ep and g.get("keys") and g.get("src") else {}
        for k in g.get("keys", []):
            try:
                find_anchor(rw, k[0])
                if ep:
                    evento(ev, k[1])
            except PlanError as e:
                errs.append(f"{g['type']} keys: {e}")
    return spans, rw, warns, errs


# ---------------------------------------------------------- building a reel
def make_spec(ep, plan, reel, words):
    import autokit as ak
    import ep02kit as ek
    spans, rw, warns, errs = resolve_reel(words, reel)
    if errs:
        raise PlanError("; ".join(errs))
    pieces = [(a, b) for a, b in spans]
    spans_src = spans
    import sobrio as sb
    fixed = {pat[0]: rep[0].split()[0] for pat, rep in fixes(plan) if len(pat) == 1 and rep[0]}   # beta → veta

    def build(T, A0):
        A = lambda word, src: A0(fixed.get(rk.norm(word), word), src)   # captions carry the fixed spelling
        dur = T.__self__.duration if hasattr(T, "__self__") else None

        def t_start(v):
            if v == "start":
                return 0.0
            if v == "end":
                return dur
            w0, _ = find_anchor(rw, v)
            return A(w0["t"], w0["a"])

        def t_end(v):
            if v == "end":
                return dur
            _, w1 = find_anchor(rw, v)
            try:
                return T(w1["b"]) + 0.35
            except ValueError:
                return A(w1["t"], w1["a"]) + (w1["b"] - w1["a"]) + 0.35

        gs = reel.get("graphics", [])
        starts = [t_start(g.get("at", "start")) for g in gs]
        spans = []
        for i, g in enumerate(gs):
            t0 = max(0.0, starts[i] - 0.1)
            if "until" in g:
                t1 = t_start(g["until"]) - 0.05
            elif "through" in g:
                t1 = t_end(g["through"])
            elif "for" in g:
                t1 = t0 + float(g["for"])
            else:
                later = [s for s in starts[i + 1:] if s > t0 + 0.5]
                t1 = min(later[0] - 0.05, t0 + 4.0) if later else t0 + 3.0
            spans.append([t0, min(max(t1, t0 + 0.8), dur + 0.8)])
        # big text in the top band (title, callout, stamps up there) never overlaps: the next one replaces the last
        top = sorted((i for i, g in enumerate(gs) if g["type"] in ("title", "callout")
                      or (g["type"] == "stamp" and g.get("y", 420) < 700)), key=lambda i: spans[i][0])
        for i, j in zip(top, top[1:]):
            if spans[i][1] > spans[j][0] - 0.05:
                spans[i][1] = max(spans[i][0] + 0.5, spans[j][0] - 0.05)
        elems, sfx = [], []
        for i, g in enumerate(gs):
            t0, t1 = spans[i]
            typ = g["type"]
            src = lambda p: p if os.path.isabs(p) else (f"{ep}/{p}" if os.path.exists(f"{ep}/{p}") else f"{ROOT}/{p}")
            if typ == "title":
                elems.append(rk.Title(t0, t1, styled(g["lines"]), cy=g.get("y", 430), size=g.get("size", 100)))
            elif typ == "callout":
                times = None
                lines = [(s.strip("*"), "y" if s.startswith("*") else "w") for s in g["lines"]]
                if g.get("pop"):   # one phrase per line; missing ones follow 0.35 s after the previous line
                    times = [t_start(p) - 0.1 for p in g["pop"][:len(lines)]]
                    times = [max(t0, x) for x in times]
                    while len(times) < len(lines):
                        times.append((times[-1] if times else t0) + 0.35)
                elems.append(rk.Callout(t0, t1, lines, cy=g.get("y", 400), size=g.get("size", 100), times=times))
                n = len(lines)
                sfx += [(t0, "pop")] + ([(times[-1] if times else t0 + 0.35 * (n - 1), "hit")] if n > 1 else [])
                continue
            elif typ == "stamp":
                col = ak.ACCENT if g.get("accent", True) else rk.YELLOW
                elems.append(ek.Stamps([(t0 + 0.1, g["text"], g.get("angle", -5), g.get("x", 540), g.get("y", 420), col)],
                                       t1, size=g.get("size", 80)))
            elif typ == "image":
                elems.append(ek.Card(t0, t1, src(g["src"]), width=g.get("width", 920), cy=g.get("y", 800),
                                     view_h=g.get("view_h"), label=g.get("label")))
            elif typ in ("phone", "laptop"):
                video = src(g["src"])
                ev = eventos(video)
                keys = [(t0, float(g.get("from", 0)))]
                for phrase, at_src in g.get("keys", []):
                    keys.append((t_start(phrase) - 0.1, evento(ev, at_src)))
                if typ == "phone":
                    elems.append(ak.PhoneVideo(t0, t1, video, keys, screen_w=g.get("w", 480), cy=g.get("y", 850), label=g.get("label")))
                else:
                    elems.append(ak.LaptopVideo(t0, t1, video, keys, crop=g.get("crop"), cy=g.get("y", 760),
                                                label=g.get("label"), url=g.get("url", "")))
            elif typ == "broll":
                elems.append(ak.BRoll(t0, t1, src(g["src"]), float(g.get("from", 0)), focus=tuple(g.get("focus", (0.5, 0.45))),
                                      label=g.get("label")))
            elif typ == "button":
                st = t_start(g["struck"]) - 0.1 if g.get("struck") else None
                elems.append(ak.Button(t0, t1, g["text"], cy=g.get("y", 560), struck_t=st))
                if st:
                    sfx.append((st, "hit"))
            else:
                raise PlanError(f"tipo de gráfico desconocido: {typ}")
            sfx += [(t0 + dt, k) for dt, k in SFX[typ]]
        if sb.on(plan):                    # the raw look: the lower third + the English, word by word
            sb_words = [w for w in words if w["n"] not in FILLERS]
            elems = [sb.Zocalo(), sb.Ingles(sb.ingles(reel["pieces"], spans_src, sb_words, T)), *elems]
            sfx = []
        build.sfx = sfx
        return elems

    def sfx(T, A):
        return getattr(build, "sfx", [])

    cta = reel.get("cta") or DEFAULT_CTA.get(reel["act"]) or ESTILO["cta"]
    return dict(act=reel["act"], pieces=pieces, tail=reel.get("tail", 0.8), cta=styled(cta), build=build, sfx=sfx), warns


def fixes(plan):
    out = []
    for heard, written in plan.get("fixes", []):
        pat = rk.norm(heard).split()
        rep = written.split()
        if len(rep) > len(pat):
            rep = rep[:len(pat) - 1] + [" ".join(rep[len(pat) - 1:])]
        while len(rep) < len(pat):
            rep.append("")
        out.append((pat, rep))
    return out


def episode(ep, plan, take):
    import taller
    import autokit as ak
    ak.WORK = f"{ep}/.work/autokit"
    ak.ACCENT = ak.hex_rgba(plan.get("accent", ESTILO["serie"]["color"]))
    ak.INK = ak.hex_rgba(plan.get("accent_ink", "#111111"))
    nn = plan.get("ep") or os.path.basename(ep)[2:4]
    name = plan.get("name") or os.path.basename(ep)[5:].replace("-", " ").title()
    face = plan.get("face")
    if not face and os.path.exists(f"{ep}/cover/frames/take.json"):
        face = json.load(open(f"{ep}/cover/frames/take.json")).get("face")
    return taller.Episode(
        src=find_raw(ep, take), proxy=f"{ep}/proxy/{take}.proxy.mp4", wav=f"{ep}/transcript/{take}.wav",
        words=f"{ep}/transcript/{take}.aligned.json", work=os.environ.get("REEL_SCRATCH", f"{ep}/.work"),
        out_dir=f"{ep}/{'reels' if PLAN == 'reels.json' else os.path.splitext(PLAN)[0]}", slug=f"el-taller-ep{nn}", tag=plan.get("tag") or f"EPISODIO {int(nn)}",
        endcard=plan.get("endcard") or f"EPISODIO {int(nn)} · {name.upper()}", face=tuple(face or (630, 560)),
        zooms=plan.get("zooms", ESTILO["reels"]["zooms"]), captions_on_top=True, fixes=fixes(plan),
        crop_fn=encuadre_fn(ep, plan, face), **sobrio_kw(plan))


def sobrio_kw(plan):
    """estilo.json reels.modo = "sobrio": no tag, one-word captions, a plain end, no sound effects (tools/sobrio.py)."""
    import sobrio as sb
    if not sb.on(plan):
        return {}
    return dict(captions_kw=sb.captions_kw(), tag_fn=sb.Nada, endcard_fn=sb.Final, sfx_fn=sb.silencio,
                end_dur=sb.S.get("final", 2.6))


def encuadre_fn(ep, plan, face):
    """<episode>/encuadre.json (tools/encuadre.py) → a crop per cut that keeps its "hide" boxes out of frame."""
    import encuadre
    rule = encuadre.rule(ep)
    if not rule:
        return None
    faces = encuadre.load_track(ep)
    if faces is None:
        encuadre.track(ep)
        faces = encuadre.load_track(ep)
    return lambda a, b, z: encuadre.crop(rule, faces, a, b, z, tuple(face or (630, 560)))


def check(ep, plan):
    """Resolve everything; print each reel as a script. Returns a list of problems (empty = renderable)."""
    words, problems = plan["_words"], []
    for reel in plan["reels"]:
        try:
            spans, rw, warns, errs = resolve_reel(words, reel, ep)
        except PlanError as e:
            problems.append(f"{reel['id']}: {e}")
            print(f"\n✗ {reel['id']}: {e}")
            continue
        secs = sum(b - a for a, b in spans) + 0.25 * len(spans)
        print(f"\n{'✓' if not errs else '✗'} {reel['id']} ({reel['act']}) · {len(spans)} piezas · ~{secs:.0f} s de voz")
        for w in warns:
            print("   ~", w)
        for e in errs:
            print("   ✗", e)
            problems.append(f"{reel['id']}: {e}")
        print("   «" + " ".join(w["t"] for w in rw)[:400] + ("…»" if len(rw) > 60 else "»"))
        for g in reel.get("graphics", []):
            txt = " / ".join(g.get("lines", [])) or g.get("text") or g.get("src", "")
            print(f"   · {g['type']:<8} @«{g.get('at', 'start')}» {txt}")
    return problems


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    ep = os.path.abspath(args[0])
    plan = load(ep)
    if "--check" in sys.argv:
        probs = check(ep, plan)
        print("\nOK: se puede renderizar" if not probs else f"\n{len(probs)} problema(s)")
        sys.exit(1 if probs else 0)
    import taller
    E = episode(ep, plan, plan["_take"])
    reels = {}
    for reel in plan["reels"]:
        if args[1:] and reel["id"] not in args[1:]:
            continue
        spec, warns = make_spec(ep, plan, reel, plan["_words"])
        for w in warns:
            print(f"[{reel['id']}] ~ {w}")
        reels[reel["id"]] = spec
    sys.argv = [sys.argv[0]]       # taller.main reads reel ids from argv
    taller.main(E, reels)


if __name__ == "__main__":
    main()
