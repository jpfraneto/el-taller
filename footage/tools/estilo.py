"""estilo: how future El Taller reels and covers look, read from el-taller/estilo.json.

Change the style by editing that JSON (or asking Claude to), not the code. Every key is optional: what the
file leaves out falls back to DEFAULT below, so a missing or partial file renders exactly like before.

    from estilo import E, rgba
    E["serie"]["color"]            → "#FFD23F"
    rgba(E["serie"]["color"])      → (255, 210, 63, 255)

ESTILO=/path/to/other.json points the whole pipeline at another style (used by `episode.py <ep> muestra`).
What lives where: estilo.json = the look and fixed texts · TASTE.md = editorial judgement the planner reads ·
reels.json / cover.json = one episode · code = new capabilities (a new graphic type, a new layout).

Whose reels (2026-11-10): the pipeline works for one business at a time, its "taller": the folder that holds its
estilo.json, TASTE.md (+ optional NARRATIVE.md) and its episodes (epNN-slug/). For JP it's footage/el-taller/; for an
owner, ~/ElTaller/<negocio>/redes/. It is TALLER_DIR if set, else the nearest folder above the episode given on the
command line that has an estilo.json, else el-taller/. Raw takes: TALLER_RAW, else footage/raw (JP) or <taller>/raw.
"""
import copy, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
JP_TALLER = f"{ROOT}/el-taller"


def taller_de(path):
    """The taller an episode belongs to: the nearest folder at or above it with an estilo.json (None if none)."""
    d = os.path.abspath(path)
    while True:
        if os.path.isfile(os.path.join(d, "estilo.json")):
            return d
        up = os.path.dirname(d)
        if up == d:
            return None
        d = up


def _taller():
    if os.environ.get("TALLER_DIR"):
        return os.path.abspath(os.path.expanduser(os.environ["TALLER_DIR"]))
    for a in sys.argv[1:]:                        # a tool run on an episode: that episode's taller
        if not a.startswith("-") and os.path.isdir(a):
            t = taller_de(a)
            if t:
                return t
    return JP_TALLER


TALLER = _taller()
RAW = os.path.abspath(os.path.expanduser(os.environ.get("TALLER_RAW") or
                                         (f"{ROOT}/raw" if TALLER == JP_TALLER else f"{TALLER}/raw")))
PATH = os.environ.get("ESTILO") or f"{TALLER}/estilo.json"

DEFAULT = {
    "serie": {
        "nombre": "EL TALLER",
        "handle": "@eltallerconjp",
        "tagline": "Cuéntame de tu negocio y te doy ideas",
        "color": "#FFD23F",
    },
    "actos": [
        {"n": "1/3", "nombre": "EL CASO", "cta": ["Sigue en 2/3:", "*El nudo →*"]},
        {"n": "2/3", "nombre": "EL NUDO", "cta": ["Sigue en 3/3:", "*La propuesta →*"]},
        {"n": "3/3", "nombre": "LA PROPUESTA", "cta": ["¿Qué haría tu negocio", "*con algo así?*", "Coméntalo abajo"]},
    ],
    "reels": {
        "segundos_de_voz": [30, 60],
        "zooms": [1.15, 1.6, 1.3, 1.6, 1.15, 1.45],
        "muletillas": ["eh", "em", "emm", "mm", "mmm", "ehh", "ah", "ehm"],
        "sonidos": {"title": "hit", "callout": "pop", "stamp": "stamp", "image": "whoosh",
                    "phone": "swish", "laptop": "whoosh", "broll": "swish", "button": "pop"},
        "color_grade": ("eq=contrast=1.07:saturation=1.14:gamma=0.97,"
                        "colorbalance=rs=0.03:gs=0.0:bs=-0.04:rm=0.02:bm=-0.03:rh=0.02:bh=-0.02,"
                        "vignette=angle=PI/5,"
                        "noise=alls=5:allf=t"),
    },
    "portadas": {
        "fondo": "el-taller/brand/taller-vacio.jpg",
        "kicker": "EL TALLER · EP. {ep}",
    },
    # The end card when a reel doesn't say otherwise (rows of 3 used actos[].cta instead).
    "cta": ["¿Qué haría tu negocio", "*con algo así?*", "Coméntalo abajo"],
    # One take → 1..max_reels reels, published one per slot: each day at each of `horas` (in `zona`), in order.
    "publicacion": {
        "max_reels": 5,
        "horas": ["19:00"],
        "zona": "America/Santiago",
        "instagram_env": "~/.config/eltaller/instagram.env",
    },
}


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if k.startswith("_"):
            continue                      # "_ayuda" and other notes for humans
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load(path=None):
    path = path or PATH
    if not os.path.exists(path):
        return copy.deepcopy(DEFAULT)
    return _merge(DEFAULT, json.load(open(path)))


def rgba(s, a=255):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def acto(n):
    """The act dict for "1/3" / "2/3" / "3/3"."""
    return next(a for a in E["actos"] if a["n"] == n)


def path(p):
    """A path from estilo.json: relative ones are relative to footage/ (JP), or to the taller (anyone else)."""
    p = os.path.expanduser(p)
    if os.path.isabs(p):
        return p
    mine = os.path.join(TALLER, p)
    return mine if TALLER != JP_TALLER and os.path.exists(mine) else os.path.join(ROOT, p)


# Fonts: SF Pro if this Mac has it (JP), else Inter (open license, installed by os/reels/instalar.sh). SF Pro's license
# only covers mock-ups of Apple interfaces, so it is never installed on an owner's Mac. estilo.json "fuentes" can point
# to another family: {"dir": "/path", "patron": "Family-{peso}.otf"} with the same five weights.
INTER = {"Black": "Black", "Heavy": "ExtraBold", "Bold": "Bold", "Semibold": "SemiBold", "Medium": "Medium"}


def fuente(peso):
    """Path of the font file for a weight: Black · Heavy · Bold · Semibold · Medium."""
    f = E.get("fuentes") or {}
    cands = []
    if isinstance(f, dict) and f.get("dir"):
        cands.append(os.path.join(os.path.expanduser(f["dir"]), f.get("patron", "{peso}.otf").format(peso=peso)))
    if f != "inter":                              # "fuentes": "inter" = always Inter, even on a Mac with SF Pro
        cands.append(f"/Library/Fonts/SF-Pro-Display-{peso}.otf")
    for d in (os.environ.get("FUENTES_DIR"), os.path.expanduser("~/ElTaller/.reels/fuentes"), f"{HERE}/fuentes"):
        if d:
            cands.append(os.path.join(d, f"Inter-{INTER.get(peso, peso)}.otf"))
    for c in cands:
        if os.path.exists(c):
            return c
    raise SystemExit(f"falta la fuente {peso}: instala SF Pro o Inter (os/reels/instalar.sh)")


def agenda(n, desde=None, ocupados=()):
    """The next n publishing slots (aware datetimes) from `desde` (default now), skipping `ocupados`."""
    import datetime
    from zoneinfo import ZoneInfo
    pub = E["publicacion"]
    tz = ZoneInfo(pub["zona"])
    now = (desde or datetime.datetime.now(tz)).astimezone(tz)
    horas = sorted(datetime.time.fromisoformat(h) for h in pub["horas"])
    taken = {o.astimezone(tz).replace(second=0, microsecond=0) for o in ocupados}
    out, day = [], now.date()
    while len(out) < n:
        for h in horas:
            t = datetime.datetime.combine(day, h, tz)
            if t > now and t not in taken and len(out) < n:
                out.append(t)
        day += datetime.timedelta(days=1)
    return out


E = load()
