#!/usr/bin/env python3
"""
Layout guard: render each scene at several timestamps and measure the bounding
box of everything drawn. Fails if content leaves the safe area or collides with
the bottom caption band.

The accent bar at y=158..164 is the page furniture and is expected; anything
else outside the safe area is a real overflow.

Usage:  python3 docs/video/check_layout.py
"""
import json
import sys

from PIL import Image, ImageDraw

import render as R

SAFE_X0, SAFE_X1 = 80, 1840
SAFE_Y0, SAFE_Y1 = 40, 1000
BG = R.BG


def bbox(img):
    """Bounding box of pixels that differ from the background."""
    px = img.load()
    W, H = img.size
    x0, y0, x1, y1 = W, H, -1, -1
    for y in range(H):
        row_any = False
        for x in range(W):
            if px[x, y] != BG:
                row_any = True
                if x < x0:
                    x0 = x
                if x > x1:
                    x1 = x
        if row_any:
            if y < y0:
                y0 = y
            if y > y1:
                y1 = y
    return x0, y0, x1, y1


def main():
    with open(f"{R.ROOT}/evidence.json") as f:
        E = json.load(f)
    with open(f"{R.ROOT}/timeline.json") as f:
        TL = json.load(f)

    bad = []
    for sc in TL["scenes"]:
        fn = dict(R.SCENES)[sc["scene"]]
        dur_s = sc["frames"] / R.FPS
        # sample near the end, where the most content is on screen
        for frac in (0.55, 0.8, 0.97):
            t = dur_s * frac
            img = Image.new("RGB", (R.W, R.H), BG)
            d = ImageDraw.Draw(img, "RGBA")
            fn(d, t, E)
            x0, y0, x1, y1 = bbox(img)
            probs = []
            if x0 < SAFE_X0:
                probs.append(f"left {x0}")
            if x1 > SAFE_X1:
                probs.append(f"right {x1}")
            if y0 < SAFE_Y0:
                probs.append(f"top {y0}")
            if y1 > SAFE_Y1:
                probs.append(f"bottom {y1}")
            status = "ok " if not probs else "BAD"
            print(f"  {status} {sc['scene']:14} t={t:6.2f}  "
                  f"bbox=({x0},{y0})-({x1},{y1})" + (f"   {', '.join(probs)}" if probs else ""))
            if probs:
                bad.append((sc["scene"], round(t, 2), probs))

    print()
    if bad:
        print(f"LAYOUT PROBLEMS ({len(bad)}):")
        for s, t, p in bad:
            print(f"  {s} @ {t}s: {', '.join(p)}")
        sys.exit(1)
    print("LAYOUT OK — all scenes inside the safe area")


if __name__ == "__main__":
    main()
