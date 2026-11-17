#!/usr/bin/env python3
"""contact_sheet: one image with a frame every N seconds of a reel, time-stamped, to review an edit at a glance.

usage: tools/.venv/bin/python tools/contact_sheet.py reels/draft/x.mp4 [every=1.5] [out.jpg]
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont


def make(video, every=1.5, out=None, cols=10, w=216):
    dur = float(json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", video],
                                          capture_output=True, text=True).stdout)["format"]["duration"])
    h = int(w * 16 / 9)
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"fps=1/{every},scale={w}:{h}", f"{d}/%04d.jpg"],
                       check=True)
        fs = sorted(os.listdir(d))
        rows = (len(fs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * w, rows * h), "black")
        f = ImageFont.truetype("/Library/Fonts/SF-Pro-Display-Bold.otf", 22)
        for i, name in enumerate(fs):
            im = Image.open(f"{d}/{name}")
            x, y = (i % cols) * w, (i // cols) * h
            sheet.paste(im, (x, y))
            dd = ImageDraw.Draw(sheet)
            dd.rectangle((x, y, x + 70, y + 28), fill=(0, 0, 0))
            dd.text((x + 5, y + 2), f"{i * every + every / 2:.1f}", font=f, fill=(255, 220, 60))
    out = out or os.path.splitext(video)[0] + ".sheet.jpg"
    sheet.save(out, quality=85)
    print(f"{out} ({dur:.1f}s, {len(fs)} frames)")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    make(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1.5, sys.argv[3] if len(sys.argv) > 3 else None)
