#!/usr/bin/env python3
"""encuadre: frame every cut of a take so that some things never appear (Ep. 09: the beer and the crates).

    tools/.venv/bin/python tools/encuadre.py el-taller/ep09-slug          face track → cover/frames/track.json
    tools/.venv/bin/python tools/encuadre.py el-taller/ep09-slug --check  every reel's cuts: crop, or why it can't

<episode>/encuadre.json holds the rule for the take (reels and stories), in pixels of the 1080x1920 frame:
  {"hide": [[760, 850, 1080, 1200], [0, 1130, 1080, 1920]],   boxes that must stay out of every crop
   "avoid": [[306, 326], [1281, 1296]]}                        seconds of the take that can't be used
autoreel.py picks it up by itself; its --check (and so the planner) rejects pieces that fall in "avoid".

Per cut, the crop keeps the zoom of the cycle (estilo/reels.json "zooms") when it can, centers on JP's face where he
is during that cut (track.json: Apple Vision on every keyframe, like pick_frames), and slides or zooms in until no
hidden box is inside. A cut that can't be framed, or that falls on an "avoid" second, is an error (autoreel --check).
"""
import json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
W, H = 1080, 1920


def track(ep, mov=None):
    """[[t, cx, cy, fw, fh], …]: JP's face (center + size, 1080x1920 px) at every keyframe of the take."""
    import pick_frames as pf
    if mov is None:
        from ingest import raw_dir, VIDEO
        import glob
        mov = max((f for pat in VIDEO for f in glob.glob(f"{raw_dir(ep)}/{pat}")), key=os.path.getsize)
    with tempfile.TemporaryDirectory() as d:
        frames = pf.keyframes(mov, d)
        scores = pf.score_all(frames)
        out = []
        for t, p in frames:
            j = scores.get(p) or {}
            if j.get("faces") and j.get("box"):
                x, y, w, h = j["box"]
                out.append([round(t, 2), round((x + w / 2) * W), round((1 - y - h / 2) * H), round(w * W), round(h * H)])
    path = f"{ep}/cover/frames/track.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"take": os.path.basename(mov), "faces": out}, open(path, "w"))
    return path


def rule(ep):
    p = f"{ep}/encuadre.json"
    return json.load(open(p)) if os.path.exists(p) else None


def load_track(ep):
    p = f"{ep}/cover/frames/track.json"
    return json.load(open(p))["faces"] if os.path.exists(p) else None


def face_during(faces, a, b, default):
    """Bounding box of the face over the cut [a, b] (± 0.6 s): (x0, y0, x1, y1), or the default face if no data."""
    hits = [f for f in faces if a - 0.6 <= f[0] <= b + 0.6]
    if not hits:
        near = min(faces, key=lambda f: min(abs(f[0] - a), abs(f[0] - b)), default=None)
        hits = [near] if near and min(abs(near[0] - a), abs(near[0] - b)) < 3 else []
    if not hits:
        cx, cy = default
        return cx - 90, cy - 120, cx + 90, cy + 120
    return (min(f[1] - f[3] / 2 for f in hits), min(f[2] - f[4] / 2 for f in hits),
            max(f[1] + f[3] / 2 for f in hits), max(f[2] + f[4] / 2 for f in hits))


def overlaps(r, box):
    return r[0] < box[2] and box[0] < r[2] and r[1] < box[3] and box[1] < r[3]


def crop(rule, faces, a, b, zoom, default=(566, 611)):
    """(cw, ch, x0, y0) for the cut [a, b]: the widest crop ≥ zoom that shows the whole face (+ hair, chin)
    and none of rule["hide"]. Raises ValueError if the cut is in rule["avoid"] or can't be framed."""
    for s, e in rule.get("avoid", []):
        if a < e and s < b:
            raise ValueError(f"{a:.1f}–{b:.1f} s cae en un tramo que no se puede mostrar ({s}–{e} s)")
    fx0, fy0, fx1, fy1 = face_during(faces or [], a, b, default)
    f = sorted(x[3] for x in faces)[len(faces) // 2] if faces else 170      # his face's usual size in this take
    cx, cy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
    # first room around the face (hair, chin, neck) and a natural composition (face center 30–62 % down the frame),
    # up to 3.2x; then just the face, anywhere in the frame, up to 4x
    for m, lo, hi, zmax in (((0.3, 0.55, 0.3, 0.35), 0.30, 0.62, 3.2), ((0.1, 0.3, 0.05, 0.08), 0.15, 0.85, 4.0)):
        need = (fx0 - m[0] * f, fy0 - m[1] * f, fx1 + m[2] * f, fy1 + m[3] * f)
        z = zoom
        while z <= zmax:
            cw, ch = int(round(W / z / 2) * 2), int(round(H / z / 2) * 2)
            frac = 0.46 if z > 1.6 else 0.40
            for dx in sorted(range(-cw // 2, cw // 2 + 1, 12), key=abs):
                x0 = min(max(0, int(cx - cw / 2 + dx)), W - cw)
                for dy in sorted(range(-ch // 2, ch // 2 + 1, 12), key=abs):
                    y0 = min(max(0, int(cy - frac * ch + dy)), H - ch)
                    r = (x0, y0, x0 + cw, y0 + ch)
                    if not lo <= (cy - y0) / ch <= hi:
                        continue
                    if r[0] > need[0] or r[1] > need[1] or r[2] < need[2] or r[3] < need[3]:
                        continue
                    if any(overlaps(r, h) for h in rule.get("hide", [])):
                        continue
                    return cw, ch, x0, y0
            z = round(z + 0.1, 2)
    # last resort (he leans into a hidden box): what's hidden wins over the edge of his face. Tight crop, as close to
    # the face as the boxes allow; the face may touch the frame's edge.
    z = max(zoom, 2.4)
    cw, ch = int(round(W / z / 2) * 2), int(round(H / z / 2) * 2)
    for dx in sorted(range(-cw, cw + 1, 8), key=abs):
        x0 = min(max(0, int(cx - cw / 2 + dx)), W - cw)
        for dy in sorted(range(-ch // 2, ch // 2 + 1, 8), key=abs):
            y0 = min(max(0, int(cy - 0.5 * ch + dy)), H - ch)
            if not any(overlaps((x0, y0, x0 + cw, y0 + ch), h) for h in rule.get("hide", [])):
                return cw, ch, x0, y0
    raise ValueError(f"{a:.1f}–{b:.1f} s: no hay encuadre sin {rule.get('hide')} (cara {[round(v) for v in (fx0, fy0, fx1, fy1)]})")


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if not args:
        raise SystemExit(__doc__)
    ep = os.path.abspath(args[0])
    if "--check" not in sys.argv:
        print("→", track(ep))
        return
    import autoreel
    plan = autoreel.load(ep)
    rl, faces = rule(ep) or {}, load_track(ep)
    for reel in plan["reels"]:
        spans, *_ = autoreel.resolve_reel(plan["_words"], reel, ep)
        for k, (a, b) in enumerate(spans):
            try:
                c = crop(rl, faces, a, b, plan.get("zooms", [2.0])[k % len(plan.get("zooms", [2.0]))])
                print(f"{reel['id']} {a:7.1f}–{b:7.1f}  zoom {W / c[0]:.2f}  crop {c}")
            except ValueError as e:
                print(f"{reel['id']} ✗ {e}")


if __name__ == "__main__":
    main()
