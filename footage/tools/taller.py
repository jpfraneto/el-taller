"""taller: the El Taller reel builder, shared by every episode.

An episode's make_reels.py defines an Episode (source, face position, fixes, tag) and a
dict of reel specs, then calls taller.main(ep, REELS). A spec is:

    pieces    [(src_a, src_b), ...]   source passages, in order; pauses inside are removed. Ends snap to
                                       the quietest spot ±0.22 s; (a, b, "exact") keeps them as given
    act       "1/3"                   shown in the tag and the end card
    cta       [(text, highlighted)]   end card lines
    build     lambda T, A: [elements]  graphics. T(src_t) maps a source time to reel time;
                                       A(word, src_t) finds that word in the finished reel's
                                       own captions (more exact than T)
    hide_caps lambda T, A: [(t0, t1)]  hide captions while a big callout is up
    sfx       lambda T, A: [(t, kind)]
    tail      seconds to freeze on the last frame before the end card

Captions: whisper re-transcribes the finished cut (text), then tools/align.py force-aligns
each word to the audio (timing). Whisper's own word times run up to ~1 s early.
PREVIEW=3,10.5 writes still frames instead of rendering.

DRAFT=1 builds the same reel from the episode's proxy (tools/proxy.py: 1% size, black and white)
→ reels/draft/, at 540x960 and 10 fps. Use it to iterate on cuts, captions and graphics;
when a reel is right, run the same command without DRAFT for the final from the raw take.
Same cuts, same graphics. Captions are cached by cut plan in .work/caps-cache/, so the final
reuses the exact captions you approved in the draft (and a graphics-only change skips whisper).
"""
import hashlib, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import numpy as np
from PIL import Image
import reelkit as rk
import ep02kit as ek

MODEL = os.path.expanduser("~/models/whisper/ggml-large-v3-turbo.bin")
DRAFT = os.environ.get("DRAFT", "") not in ("", "0")
HALLUCINATIONS = {"gracias", "muchas gracias", "gracias por ver", "gracias por ver el video", "gracias por ver el video y",
                  "subtitulos realizados por la comunidad de amaraorg", "suscribete", "gracias por su atencion"}
DRAFT_FPS = int(os.environ.get("DRAFT_FPS", "10"))


@dataclass
class Episode:
    src: str                    # raw camera file
    wav: str                    # 16 kHz mono of the same take (for pause detection)
    work: str                   # scratch dir
    out_dir: str
    slug: str                   # "el-taller-ep03"
    tag: str                    # "EPISODIO 3" → top tag "EL TALLER | EPISODIO 3 · 1/3"
    endcard: str                # "EPISODIO 3 · LA JUNTA" (+ " · 1/3")
    face: tuple = (860, 800)
    zooms: list = field(default_factory=lambda: [1.0, 1.6, 1.3, 1.6, 1.0, 1.3])
    fixes: list = field(default_factory=list)   # [(["whisper", "tokens"], ["Fixed", "Words"])]
    end_dur: float = 2.8
    hold: float = 0.0           # >0: the first `hold` seconds show only the title (no tag, captions or
                                #     other graphics); then a catch-up block of what was said so far
    tag_fn: object = None       # (ep, act) → Element for the corner tag (default rk.Tag)
    endcard_fn: object = None   # (t0, dur, still, ep_text, cta) → Element (default rk.EndCard)
    captions_kw: dict = field(default_factory=dict)   # extra rk.Captions options (style)
    sfx_fn: object = None       # (events, total, path) → wav (default ep02kit.synth_sfx)
    auto_sfx: object = None     # (elements) → [(t, kind)] added to the spec's sfx
    captions_on_top: bool = False   # draw captions over the graphics (default: under them)
    proxy: str = None           # tools/proxy.py copy of src, used when DRAFT=1
    crop_fn: object = None      # (a, b, zoom) → (cw, ch, x0, y0) per cut (tools/encuadre.py: keep things out of frame)
    words: str = None           # aligned words of the take (align_take.py). Set → pieces are word ranges:
                                #   (first word's start, last word's start); every gap between words longer
                                #   than ~0.2 s is cut, so "ems", breaths and false starts drop out


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def apply_fixes(words, fixes):
    toks = [w["n"] for w in words]
    for pat, rep in fixes:
        for i in range(len(toks) - len(pat) + 1):
            if toks[i:i + len(pat)] == pat:
                for k, r in enumerate(rep):
                    t = words[i + k]["t"]
                    punct = t[len(t.rstrip(".,?!;:…")):]
                    lead = "¿" if t.startswith("¿") else ""
                    words[i + k]["t"] = lead + r + punct
    return words


def caption_words(audio_wav, work, fixes):
    """Text from whisper on the whole finished cut; word times from forced alignment (align.py)."""
    base = f"{work}/caps"
    run(["whisper-cli", "-m", MODEL, "-f", audio_wav, "-l", "es", "-t", "8", "-ml", "1", "-sow",
         "-dtw", "large.v3.turbo", "-oj", "-of", base, "-np"], capture_output=True)
    words = apply_fixes(rk.load_words(base + ".json"), fixes)
    out = [dict(t=w["t"], d=w["t"].upper().rstrip(".,;:…"), oa=w["a"], ob=w["b"]) for w in words]
    aligned = align(audio_wav, out, work)
    if aligned:
        return aligned
    print("   ! forced alignment failed, captions use whisper times (can drift ~0.5 s)")
    i = 0
    while i < len(out):  # spread words stacked on one timestamp
        j = i
        while j + 1 < len(out) and abs(out[j + 1]["oa"] - out[i]["oa"]) < 0.02:
            j += 1
        if j > i:
            end = out[j + 1]["oa"] if j + 1 < len(out) else out[j]["ob"]
            end = max(end, out[i]["oa"] + 0.15 * (j - i + 1))
            span = end - out[i]["oa"]
            lens = [len(x["d"]) + 2 for x in out[i:j + 1]]
            t = out[i]["oa"]
            for k, x in enumerate(out[i:j + 1]):
                x["oa"] = t
                t += span * lens[k] / sum(lens)
                x["ob"] = t
        i = j + 1
    return out


ALIGN = ["uv", "run", "-q", "--python", "3.12", "--with", "torch==2.8.*", "--with", "torchaudio==2.8.*",
         "--with", "num2words", "--with", "numpy", "python", os.path.join(os.path.dirname(os.path.abspath(__file__)), "align.py")]


def align(audio_wav, words, work):
    """Exact word times via tools/align.py (forced alignment); None if it can't run."""
    src, dst = f"{work}/caps_whisper.json", f"{work}/caps_aligned.json"
    json.dump(words, open(src, "w"), ensure_ascii=False)
    r = subprocess.run(ALIGN + [audio_wav, src, dst], capture_output=True, text=True)
    if r.returncode or not os.path.exists(dst):
        print(r.stderr[-800:])
        return None
    out = json.load(open(dst))
    for x in out:  # keep every word on screen for at least a moment
        x["ob"] = max(x["ob"], x["oa"] + 0.12)
    return out


FILLERS = {"eh", "em", "emm", "mm", "mmm", "ehh", "ah", "este", "ehm"}


def plan_words(energy, words, a, b, pre=0.06, max_gap=0.2, tail=0.18):
    """Cuts for the words whose start lies in [a, b], tight around speech.

    Starts sit `pre` before each word; ends run on from the aligner's end (it tends to be early) until the
    audio actually goes quiet (≤ `tail`), never into the next word. Words closer than `max_gap` stay joined;
    longer gaps (pauses, "ems", breaths) are removed. Fillers are dropped."""
    idx = [i for i, w in enumerate(words) if a - 0.03 <= w["a"] <= b + 0.03]
    if not idx:
        raise SystemExit(f"no words between {a} and {b}")
    i0, i1 = idx[0], idx[-1]
    db = energy.db
    win = db[max(0, int(a * 100) - 200):int(b * 100) + 200]
    floor, loud = np.percentile(win, 12), np.percentile(win, 92)
    thr = floor + 0.30 * (loud - floor)
    segs, last = [], None          # last: index of the previous kept word
    for i in range(i0, i1 + 1):
        w = words[i]
        if rk.norm(w["t"]) in FILLERS:
            continue
        nxt_start = words[i + 1]["a"] if i + 1 < len(words) else w["b"] + 1
        limit = min(nxt_start - 0.03, w["b"] + tail)
        k = int(w["b"] * 100)
        while k / 100 < limit and not all(db[k + j] < thr for j in range(3)):
            k += 1
        en = max(w["b"], min(limit, k / 100 + 0.04))
        joined = last == i - 1 and w["a"] - words[last]["b"] < max_gap
        if joined:
            segs[-1][1] = max(segs[-1][1], en)
        else:
            prev_end = words[i - 1]["b"] if i > 0 else 0
            segs.append([max(w["a"] - pre, prev_end + 0.01), en])
        last = i
    merged = []
    for p, q in segs:   # back-to-back pieces stay one shot
        if merged and p - merged[-1][1] < 0.05:
            merged[-1][1] = q
        else:
            merged.append([p, q])
    out = []
    for p, q in merged:
        n = max(3, round((q - p) * rk.FPS))
        out.append((p, p + n / rk.FPS))
    return out


def snap(energy, t, w=0.22):
    """Move a cut point to the quietest 10 ms frame within ±w seconds."""
    i0, i1 = int((t - w) * 100), int((t + w) * 100)
    seg = energy.db[i0:i1]
    return (i0 + int(np.argmin(seg))) / 100


def make_resolver(words, T):
    def A(word, src):
        guess = T(src)
        target = rk.norm(word)
        best = None
        for w in words:
            if rk.norm(w["t"]) == target and abs(w["oa"] - guess) < 2.5:
                d = abs(w["oa"] - guess)
                if best is None or d < best[0]:
                    best = (d, w["oa"])
        if best is None:
            print(f"   ! word {word!r} not found near {guess:.2f}, using estimate")
            return guess
        return best[1]
    return A


def build(ep, rid, spec, energy):
    if DRAFT and not (ep.proxy and os.path.exists(ep.proxy)):
        raise SystemExit(f"DRAFT=1 needs the proxy: tools/proxy.py {ep.src} {ep.proxy or '<episode>/proxy/NAME.proxy.mp4'}")
    src = ep.proxy if DRAFT else ep.src
    work = f"{ep.work}/draft/{rid}" if DRAFT else f"{ep.work}/{rid}"
    segdir = f"{ep.work}/segs-draft" if DRAFT else f"{ep.work}/segs"
    os.makedirs(work, exist_ok=True); os.makedirs(segdir, exist_ok=True)

    cuts = []
    words = json.load(open(ep.words)) if ep.words else None
    for piece in spec["pieces"]:
        a, b = piece[:2]
        if len(piece) > 2 and piece[2] == "exact":   # boundaries picked by hand: don't move them
            cuts += rk.plan_cuts(energy, a, b)
        elif words is not None:
            cuts += plan_words(energy, words, a, b)
        else:
            cuts += rk.plan_cuts(energy, snap(energy, a), snap(energy, b))
    tl = rk.Timeline(cuts)
    T = tl.to_out
    print(f"[{rid}] {'DRAFT · ' if DRAFT else ''}{len(cuts)} cuts, {tl.duration:.1f}s", flush=True)

    jobs = []
    for i, (a, b) in enumerate(cuts):
        z = ep.zooms[i % len(ep.zooms)]
        box = ep.crop_fn(a, b, z) if ep.crop_fn else None
        key = f"{a:.3f}_{b - a:.4f}_{z}" + (f"_{'x'.join(map(str, box))}" if box else "")
        jobs.append((a, b - a, z, f"{segdir}/{key}.mov", z == 1.0 and not box, box))
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda j: rk.render_segment(src, j[0], j[1], j[2], j[3], push=j[4], face=ep.face, draft=DRAFT,
                                                box=j[5])
                    if not os.path.exists(j[3]) else None, jobs))
    with open(f"{work}/list.txt", "w") as f:
        for j in jobs:
            f.write(f"file '{j[3]}'\n")
    raw = f"{work}/raw.mov"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{work}/list.txt", "-c", "copy", raw])
    run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-ac", "1", "-ar", "16000", "-af", "apad=pad_dur=3", f"{work}/raw16k.wav"])
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.1", "-i", raw, "-frames:v", "1", f"{work}/last.png"])

    key = hashlib.sha1(json.dumps([[round(a, 3), round(b, 3)] for a, b in cuts] + [ep.fixes]).encode()).hexdigest()[:10]
    cache = f"{ep.work}/caps-cache/{rid}-{key}.json"
    if os.path.exists(cache):
        words = json.load(open(cache))
        print(f"[{rid}] captions from cache (same cuts)", flush=True)
    else:
        words = caption_words(f"{work}/raw16k.wav", work, ep.fixes)
        # whisper invents a sign-off ("¡Gracias por ver el video!") in the silence padded after the cut
        for n in range(min(8, len(words)), 0, -1):
            tail = " ".join(rk.norm(w["t"]) for w in words[-n:])
            if tail in HALLUCINATIONS and words[-n]["oa"] > tl.duration - 2.0:
                print(f"[{rid}] dropped whisper sign-off: {tail!r}")
                del words[-n:]
                break
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        json.dump(words, open(cache, "w"), ensure_ascii=False, indent=1)
    json.dump(words, open(f"{work}/caption_words.json", "w"), ensure_ascii=False, indent=1)
    print(f"[{rid}] captions:", " ".join(w["t"] for w in words), flush=True)
    A = make_resolver(words, T)
    hide = spec.get("hide_caps", lambda T, A: [])(T, A)
    caps = rk.Captions(words, hold=ep.hold, **ep.captions_kw)
    tail = spec.get("tail", 0.0)
    end = tl.duration + tail
    total = end + ep.end_dur
    act = spec["act"]
    tag = ep.tag_fn(ep, act) if ep.tag_fn else rk.Tag(rk.SERIE, f"{ep.tag} · {act}", t0=ep.hold)
    card = (ep.endcard_fn or rk.EndCard)(end, ep.end_dur, f"{work}/last.png", f"{ep.endcard} · {act}", spec["cta"])
    elems = [tag, *spec["build"](T, A), card]
    is_title = lambda e: isinstance(e, rk.Title) or getattr(e, "is_title", False)
    hide_more = [e for e in elems if getattr(e, "hides_captions", False)]
    hide = hide + [(e.t0 + 0.15, e.t1 - 0.2) for e in hide_more]

    sfx = spec["sfx"](T, A) + [(end, "whoosh"), (end + 0.15, "hit")]
    if ep.auto_sfx:
        sfx += ep.auto_sfx(elems)
    if ep.hold > 0:   # keep the title's own sound (first ~0.6 s), drop the rest of the intro
        sfx = [(t, k) for t, k in sfx if t < 0.6 or t >= ep.hold]
    (ep.sfx_fn or ek.synth_sfx)(sfx, total, f"{work}/sfx.wav")

    under = [e for e in elems if getattr(e, "z", 0) < 0]   # e.g. full-screen B-roll: below captions + tag
    over = [e for e in elems if getattr(e, "z", 0) >= 0]

    def compose(t):
        frame = Image.new("RGBA", (rk.W, rk.H), (0, 0, 0, 0))
        show = t < tl.duration and not any(a <= t < b for a, b in hide)
        for e in under:
            if e.live(t) and t >= ep.hold:
                e.draw(frame, t)
        if show and not ep.captions_on_top:
            caps.draw(frame, t)
        for e in over:
            if e.live(t) and (t >= ep.hold or is_title(e)):
                e.draw(frame, t)
        if show and ep.captions_on_top:
            caps.draw(frame, t)
        return frame

    out_dir = f"{ep.out_dir}/draft" if DRAFT else ep.out_dir
    os.makedirs(out_dir, exist_ok=True)
    out = f"{out_dir}/{ep.slug}-{rid}.mp4"
    fps = DRAFT_FPS if DRAFT else rk.FPS
    preview = os.environ.get("PREVIEW")
    if preview:
        for ts in map(float, preview.split(",")):
            frame = compose(ts)
            bg = f"{work}/bg.png"
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{min(ts, tl.duration - 0.05):.3f}", "-i", raw, "-frames:v", "1", bg])
            im = Image.open(bg).convert("RGBA"); im.alpha_composite(frame)
            im.convert("RGB").resize((540, 960)).save(f"{work}/prev_{ts:06.2f}.jpg")
        print(f"[{rid}] previews in {work}")
        return
    fc = (
        f"[0:v]{f'fps={fps},' if DRAFT else ''}tpad=stop_mode=clone:stop_duration={ep.end_dur + tail}[v0];"
        f"[v0][1:v]overlay=format=auto,{'scale=540:960,' if DRAFT else ''}format=yuv420p[v];"
        f"[0:a]highpass=f=80,afftdn=nf=-28,acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=2,"
        f"apad=pad_dur={ep.end_dur + tail},loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[voice];"
        f"[2:a]volume=0.55,aresample=48000[fx];"
        f"[voice][fx]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[a]"
    )
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", raw,
           "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{rk.W}x{rk.H}", "-r", str(fps), "-i", "-",
           "-i", f"{work}/sfx.wav", "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
           "-c:v", "libx264", *(["-preset", "ultrafast", "-crf", "28"] if DRAFT else
                                ["-preset", "slow", "-crf", "18", "-profile:v", "high"]), "-r", str(fps),
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", f"{total:.3f}", out + ".part.mp4"]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(round(total * fps))
    for fi in range(n):
        p.stdin.write(compose(fi / fps).tobytes())
    p.stdin.close()
    if p.wait():
        raise SystemExit(f"ffmpeg failed for {rid}")
    os.replace(out + ".part.mp4", out)      # only a finished reel gets the real name
    print(f"[{rid}] wrote {out} ({total:.1f}s)", flush=True)
    return out


def main(ep, reels):
    energy = rk.Energy(ep.wav)
    for rid in (sys.argv[1:] or list(reels)):
        build(ep, rid, reels[rid], energy)
