#!/usr/bin/env python3
"""Make the menu's logo from the logo file: the wordmark alone, for dark ground.

  python3 scripts/logo_cutout.py            # site/img/logo.jpg -> site/img/wordmark-on-dark.png

The logo as supplied (site/img/logo.jpg) is the wordmark in navy, small in the
middle of a white square. In the site's navy menu that square was shown 36px
tall, which left the name about 8px tall: the owner, on 2026-11-26, "the logo
is small and near invisible on the site". This cuts the wordmark out of the
square, makes the ground clear, and turns the navy lettering white so it reads
on navy. The traces to its left keep their own colours. Nothing is redrawn.

Run it again only if site/img/logo.jpg is replaced. The result is committed;
the build and the tests do not run this. It needs Pillow and numpy.
After it runs, the image's address must change on every page that shows it
(the ?v= in the tags): tests/pages_test.sh fails until it does.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "site" / "img" / "logo.jpg"
OUT = ROOT / "site" / "img" / "wordmark-on-dark.png"

LETTERS = (244, 247, 251)      # the lettering on dark ground: the site's near-white
REACH = 4                      # how far, in pixels, to look for the solid colour beside an edge
PAD = 6                        # clear pixels kept around the wordmark
WIDTH = 520                    # the saved width: over three times the widest it is shown


def solid_and_cover(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For art on white: the solid colour nearest each pixel, and how much of the pixel it covers."""
    p = rgb.astype(np.float32)
    away = 255.0 - p                                   # how far from white, per channel
    d = (away ** 2).sum(axis=2)
    best, solid = d.copy(), p.copy()
    for dy in range(-REACH, REACH + 1):
        for dx in range(-REACH, REACH + 1):
            if dy == 0 and dx == 0:
                continue
            sd = np.roll(np.roll(d, dy, axis=0), dx, axis=1)
            sp = np.roll(np.roll(p, dy, axis=0), dx, axis=1)
            take = sd > best
            best = np.where(take, sd, best)
            solid = np.where(take[..., None], sp, solid)
    away_solid = 255.0 - solid
    cover = (away * away_solid).sum(axis=2) / np.maximum((away_solid ** 2).sum(axis=2), 1.0)
    cover = np.clip(cover, 0, 1)
    cover[best < 30 ** 2] = 0                          # nothing but paper near here
    # the file is a JPEG: the ripples it leaves beside every edge are not ink
    cover = np.clip((cover - 0.16) / 0.80, 0, 1)
    return solid, cover


def main() -> None:
    if not SOURCE.is_file():
        sys.exit(f"logo_cutout: {SOURCE} is missing")
    solid, cover = solid_and_cover(np.asarray(Image.open(SOURCE).convert("RGB")))
    lettering = solid.max(axis=2) < 125                # the navy letters; the traces are bright
    solid[lettering] = LETTERS
    ys, xs = np.where(cover > 0.5)
    if not len(xs):
        sys.exit("logo_cutout: found no wordmark in the logo")
    x0, y0 = max(xs.min() - PAD, 0), max(ys.min() - PAD, 0)
    x1, y1 = min(xs.max() + 1 + PAD, cover.shape[1]), min(ys.max() + 1 + PAD, cover.shape[0])
    rgba = np.dstack([np.clip(solid, 0, 255), cover * 255]).astype(np.uint8)[y0:y1, x0:x1]
    rgba[rgba[..., 3] == 0] = 0                        # clear pixels carry no colour: a smaller file
    im = Image.fromarray(rgba, "RGBA")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    # 256 colours with their own transparency: a fifth of the bytes, no visible difference at this size
    im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}: {im.width} x {im.height}")


if __name__ == "__main__":
    main()
