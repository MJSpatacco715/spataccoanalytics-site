#!/usr/bin/env python3
"""Make the menu's logo from the logo file: the wordmark alone, for dark ground.

  python3 scripts/logo_cutout.py            # site/img/logo.jpg -> site/img/wordmark-on-dark.png
                                            #                   and brand/wordmark-on-dark-large.png

The logo as supplied (site/img/logo.jpg) is the wordmark in navy, small in the
middle of a white square. In the site's navy menu that square was shown 36px
tall, which left the name about 8px tall: the owner, on 2026-11-26, "the logo
is small and near invisible on the site". This cuts the wordmark out of the
square, makes the ground clear, and turns the navy lettering white so it reads
on navy. The traces to its left keep their own colours. Nothing is redrawn.

It writes two files. The small one is the picture the site shows. The large
one (twice the size, edges drawn sharp again) is for the share picture
and the profile pictures that scripts/brand_images.cjs draws; the site does
not serve it.

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
LARGE = ROOT / "brand" / "wordmark-on-dark-large.png"

LETTERS = (244, 247, 251)      # the lettering on dark ground: the site's near-white
REACH = 4                      # how far, in pixels, to look for the solid colour beside an edge
TINT = 22                      # how close a pixel must come to a tint of a colour to count as one
SPECK = 14                     # an island of ink under this many pixels is a JPEG's dot, not the logo
PAD = 6                        # clear pixels kept around the wordmark
WIDTH = 520                    # the saved width: over three times the widest it is shown
TIMES = 2                      # the large copy, for pictures drawn bigger than the site shows it


def solid_and_cover(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For art on white: the solid colour each pixel is a tint of, and how much of the pixel it covers.

    A pixel on an edge is its ink thinned with white. Its ink is looked for among
    the pixels around it: the strongest colour that the pixel could be a tint of.
    A trace beside a letter is therefore never taken for a thin letter.
    """
    p = rgb.astype(np.float32)
    away = 255.0 - p                                   # how far from white, per channel
    solid = p.copy()
    cover = np.ones(p.shape[:2], np.float32)
    strength = (away ** 2).sum(axis=2)                 # of the pixel's own colour
    fit = np.zeros_like(cover)                         # its own colour fits it exactly
    best_strength, best_fit = strength.copy(), fit.copy()
    for dy in range(-REACH, REACH + 1):
        for dx in range(-REACH, REACH + 1):
            if dy == 0 and dx == 0:
                continue
            cand = np.roll(np.roll(p, dy, axis=0), dx, axis=1)
            cand_away = 255.0 - cand
            cand_strength = (cand_away ** 2).sum(axis=2)
            c = np.clip((away * cand_away).sum(axis=2) / np.maximum(cand_strength, 1.0), 0, 1)
            miss = np.sqrt(((away - c[..., None] * cand_away) ** 2).sum(axis=2))
            ok, had = miss < TINT, best_fit < TINT
            take = (ok & (cand_strength > best_strength)) | (~had & (miss < best_fit))
            best_strength = np.where(take, cand_strength, best_strength)
            best_fit = np.where(take, miss, best_fit)
            solid = np.where(take[..., None], cand, solid)
            cover = np.where(take, c, cover)
    cover[best_strength < 30 ** 2] = 0                 # nothing but paper near here
    # the file is a JPEG: the ripples it leaves beside every edge are not ink
    cover = np.clip((cover - 0.16) / 0.80, 0, 1)
    return solid, cover


def without_specks(cover: np.ndarray) -> np.ndarray:
    """Drop the stray dots a JPEG leaves on the paper: any island of ink smaller than a full stop."""
    on = cover > 0.2
    seen = np.zeros_like(on)
    h, w = on.shape
    out = cover.copy()
    for y0, x0 in zip(*np.where(on)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        island, todo = [(y0, x0)], [(y0, x0)]
        while todo:
            y, x = todo.pop()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and on[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    island.append((ny, nx)); todo.append((ny, nx))
        if len(island) < SPECK:
            ys, xs = zip(*island)
            out[ys, xs] = 0
    return out


def smooth_traces(solid: np.ndarray, lettering: np.ndarray, cover: np.ndarray) -> np.ndarray:
    """The traces are smooth blends of colour. The JPEG broke them into blocks: blend them again, within the traces only."""
    trace = ((cover > 0.5) & ~lettering).astype(np.float32)
    k = np.exp(-0.5 * (np.arange(-7, 8) / 2.5) ** 2)
    k /= k.sum()

    def blur(a: np.ndarray) -> np.ndarray:
        a = np.apply_along_axis(lambda r: np.convolve(r, k, mode="same"), 1, a)
        return np.apply_along_axis(lambda c: np.convolve(c, k, mode="same"), 0, a)

    weight = blur(trace)
    out = solid.copy()
    for ch in range(3):
        smooth = blur(solid[..., ch] * trace) / np.maximum(weight, 1e-3)
        out[..., ch] = np.where((weight > 0.02) & ~lettering, smooth, solid[..., ch])
    return out


def main() -> None:
    if not SOURCE.is_file():
        sys.exit(f"logo_cutout: {SOURCE} is missing")
    solid, cover = solid_and_cover(np.asarray(Image.open(SOURCE).convert("RGB")))
    cover = without_specks(cover)
    lettering = solid.max(axis=2) < 125                # the navy letters; the traces are bright
    solid = smooth_traces(solid, lettering, cover)
    solid[lettering] = LETTERS
    ys, xs = np.where(cover > 0.5)
    if not len(xs):
        sys.exit("logo_cutout: found no wordmark in the logo")
    x0, y0 = max(xs.min() - PAD, 0), max(ys.min() - PAD, 0)
    x1, y1 = min(xs.max() + 1 + PAD, cover.shape[1]), min(ys.max() + 1 + PAD, cover.shape[0])
    rgba = np.dstack([np.clip(solid, 0, 255), cover * 255]).astype(np.uint8)[y0:y1, x0:x1]
    large(rgba.copy())
    rgba[rgba[..., 3] == 0] = 0                        # clear pixels carry no colour: a smaller file
    im = Image.fromarray(rgba, "RGBA")
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    # 256 colours with their own transparency: a fifth of the bytes, no visible difference at this size
    im = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    im.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)}: {im.width} x {im.height}")


def large(rgba: np.ndarray) -> None:
    """The same wordmark at twice the size. Enlarging blurs an edge, so each edge is drawn sharp again."""
    h, w = rgba.shape[:2]
    size = (w * TIMES, h * TIMES)
    colour = Image.fromarray(rgba[..., :3], "RGB").resize(size, Image.BICUBIC)
    cover = np.asarray(Image.fromarray(rgba[..., 3], "L").resize(size, Image.BICUBIC)).astype(np.float32) / 255
    cover = np.clip((cover - 0.5) * TIMES + 0.5, 0, 1)
    out = np.dstack([np.asarray(colour), (cover * 255).astype(np.uint8)])
    out[out[..., 3] == 0] = 0
    LARGE.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(LARGE, optimize=True)
    print(f"wrote {LARGE.relative_to(ROOT)}: {size[0]} x {size[1]}")


if __name__ == "__main__":
    main()
