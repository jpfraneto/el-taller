#!/usr/bin/env python3
"""proxy: a 1%-size, black-and-white copy of a raw take, for drafting reels fast.

Same length and timing as the raw file, so every source time in a make_reels.py works on
both. Build and iterate reels on the proxy (DRAFT=1, see tools/taller.py), then run the
exact same script without DRAFT to render the finals from the raw file.

    270x480 · grayscale · 30 fps · keyframe every 0.5 s (instant seeking) · mono AAC 96k

usage: tools/.venv/bin/python tools/proxy.py raw/<shoot>/IMG_1234.MOV el-taller/epNN-x/proxy/IMG_1234.proxy.mp4
"""
import os, subprocess, sys

W, H, FPS = 270, 480, 30


def make(src, out):
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = out + ".part.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", *(["-stats"] if sys.stderr.isatty() else ["-nostats"]), "-y", "-hwaccel", "videotoolbox", "-i", src,
        # ffmpeg applies the phone's rotation on decode, so the proxy is already upright
        "-vf", f"fps={FPS},scale={W}:{H}:flags=bilinear,hue=s=0,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-g", str(FPS // 2), "-bf", "0",
        "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-ar", "48000",
        "-movflags", "+faststart", tmp,
    ], check=True)
    os.replace(tmp, out)
    a, b = os.path.getsize(src), os.path.getsize(out)
    print(f"{out}: {b / 1e6:.1f} MB ({100 * b / a:.2f}% of {a / 1e9:.2f} GB)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    make(sys.argv[1], sys.argv[2])
