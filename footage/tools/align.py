"""align: exact word timings for captions by forced alignment (torchaudio MMS_FA, multilingual).

Whisper gives the right words but its word times drift 0.3–0.5 s. Here we keep whisper's
text and ask a CTC aligner where each word actually is in the audio.

usage (run in its own env, it needs torch):
  uv run -q --python 3.12 --with "torch==2.8.*" --with "torchaudio==2.8.*" --with num2words \
      python tools/align.py reel16k.wav caption_words.json aligned.json
caption_words.json: [{"t": "Hola,", "oa": 0.1, "ob": 0.4, ...}]  → same list with oa/ob replaced.
"""
import json, re, sys, unicodedata, wave
import numpy as np
import torch, torchaudio
from num2words import num2words


def spoken(word):
    """Letters the aligner knows (a-z, '), with numbers spelled out in Spanish."""
    w = word.lower()
    w = re.sub(r"(\d+)%", lambda m: num2words(int(m.group(1)), lang="es") + " por ciento", w)
    w = re.sub(r"\d+", lambda m: " " + num2words(int(m.group(0)), lang="es") + " ", w)
    w = w.replace("3d", "tres de")
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return [p for p in re.sub(r"[^a-z' ]", " ", w).split() if p]


def main(wav_path, words_path, out_path):
    words = json.load(open(words_path))
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).eval()
    with wave.open(wav_path) as f:  # 16-bit PCM
        sr, ch = f.getframerate(), f.getnchannels()
        x = np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float32) / 32768
    wav = torch.from_numpy(x.reshape(-1, ch).mean(1)).unsqueeze(0)
    if sr != bundle.sample_rate:
        wav = torchaudio.functional.resample(wav, sr, bundle.sample_rate)
    with torch.inference_mode():
        emission, _ = model(wav)
    ratio = wav.size(1) / emission.size(1) / bundle.sample_rate

    pieces, owner = [], []          # aligner words → index of the caption word they belong to
    for i, w in enumerate(words):
        for p in spoken(w["t"]):
            pieces.append(p); owner.append(i)
    tokens = bundle.get_tokenizer()(pieces)
    spans = bundle.get_aligner()(emission[0], tokens)

    times = {}
    for sp, i in zip(spans, owner):
        a, b = sp[0].start * ratio, sp[-1].end * ratio
        if i in times:
            times[i] = (min(times[i][0], a), max(times[i][1], b))
        else:
            times[i] = (a, b)
    # words with nothing to align (pure punctuation): place between neighbours
    out = []
    for i, w in enumerate(words):
        if i in times:
            a, b = times[i]
        else:
            prev = out[-1]["ob"] if out else 0.0
            a = b = prev
        out.append(dict(w, oa=round(a, 3), ob=round(b, 3)))
    json.dump(out, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(f"aligned {len(times)}/{len(words)} words")


if __name__ == "__main__":
    main(*sys.argv[1:4])
