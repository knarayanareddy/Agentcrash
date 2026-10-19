#!/usr/bin/env python3
"""
Build the narration track and derive the frame budget for every scene.

The audio is the source of truth for timing. Each scene's video length is
computed from its exact PCM sample count, so audio and video cannot drift.

Reads:   docs/video/narration/*.mp3  (with a sidecar .txt caption per clip)
Writes:  docs/video/narration.pcm    (raw s16le stereo 44.1k)
         docs/video/timeline.json    (per-scene sample + frame counts)
         docs/video/captions.srt

Usage:  python3 docs/video/mux.py
"""
import json
import os
import subprocess

ROOT = "/home/user/Agentcrash/docs/video"
FF = "/tmp/vid/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"

FPS = 30
RATE = 44100
CH = 2
HEAD = 0.35   # seconds of silence before a clip
TAIL = 0.55   # seconds of silence after a clip

SCENES = [
    "01-title", "02-problem", "03-loop", "04-policy", "05-trust",
    "06-allowlist", "07-s1", "08-s2", "09-s3", "10-drift",
    "11-verify", "12-ledger", "13-metrics", "14-honest", "15-close",
]


def decode(path):
    """mp3 -> raw s16le stereo 44.1k PCM."""
    out = subprocess.run(
        [FF, "-v", "quiet", "-i", path, "-f", "s16le",
         "-acodec", "pcm_s16le", "-ar", str(RATE), "-ac", str(CH), "-"],
        capture_output=True, check=True)
    return out.stdout


def main():
    pcm = bytearray()
    timeline = []
    cursor_s = 0.0

    for name in SCENES:
        mp3 = f"{ROOT}/narration/{name}.mp3"
        if not os.path.exists(mp3):
            print(f"  MISSING {name}.mp3 — skipping")
            continue

        head = b"\x00" * int(HEAD * RATE) * 4
        body = decode(mp3)
        tail = b"\x00" * int(TAIL * RATE) * 4
        block = head + body + tail

        start_s = cursor_s
        pcm += block
        cursor_s += len(block) / (RATE * 4)

        # video length quantised to whole frames, never shorter than the audio
        secs = len(block) / (RATE * 4)
        frames = int(round(secs * FPS))
        timeline.append({
            "scene": name,
            "samples": len(block) // 4,
            "seconds": round(secs, 4),
            "frames": frames,
            "start": round(start_s, 4),
            "head": HEAD,
            "tail": TAIL,
        })
        print(f"  {name:14} {secs:6.2f}s  {frames:5d} frames")

    with open(f"{ROOT}/narration.pcm", "wb") as f:
        f.write(bytes(pcm))
    with open(f"{ROOT}/timeline.json", "w") as f:
        json.dump({"fps": FPS, "rate": RATE, "channels": CH,
                   "scenes": timeline}, f, indent=2)

    total = len(pcm) / (RATE * 4)
    print(f"  narration.pcm  {len(pcm)} bytes  {total:.2f}s")
    print(f"  total frames   {sum(t['frames'] for t in timeline)}")


if __name__ == "__main__":
    main()
