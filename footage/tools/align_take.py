"""align_take: exact word times for a whole raw take (forced alignment, in ~40 s chunks).

Whisper's word times on a long take run early (up to ~1 s), so cuts placed on them clip words.
This keeps whisper's words and re-times them with tools/align.py's aligner, chunk by chunk,
splitting the audio inside pauses.

usage:
  uv run -q --python 3.12 --with "torch==2.8.*" --with "torchaudio==2.8.*" --with num2words --with numpy \
      python tools/align_take.py transcript/IMG_4525.wav transcript/IMG_4525.words.json transcript/IMG_4525.aligned.json
output: [{"t", "a", "b", "n"}] like words.json, with a/b from the aligner.
"""
import json, os, sys, wave
import numpy as np
import torch, torchaudio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from align import spoken


def load_words(path):
    """whisper-cli -ml 1 JSON → [{t, a, b, n}] (same as reelkit.load_words, without PIL)."""
    import re, unicodedata
    norm = lambda s: re.sub(r"[^a-z0-9ñ ]", "", "".join(
        c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")).strip()
    out = []
    for seg in json.load(open(path))["transcription"]:
        t = seg["text"].strip()
        if not t:
            continue
        a, b = seg["offsets"]["from"] / 1000, seg["offsets"]["to"] / 1000
        if not norm(t) and out:
            out[-1]["t"] += t
            continue
        out.append(dict(t=t, a=a, b=b, n=norm(t)))
    return out


def main(wav_path, words_path, out_path, chunk=40.0):
    words = load_words(words_path)
    with wave.open(wav_path) as f:
        sr = f.getframerate()
        x = np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32) / 32768
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).eval()
    tok, aligner = bundle.get_tokenizer(), bundle.get_aligner()

    # chunk boundaries: at the biggest whisper gap once a chunk passes `chunk` seconds
    groups, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        nxt = words[i + 1] if i + 1 < len(words) else None
        span = w["b"] - words[cur[0]]["a"]
        if nxt is None or (span > chunk and nxt["a"] - w["b"] > 0.5) or span > chunk * 1.6:
            groups.append(cur); cur = []

    out = [None] * len(words)
    for gi, g in enumerate(groups):
        # audio window: from the middle of the gap before to the middle of the gap after,
        # nudged later because whisper runs early
        prev_b = words[groups[gi - 1][-1]]["b"] if gi else 0.0
        next_a = words[groups[gi + 1][0]]["a"] if gi + 1 < len(groups) else len(x) / sr
        s0 = max(0.0, (prev_b + words[g[0]]["a"]) / 2 + 0.3) if gi else 0.0
        s1 = min(len(x) / sr, (words[g[-1]]["b"] + next_a) / 2 + 0.5)
        seg = torch.from_numpy(x[int(s0 * sr):int(s1 * sr)].copy()).unsqueeze(0)
        with torch.inference_mode():
            em, _ = model(seg)
        ratio = seg.size(1) / em.size(1) / sr
        pieces, owner = [], []
        for i in g:
            for p in spoken(words[i]["t"]):
                pieces.append(p); owner.append(i)
        times = {}
        try:
            spans = aligner(em[0], tok(pieces))
            for sp, i in zip(spans, owner):
                a, b = s0 + sp[0].start * ratio, s0 + sp[-1].end * ratio
                times[i] = (min(times[i][0], a), max(times[i][1], b)) if i in times else (a, b)
        except Exception as e:  # keep whisper times for this chunk
            print(f"   ! chunk {s0:.1f}-{s1:.1f} failed: {e}")
        for i in g:
            w = dict(words[i])
            if i in times:
                w["a"], w["b"] = round(times[i][0], 3), round(times[i][1], 3)
            out[i] = w
        print(f"chunk {s0:7.1f}-{s1:7.1f}  {len(g):4d} words", flush=True)
    d = [o["a"] - w["a"] for o, w in zip(out, words)]
    print(f"shift vs whisper: median {np.median(d):+.2f}s, 90th pct {np.percentile(d, 90):+.2f}s")
    json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
