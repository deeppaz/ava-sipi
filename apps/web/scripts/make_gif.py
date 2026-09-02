"""Assemble docs/media/frames/*.png into docs/media/ava-sipi.gif (< 6 MB, README §9).

Run after `node scripts/capture.mjs`:  uv run --project ../../ingest python scripts/make_gif.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parents[2] / "docs" / "media"
FRAMES = sorted((MEDIA / "frames").glob("*.png"))
OUT = MEDIA / "ava-sipi.gif"
LIMIT = 6 * 1024 * 1024


def build(width: int, colors: int) -> int:
    imgs = []
    for f in FRAMES:
        im = Image.open(f).convert("RGB")
        if im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.Resampling.LANCZOS)
        imgs.append(im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG))
    imgs[0].save(OUT, save_all=True, append_images=imgs[1:], duration=250, loop=0, optimize=True)
    return OUT.stat().st_size


def main() -> int:
    if not FRAMES:
        print("no frames; run capture.mjs first", file=sys.stderr)
        return 1
    for width, colors in ((800, 128), (720, 96), (640, 64), (560, 48)):
        size = build(width, colors)
        print(f"{OUT.name}: {width}px / {colors} colours -> {size / 1024 / 1024:.2f} MB")
        if size < LIMIT:
            return 0
    print("could not get under 6 MB", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
