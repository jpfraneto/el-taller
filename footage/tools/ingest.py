#!/usr/bin/env python3
"""ingest: a recorded take → ready to cut, in one command (PIPELINE.md stage 3).

    tools/.venv/bin/python tools/ingest.py el-taller/ep05-slug [IMG_1234.MOV]

For each take (the .MOV given, or every .MOV in the episode's raw/ folder):
  1. moves camera files dropped in the episode folder to raw/<date>_el-taller-epNN_slug/
  2. proxy/IMG.proxy.mp4          1% size, B&W, same timing (tools/proxy.py): for DRAFT=1 reels
  3. transcript/IMG.wav           16 kHz mono
  4. transcript/IMG.{txt,srt,json} whisper, segments
  5. transcript/IMG.words.json    whisper, one word per segment
  6. transcript/IMG.aligned.json  exact word times (tools/align_take.py, forced alignment)
  7. transcript/IMG.timed.txt     the transcript in ~30 s paragraphs with [mm:ss.s]: the one to read when planning cuts
Each step is skipped if its output exists, so it's safe to run again (e.g. after a failure).
"""
import glob, json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
MODEL = os.path.expanduser("~/models/whisper/ggml-large-v3-turbo.bin")
VIDEO = ("*.[mM][oO][vV]", "*.[mM][pP]4")
ALIGN_ENV = ["uv", "run", "-q", "--python", "3.12", "--with", "torch==2.8.*", "--with", "torchaudio==2.8.*",
             "--with", "num2words", "--with", "numpy", "python"]


def raw_dir(ep):
    """raw/<date>_el-taller-epNN_slug/ for el-taller/epNN-slug (created by new_episode.py)."""
    name = os.path.basename(ep.rstrip("/"))           # ep05-slug
    nn, slug = name[2:4], name[5:]
    from estilo import RAW                             # footage/raw for JP; <taller>/raw for an owner
    hits = sorted(glob.glob(f"{RAW}/*_el-taller-ep{nn}_{slug}"))
    if hits:
        return hits[-1]
    d = f"{RAW}/{time.strftime('%Y-%m-%d')}_el-taller-ep{nn}_{slug}"
    os.makedirs(d, exist_ok=True)
    return d


def step(label, out, fn):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print(f"  · {label}: ya existe ({os.path.relpath(out, ROOT)})")
        return
    t = time.time()
    print(f"  → {label} …", flush=True)
    fn()
    print(f"    ok ({time.time() - t:.0f} s)")


def run(cmd, log=None):
    with open(log, "a") if log else open(os.devnull, "w") as f:
        subprocess.run(cmd, check=True, stdout=f, stderr=subprocess.STDOUT)


def timed_txt(seg_json, out, every=28.0):
    """Whisper segments → paragraphs of ~30 s, each starting with [mm:ss.s]."""
    segs = json.load(open(seg_json))["transcription"]
    paras, cur, start = [], [], None
    for s in segs:
        a = s["offsets"]["from"] / 1000
        t = s["text"].strip()
        if not t:
            continue
        if start is None:
            start = a
        cur.append(t)
        if a - start >= every:
            paras.append((start, " ".join(cur))); cur, start = [], None
    if cur:
        paras.append((start, " ".join(cur)))
    with open(out, "w") as f:
        for a, t in paras:
            f.write(f"[{int(a // 60):02d}:{a % 60:04.1f}] {t}\n")


def ingest(ep, mov):
    base = os.path.splitext(os.path.basename(mov))[0]
    tr = f"{ep}/transcript"
    os.makedirs(tr, exist_ok=True)
    print(f"\n{base}  ({os.path.getsize(mov) / 1e9:.2f} GB)")
    wav, words = f"{tr}/{base}.wav", f"{tr}/{base}.words.json"

    sys.path.insert(0, HERE)
    import proxy
    step("proxy", f"{ep}/proxy/{base}.proxy.mp4", lambda: proxy.make(mov, f"{ep}/proxy/{base}.proxy.mp4"))
    step("audio 16 kHz", wav, lambda: run(["ffmpeg", "-v", "error", "-y", "-i", mov, "-vn", "-ac", "1", "-ar", "16000",
                                           "-c:a", "pcm_s16le", wav]))
    # -mc 0: no text carried between windows. With it, a 47 min take (Ep. 10) looped on one sentence from 30:36 on
    step("whisper (texto)", f"{tr}/{base}.json", lambda: run(
        ["whisper-cli", "-m", MODEL, "-f", wav, "-l", "es", "-t", "8", "-mc", "0", "-otxt", "-osrt", "-oj", "-of", f"{tr}/{base}"],
        f"{tr}/whisper.log"))
    step("whisper (palabras)", words, lambda: run(
        ["whisper-cli", "-m", MODEL, "-f", wav, "-l", "es", "-t", "8", "-mc", "0", "-ml", "1", "-sow", "-dtw", "large.v3.turbo",
         "-oj", "-of", f"{tr}/{base}.words"], f"{tr}/whisper.log"))
    step("alineación", f"{tr}/{base}.aligned.json", lambda: run(
        ALIGN_ENV + [f"{HERE}/align_take.py", wav, words, f"{tr}/{base}.aligned.json"], f"{tr}/align.log"))
    step("timed.txt", f"{tr}/{base}.timed.txt", lambda: timed_txt(f"{tr}/{base}.json", f"{tr}/{base}.timed.txt"))


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    ep = os.path.abspath(sys.argv[1])
    if not os.path.isdir(ep):
        raise SystemExit(f"no existe {ep} (créalo con tools/new_episode.py)")
    dropped = [f for pat in VIDEO for f in glob.glob(f"{ep}/{pat}")]
    given = sys.argv[2:]
    raw = raw_dir(ep) if dropped or not given or not all(os.path.isabs(p) and os.path.exists(p) for p in given) else None
    for f in dropped:                                   # camera files dropped in the episode folder → raw/
        shutil.move(f, raw); print("movido", os.path.basename(f), "→", os.path.relpath(raw, ROOT))
    if given:
        movs = [p if os.path.isabs(p) and os.path.exists(p) else f"{raw}/{os.path.basename(p)}" for p in given]
    else:
        movs = sorted(f for pat in VIDEO for f in glob.glob(f"{raw}/{pat}"))
    if not movs:
        raise SystemExit(f"no hay tomas en {os.path.relpath(raw, ROOT)}/ (AirDrop el .MOV ahí o a la carpeta del episodio)")
    for m in movs:
        if not os.path.exists(m):
            raise SystemExit(f"no encuentro {m}")
        ingest(ep, m)
    print(f"\nListo. Siguiente: leer transcript/*.timed.txt y planear los cortes en make_reels.py (PIPELINE.md §1, etapa 4).")


if __name__ == "__main__":
    main()
