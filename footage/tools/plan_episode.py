#!/usr/bin/env python3
"""plan_episode: Claude reads the take's transcript and plans its reels: 1 to 5, as many as the take really has
(PIPELINE.md stage 4; JP 2026-11-10: "N but up to 5 with a clear schedule of posting").

    tools/.venv/bin/python tools/plan_episode.py el-taller/ep05-slug                    first plan
    tools/.venv/bin/python tools/plan_episode.py el-taller/ep05-slug --feedback "…"     re-plan with JP's notes

Reads: transcript/<take>.aligned.json (exact words), the episode README, the taller's TASTE.md (accumulated taste) and
NARRATIVE.md (voice, optional) and estilo.json (estilo.TALLER: whose reels these are), the assets on disk, and Ep. 04
as a worked example.
Writes:
  reels.json        the N reels in publishing order: pieces (what is said) + graphics (what is shown) → autoreel.py
                    ids "01-<slug>" …, act "1/N" …
  cover/cover.json  N cover hooks + names (frames come from pick_frames)
  publish.json      the N posts in publishing order, captions EMPTY: JP writes them on the review page (2026-11-13:
                    "no quiero que mis posts estén escritos con IA… quiero escribir"); "cuando" = `episode.py <ep> publish`
  plan-notes.md     what Claude chose and why, and what's missing (assets it wished it had)
Every phrase is checked against the transcript (autoreel --check); on errors Claude gets them back and fixes them.
Uses `claude -p` (JP's Claude Code login, no API key needed). Model: PLAN_MODEL (default opus).
"""
import datetime, glob, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
import autoreel
from estilo import E as ESTILO, PATH as ESTILO_PATH, TALLER, RAW
MAX = max(1, min(5, int(ESTILO["publicacion"].get("max_reels", 5))))

MODEL = os.environ.get("PLAN_MODEL", "opus")

SCHEMA = {
    "type": "object",
    "required": ["name", "handle", "accent", "fixes", "reels", "notes"],
    "properties": {
        "name": {"type": "string", "description": "the business's name as it should appear on the end card"},
        "handle": {"type": "string", "description": "their Instagram handle, no @"},
        "accent": {"type": "string", "description": "their brand color, #RRGGBB"},
        "accent_ink": {"type": "string", "description": "text color on top of the accent, #RRGGBB"},
        "fixes": {"type": "array", "items": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 2}},
        "reels": {"type": "array", "minItems": 1, "maxItems": MAX,
                  "description": "in publishing order: the first one is published first", "items": {
            "type": "object", "required": ["slug", "nombre", "para", "idea", "hook", "pieces", "graphics", "cta"],
            "properties": {
                "slug": {"type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+){0,4}$",
                         "description": "2-4 words, lowercase ascii, for the file name (e.g. tu-propio-dominio)"},
                "nombre": {"type": "string", "description": "the reel's name on its cover, 1-3 words, CAPS (e.g. TU DOMINIO)"},
                "para": {"type": "string", "description": "who exactly this reel is for, one line, Spanish"},
                "idea": {"type": "string", "description": "the one thing it says, one sentence, Spanish"},
                "hook": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
                "pieces": {"type": "array", "items": {"type": "object", "required": ["t", "say"],
                                                      "properties": {"t": {"type": "number"}, "say": {"type": "string"}}}},
                "graphics": {"type": "array", "items": {"type": "object", "required": ["type"], "properties": {
                    "type": {"type": "string",
                             "enum": ["title", "callout", "stamp", "image", "phone", "laptop", "broll", "button"]}}}},
                "cta": {"type": "array", "items": {"type": "string"}},
            }}},
        "notes": {"type": "string", "description": "for JP, in Spanish: the idea of each reel, doubts, missing assets"},
    },
}

SYSTEM = f"""You are the editor of "{ESTILO['serie']['nombre']}" ({ESTILO['serie']['handle']}), an Instagram account (Spanish).
The owner records one long take; you turn it into between 1 and {MAX} reels: as many as the take really has, not more.
Each reel is for one specific viewer and says exactly one thing, nothing else: simple, direct, precise. Fewer and
sharper beats more. Put them in the order they should be published (the strongest first); they go out one per day.
For each: graphics and a cover hook (never a caption: the owner writes those). A program renders exactly what you write, so every
"say" must be words the owner really says in the transcript (copy them, in order, from one stretch of the take) and every
anchor ("at", "until", "through", "struck", "keys", "pop") must be words that are said inside that same reel.
Write all on-screen text in Chilean Spanish. Anything listed in the README under "Private, never in a reel"
must not appear in any piece or graphic, even if it is said in the take. Answer only with the JSON object."""


def lines_transcript(words):
    """The aligned words as short lines '[123.4] text' (what Claude reads; same tokens the checker matches)."""
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = (nxt["a"] - w["b"]) if nxt else 9
        end = w["t"].rstrip()[-1:] in ".?!" and len(cur) >= 5
        if not nxt or gap > 0.7 or end or len(cur) >= 22:
            out.append(f"[{cur[0]['a']:.1f}] " + " ".join(x["t"] for x in cur))
            cur = []
    return "\n".join(out)


def duration(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def inventory(ep):
    """Everything the reels can show: images, screen recordings (+ their event names), B-roll clips.
    Returns (text, [(label, path, kind)]) so the visual ones can go on a contact sheet."""
    out, visual = [], []
    for p in sorted(glob.glob(f"{ep}/assets/**/*", recursive=True)):
        rel = os.path.relpath(p, ep)
        ext = p.lower().rsplit(".", 1)[-1]
        if ext in ("png", "jpg", "jpeg"):
            from PIL import Image
            w, h = Image.open(p).size
            visual.append((rel, p, "image"))
            out.append(f"#{len(visual):<3} image  {rel}  ({w}x{h})")
        elif ext in ("mp4", "mov") and "/ig-reels/" not in p:
            visual.append((rel, p, "video"))
            line = f"#{len(visual):<3} video  {rel}  ({duration(p):.1f} s)"
            ev = p.rsplit(".", 1)[0] + ".json"
            if os.path.exists(ev):
                evs = json.load(open(ev)).get("events", [])
                line += "  events: " + ", ".join(f"{n!r}@{t:.1f}" for t, n in evs)
            out.append(line)
    # B-roll: raw/ folders of this business that are not the take itself
    slug = os.path.basename(ep)[5:]
    for d in sorted(glob.glob(f"{RAW}/*{slug}*")):
        if "_el-taller-ep" in os.path.basename(d):
            continue
        for p in sorted(glob.glob(f"{d}/*.[mM][oO4][vV4]")):
            rel = os.path.relpath(p, ROOT)
            visual.append((rel, p, "video"))
            out.append(f"#{len(visual):<3} broll  {rel}  ({duration(p):.1f} s)")
    return "\n".join(out) or "(no assets yet)", visual


def contact_sheets(ep, visual, per=20):
    """One labeled thumbnail strip per asset (videos: 3 frames), so Claude can see what each clip shows."""
    from PIL import Image, ImageDraw, ImageFont
    d = f"{ep}/.work/plan"
    os.makedirs(d, exist_ok=True)
    f = ImageFont.truetype(__import__("estilo").fuente("Bold"), 22)
    tw, th = 180, 320
    key = json.dumps([(rel, os.path.getmtime(p)) for rel, p, _ in visual])
    if read(f"{d}/assets.key") == key:
        return sorted(glob.glob(f"{d}/assets-*.jpg"))
    for old in glob.glob(f"{d}/assets-*.jpg"):
        os.remove(old)
    sheets = []
    for s0 in range(0, len(visual), per):
        chunk = visual[s0:s0 + per]
        cols = 2
        sheet = Image.new("RGB", (cols * (3 * tw + 20), ((len(chunk) + cols - 1) // cols) * (th + 40)), (20, 20, 20))
        dr = ImageDraw.Draw(sheet)
        for k, (rel, p, kind) in enumerate(chunk):
            x0, y0 = (k % cols) * (3 * tw + 20), (k // cols) * (th + 40)
            dr.text((x0 + 6, y0 + 6), f"#{s0 + k + 1}  {os.path.basename(rel)}", font=f, fill=(255, 210, 63))
            thumbs = []
            if kind == "image":
                thumbs = [Image.open(p).convert("RGB")]
            else:
                dur = duration(p) or 1
                for q in (0.15, 0.5, 0.85):
                    tmp = f"{d}/_t.jpg"
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{dur * q:.2f}", "-i", p, "-frames:v", "1",
                                    "-vf", "scale=360:-2", tmp], check=False)
                    if os.path.exists(tmp):
                        thumbs.append(Image.open(tmp).convert("RGB")); os.remove(tmp)
            for j, im in enumerate(thumbs[:3]):
                im.thumbnail((tw * (3 if kind == "image" and im.width > im.height else 1) - 6, th))
                sheet.paste(im, (x0 + j * tw, y0 + 36))
        path = f"{d}/assets-{s0 // per + 1}.jpg"
        sheet.save(path, quality=80)
        sheets.append(path)
    open(f"{d}/assets.key", "w").write(key)
    return sheets


def example():
    """Ep. 04, approved by JP, in today's shape (it had 3 reels because rows of 3 were the rule then; N is free now)."""
    ex = json.load(open(f"{HERE}/plan/example-ep04.reels.json"))
    names = {"1/3": "EL CASO", "2/3": "EL NUDO", "3/3": "LA PROPUESTA"}
    for r in ex.get("reels", []):
        rid = r.pop("id", ""); act = r.pop("act", "")
        r.setdefault("slug", rid[3:] or "reel")
        r.setdefault("nombre", names.get(act, "REEL"))
        r.pop("caption", None)
    ex.pop("ep", None)
    return json.dumps(ex, ensure_ascii=False, indent=1)


def read(p, default=""):
    return open(p).read() if os.path.exists(p) else default


def prompt(ep, plan_words, feedback=None, previous=None, errors=None):
    nn = os.path.basename(ep)[2:4]
    inv, visual = inventory(ep)
    sheets = contact_sheets(ep, visual) if visual else []
    if sheets:
        inv += ("\n\nWhat they look like (numbered like the list above): use the Read tool on " +
                ", ".join(sheets) + " before choosing B-roll or images. Pick clips that show what JP is saying.")
    cover = json.load(open(f"{ep}/cover/cover.json")) if os.path.exists(f"{ep}/cover/cover.json") else {}
    parts = [
        f"# What you produce\nA JSON object: the business name/handle/brand color, caption fixes, and 1–{MAX} reels in "
        "publishing order (each with who it's for, its one idea and its cover hook).",
        "## Reel format (rendered by tools/autoreel.py; its documentation):\n" + autoreel.__doc__,
        "## How the owner wants it (TASTE.md: follow it, it is accumulated feedback; newer rules win)\n" + read(f"{TALLER}/TASTE.md"),
        "## What this taller is and where it's going (EL-TALLER.md, optional)\n" + read(f"{TALLER}/EL-TALLER.md", "(none)"),
        "## The series (NARRATIVE.md)\n" + read(f"{TALLER}/NARRATIVE.md", "(none)"),
        "## Style (estilo.json: fixed look and texts; follow it. Each reel's cta = this default unless the reel clearly "
        "needs another)\n" + json.dumps({"serie": ESTILO["serie"], "cta": ESTILO["cta"]}, ensure_ascii=False),
        "## Worked example: Ep. 04 Endémico, as approved by JP (graphics simplified to the generic types)\n" + example(),
        f"# This episode: Ep. {nn} ({os.path.basename(ep)})",
        "## The episode README (the business, the proposal, what JP planned to say)\n" + read(f"{ep}/README.md", "(none)"),
        "## Known so far (cover/cover.json; 'their.handle' = not filled yet)\n" + json.dumps(
            {k: cover.get(k) for k in ("handle", "accent", "accent_ink")}, ensure_ascii=False),
        "## Assets on disk (paths are what you put in graphics' src)\n" + inv,
        "## The take: every word, '[seconds] text' (use these seconds as each piece's t)\n" + plan_words,
    ]
    if previous:
        parts.append("## Your previous plan\n" + json.dumps(previous, ensure_ascii=False, indent=1))
    if feedback:
        parts.append("## JP's feedback on the previous plan (apply it; keep what he didn't mention)\n" + feedback)
    if errors:
        parts.append("## The checker rejected these, fix them (copy words exactly from the transcript; anchors must be "
                     "said inside the same reel)\n" + "\n".join(errors))
    lo, hi = ESTILO["reels"]["segundos_de_voz"]
    parts.append(f"Plan the reels now: 1 to {MAX}, as many as the take really has. Reels of {lo}–{hi} s of voice. In notes "
                 "(Spanish, short), say why this many, and anything you'd want added (screen recordings, photos, B-roll).")
    return "\n\n".join(parts)


def ask_claude(text):
    t = time.time()
    r = subprocess.run(["claude", "-p", "--model", MODEL, "--tools", "Read", "--allowedTools", "Read",
                        "--output-format", "json",
                        "--no-session-persistence", "--system-prompt", SYSTEM, "--json-schema", json.dumps(SCHEMA)],
                       input=text, capture_output=True, text=True, timeout=1800)
    if r.returncode:
        raise SystemExit(f"claude -p falló:\n{r.stderr[-2000:]}\n{r.stdout[-2000:]}")
    d = json.loads(r.stdout)
    if d.get("is_error") or not d.get("structured_output"):
        raise SystemExit(f"claude -p sin resultado: {d.get('subtype')} {str(d.get('result'))[:500]}")
    print(f"  claude ({MODEL}): {time.time() - t:.0f} s")
    return d["structured_output"]


def numerar(out):
    """Give each reel its id ("01-<slug>") and act ("1/N"), in publishing order (the order Claude returned)."""
    n = len(out["reels"])
    for k, r in enumerate(out["reels"], 1):
        r["id"] = f"{k:02d}-{r['slug']}"
        r["act"] = f"{k}/{n}"
    return out


def write_outputs(ep, out):
    nn = os.path.basename(ep)[2:4]
    out = numerar(out)
    n = len(out["reels"])
    keep = ("id", "act", "nombre", "para", "idea", "hook", "pieces", "graphics", "cta", "tail")
    reels = {"ep": nn, "name": out["name"], "accent": out["accent"], "accent_ink": out.get("accent_ink", "#111111"),
             "fixes": out["fixes"], "reels": [{k: r[k] for k in keep if k in r} for r in out["reels"]]}
    old = f"{ep}/reels.json"
    if os.path.exists(old):                                    # keep the history of plans
        os.makedirs(f"{ep}/.plans", exist_ok=True)
        os.replace(old, f"{ep}/.plans/reels-{datetime.datetime.now():%Y%m%d-%H%M%S}.json")
    json.dump(reels, open(old, "w"), ensure_ascii=False, indent=1)

    cpath = f"{ep}/cover/cover.json"
    cover = json.load(open(cpath)) if os.path.exists(cpath) else {"ep": nn}
    cover["hooks"] = [r["hook"] for r in out["reels"]]
    cover["names"] = [r["nombre"] for r in out["reels"]]
    frames = [f for f in (cover.get("frames") or []) if f]
    cover["frames"] = frames[:n] if len(frames) >= n else []   # episode.py fills the missing ones from pick_frames
    cover["nudge"] = (cover.get("nudge") or [])[:n] + [0] * max(0, n - len(cover.get("nudge") or []))
    if cover.get("handle", "their.handle") == "their.handle":
        cover["handle"] = out["handle"]
    if cover.get("accent") in (None, "#FFD23F"):
        cover["accent"], cover["accent_ink"] = out["accent"], out.get("accent_ink", "#111111")
    os.makedirs(f"{ep}/cover", exist_ok=True)
    json.dump(cover, open(cpath, "w"), ensure_ascii=False, indent=1)

    pub = []
    mine = {}                                                  # JP's captions survive a re-plan
    if os.path.exists(f"{ep}/publish.json"):
        mine = {x["file"]: x.get("caption", "") for x in json.load(open(f"{ep}/publish.json"))}
    for k, r in enumerate(out["reels"], 1):                    # publishing order = the plan's order, one per slot
        pub.append({"file": f"reels/el-taller-ep{nn}-{r['id']}.mp4", "cover": f"cover/ep{nn}-cover-{k}of{n}.jpg",
                    "caption": mine.get(f"reels/el-taller-ep{nn}-{r['id']}.mp4", ""), "user_tags": [cover["handle"]] if cover.get("handle") else [],
                    "cuando": None})
    json.dump(pub, open(f"{ep}/publish.json", "w"), ensure_ascii=False, indent=1)

    notes = [f"# Plan · {datetime.datetime.now():%Y-%m-%d %H:%M} · {n} reel{'s' if n > 1 else ''}", "", out["notes"], ""]
    for r in out["reels"]:
        notes += [f"## {r['act']} · {r['nombre']}", "", f"Para: {r['para']}", f"Idea: {r['idea']}",
                  "Hook: " + " / ".join(r["hook"]), "", "> " + " ".join(p["say"] for p in r["pieces"]), ""]
    open(f"{ep}/plan-notes.md", "w").write("\n".join(notes))


def plan(ep, feedback=None, tries=3):
    al = sorted(glob.glob(f"{ep}/transcript/*.aligned.json"), key=os.path.getsize)
    if not al:
        raise SystemExit("no hay transcript/*.aligned.json: corre tools/ingest.py primero")
    words = json.load(open(al[-1]))
    for w in words:
        w.setdefault("n", autoreel.rk.norm(w["t"]))
    text_words = lines_transcript(words)
    previous = None
    if feedback and os.path.exists(f"{ep}/reels.json"):
        previous = json.load(open(f"{ep}/reels.json"))
        fb = f"{ep}/feedback.md"
        with open(fb, "a") as f:
            f.write(f"\n## {datetime.datetime.now():%Y-%m-%d %H:%M}\n\n{feedback}\n")
    errors = None
    out = None
    for i in range(tries):
        print(f"→ planeando ({'corrección ' + str(i) if i else 'feedback' if feedback else 'primer plan'}) …", flush=True)
        out = numerar(ask_claude(prompt(ep, text_words, feedback, previous if not errors else out, errors)))
        errors = []
        for reel in out["reels"]:
            try:
                _, _, _, errs = autoreel.resolve_reel(words, reel, ep)
                errors += [f"{reel['id']}: {e}" for e in errs]
            except autoreel.PlanError as e:
                errors.append(f"{reel['id']}: {e}")
        if not errors:
            break
        print("  el chequeo encontró:", *errors, sep="\n   ✗ ")
    write_outputs(ep, out)
    if errors:
        print(f"\n! quedaron {len(errors)} problema(s): ver `autoreel.py {os.path.relpath(ep, ROOT)} --check`")
    print(f"\n→ {len(out['reels'])} reel(s) · reels.json · cover/cover.json (hooks) · publish.json · plan-notes.md")
    print("\n" + out["notes"])
    return not errors


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    ep = os.path.abspath(args[0])
    fb = sys.argv[sys.argv.index("--feedback") + 1] if "--feedback" in sys.argv else None
    if fb:
        args = [a for a in args if a != fb]
    sys.exit(0 if plan(ep, fb) else 1)


if __name__ == "__main__":
    main()
