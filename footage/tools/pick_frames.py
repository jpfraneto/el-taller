#!/usr/bin/env python3
"""pick_frames: the best frames of JP in a take, for the covers (PIPELINE.md §3, "Picking JP's frames").

    tools/.venv/bin/python tools/pick_frames.py el-taller/ep05-slug [IMG_1234.MOV] [--top 12] [--gap 15]

Scans the raw take (keyframes only: ~1 per second, fast), scores every face with Apple Vision
(tools/facescore.swift: capture quality = sharpness, light, pose, expression; plus eye opening), keeps the
best ones at least --gap seconds apart, and writes to <episode>/cover/frames/:
  candidates.jpg    contact sheet: #rank, mm:ss, score (look at this one)
  candidates.json   [{"rank", "t", "score", "quality", "eyes"}]
  t<seconds>.jpg    each candidate at full resolution (1080x1920), ready for cover.json "frames"
Then pick 3 (different gestures, looking at the camera, hand away from the face) and put their t in cover.json.
"""
import json, os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SCORER = f"{HERE}/.facescore"


def scorer():
    if not os.path.exists(SCORER) or os.path.getmtime(SCORER) < os.path.getmtime(f"{HERE}/facescore.swift"):
        subprocess.run(["swiftc", "-O", f"{HERE}/facescore.swift", "-o", SCORER], check=True)
    return SCORER


def keyframes(mov, d):
    """Every keyframe (~1/s on iPhone takes) at 720 px wide → [(t, path)]."""
    r = subprocess.run(["ffmpeg", "-v", "info", "-skip_frame", "nokey", "-i", mov, "-vf", "scale=720:-2,showinfo",
                        "-fps_mode", "vfr", "-q:v", "3", f"{d}/k%05d.jpg"], capture_output=True, text=True, check=True)
    ts = [float(x) for x in re.findall(r"pts_time:([0-9.]+)", r.stderr)]
    files = sorted(f for f in os.listdir(d) if f.startswith("k"))
    return list(zip(ts, [f"{d}/{f}" for f in files]))


def score_all(frames, batch=150):
    out = {}
    for i in range(0, len(frames), batch):
        chunk = [p for _, p in frames[i:i + batch]]
        r = subprocess.run([scorer(), *chunk], capture_output=True, text=True)
        for line in r.stdout.splitlines():
            if line.startswith("{"):
                j = json.loads(line); out[j["file"]] = j
        print(f"  {min(i + batch, len(frames))}/{len(frames)}", end="\r", flush=True)
    print()
    return out


def score(j, head0):
    """Capture quality × open eyes × facing the camera.
    head = how far the nose is from the middle of the face (0 = frontal). The camera usually sits low and to one
    side, so "frontal" is measured against the most frontal frames of this take (head0), not against 0."""
    if not j or not j.get("faces") or j.get("eyes", 0) < 0.2:
        return 0
    eyes = min(j["eyes"] / 0.30, 1.15)
    turn = min(max((j.get("head", 1) - head0) / 0.12, 0), 1)      # 0 facing the lens … 1 clearly turned away
    gaze = min(max((j.get("gaze", 1) - 0.12) / 0.10, 0), 1)       # pupils off-center
    return j["quality"] * eyes * (1 - 0.7 * turn) * (1 - 0.4 * gaze)


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opt = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
    top, gap = int(opt("--top", 12)), opt("--gap", 15)
    args = [a for a in args if not re.fullmatch(r"[0-9.]+", a)]
    if not args:
        raise SystemExit(__doc__)
    ep = os.path.abspath(args[0])
    if len(args) > 1:
        mov = args[1] if os.path.isabs(args[1]) else os.path.abspath(args[1])
    else:
        sys.path.insert(0, HERE)
        from ingest import raw_dir, VIDEO
        import glob
        movs = sorted(f for pat in VIDEO for f in glob.glob(f"{raw_dir(ep)}/{pat}"))
        if not movs:
            raise SystemExit("no hay tomas en raw/ para este episodio")
        mov = max(movs, key=os.path.getsize)            # the long take
    out = f"{ep}/cover/frames"
    os.makedirs(out, exist_ok=True)
    print(f"{os.path.basename(mov)}: keyframes …")
    with tempfile.TemporaryDirectory() as d:
        frames = keyframes(mov, d)
        print(f"  {len(frames)} frames · puntuando caras …")
        scores = score_all(frames)
        heads = sorted(j["head"] for j in scores.values() if j.get("faces") and "head" in j)
        head0 = heads[len(heads) // 10] if heads else 0.2             # the most frontal 10 % of this take
        # where the face sits in this take (median over every frame with a face) → reel framing (autoreel "face")
        boxes = sorted(((j["box"][0] + j["box"][2] / 2) * 1080, (1 - j["box"][1] - j["box"][3] / 2) * 1920)
                       for j in scores.values() if j.get("faces") and j.get("box"))
        if boxes:
            xs, ys = sorted(b[0] for b in boxes), sorted(b[1] for b in boxes)
            json.dump({"take": os.path.basename(mov), "face": [round(xs[len(xs) // 2]), round(ys[len(ys) // 2])],
                       "head0": round(head0, 3)}, open(f"{out}/take.json", "w"))
        ranked = sorted(((score(scores.get(p), head0), t, p) for t, p in frames), reverse=True)
        picks = []
        for s, t, p in ranked:
            if s <= 0 or len(picks) >= top:
                break
            if all(abs(t - q["t"]) >= gap for q in picks):
                j = scores[p]
                picks.append(dict(rank=len(picks) + 1, t=round(t, 2), score=round(s, 3), quality=round(j["quality"], 3),
                                  eyes=round(j["eyes"], 3), head=round(j.get("head", 1), 3), box=j["box"], small=p))
        # contact sheet from the scan frames (face + hands area)
        T, cols = 300, 4
        rows = (len(picks) + cols - 1) // cols
        sheet = Image.new("RGB", (T * cols, int(T * 1.25) * rows), "black")
        f = ImageFont.truetype(__import__("estilo").fuente("Bold"), 24)
        d2 = ImageDraw.Draw(sheet)
        for k, c in enumerate(picks):
            im = Image.open(c["small"]); W, H = im.size
            bx, by, bw, bh = c["box"]
            cx, cy = (bx + bw / 2) * W, (1 - by - bh / 2) * H     # Vision: origin bottom-left
            s = bw * W * 3.4
            crop = im.crop((int(cx - s / 2), int(cy - s * 0.35), int(cx + s / 2), int(cy - s * 0.35 + s * 1.25)))
            x, y = (k % cols) * T, (k // cols) * int(T * 1.25)
            sheet.paste(crop.resize((T, int(T * 1.25))), (x, y))
            d2.rectangle((x, y, x + T, y + 32), fill=(0, 0, 0))
            d2.text((x + 8, y + 3), f"#{c['rank']}  {mmss(c['t'])}  ·  {c['score']:.2f}", font=f, fill=(255, 210, 63))
        sheet.save(f"{out}/candidates.jpg", quality=90)
    # full-res stills (exact time, from the raw take)
    for c in picks:
        c.pop("small"); c.pop("box")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(c["t"]), "-i", mov, "-frames:v", "1", "-q:v", "2",
                        f"{out}/t{c['t']:.2f}.jpg"], check=True)
    json.dump(picks, open(f"{out}/candidates.json", "w"), indent=1)
    print(f"→ {os.path.relpath(out, ROOT)}/candidates.jpg ({len(picks)} candidatos)")
    for c in picks:
        print(f"  #{c['rank']:<2} {mmss(c['t']):>7}  score {c['score']:.2f}  (calidad {c['quality']:.2f}, ojos {c['eyes']:.2f}, giro {c['head']:.2f})")


if __name__ == "__main__":
    main()
