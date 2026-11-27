#!/usr/bin/env python3
"""Keep the main pages' sizes in rem, so the whole design grows with the window.

  python3 scripts/scale_css.py            # rewrite px sizes as rem in the files below
  python3 scripts/scale_css.py --check    # exit 1 if any of them still has a px size

Why. The owner, 2026-11-27, with the site at 100% beside the same page zoomed to
150%: "the site looks better at 150% size than 100%, there should be some
adjustment. with a target market of 50-80 year olds I shouldn't ask people to
squint". Shown three sizes, the owner chose to match the 150% view.

How. Every size on these pages is a multiple of the root font size (rem), and on a
page marked class="sa-scale" the root font size follows the window (ROOT below):
16px up to a window 1255px wide,
which is the owner's own window at 150% and the size the pages were laid out
for, then growing in step with the window, so a 1920px screen at 100% shows what
the owner sees at 150%. It stops at 28px (175%). It follows the window's height
too, so a wide but short window does not get a page too tall for it.

A size written in px does not grow, and would leave that one thing small on a
big screen. So: write sizes in rem (px / 16), or write px and run this. What
stays px on purpose:
  - 1px and under: hairlines stay hairlines;
  - the widths in @media (...) conditions: they are about the window, not the page;
  - comments.

On a phone no text is under 13px (the owner, asked: "Yes, 13px floor"): a font
size under 13px is written max(size, var(--tfloor)), and --tfloor is 13px up to
760px wide and nothing above it. This script writes that too.

tests/pages_test.sh runs --check, and tests/scale_browser.cjs opens the pages.
Each tool's own page (the trackers, the explainers, the resume parser) is not
in the list yet. It does not carry the mark, so it is drawn as it always was.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# The stylesheets, whole; and the pages, whose <style> blocks and style="" attributes are read.
SHEETS = ["site/css/shared.css", "site/css/cite.css", "site/css/ticker.css", "site/css/insights.css"]
PAGES = [
    "site/index.html", "site/services/index.html", "site/approach/index.html", "site/about/index.html",
    "site/contact/index.html", "site/tools/index.html", "site/tools/website-scorer/index.html",
    "site/privacy/index.html",
]

# A page grows only if it says so: its <html> carries class="sa-scale" (MARK). A page that
# does not is drawn at 16px, as it always was, so one whose own styles are still px (each
# tool's own page) is not left with a big menu over small text. The Insights pages carry
# the mark too: scripts/build_insights.py writes it, and their stylesheet is in SHEETS.
# The two rules every scaled page needs, word for word (tests/pages_test.sh looks for them).
ROOT = "html.sa-scale{font-size:clamp(16px,min(calc(100vw / 78.4375),calc(100vh / 37.9375)),28px)}"
MARK = '<html lang="en" class="sa-scale">'
FLOOR = ":root{--tfloor:0px}\n@media(max-width:760px){:root{--tfloor:0.8125rem}}"

PX = re.compile(r"(?<![\w#.])(-?(?:\d+\.\d+|\d+|\.\d+))px(?![\w-])")
SMALL_FONT = re.compile(r"(font-size:\s*)((?:\d+\.\d+|\d+|\.\d+))rem(?=\s*(?:!important)?\s*[;}\"]|\s*$)")
FLOOR_REM = 13 / 16


def rem(px: float) -> str:
    return ("%.5f" % (px / 16)).rstrip("0").rstrip(".") + "rem"


def sizes(text: str) -> str:
    """One run of CSS with no comment and no @media condition in it."""
    def one(m: re.Match) -> str:
        n = float(m.group(1))
        return m.group(0) if abs(n) <= 1 else rem(n)
    text = PX.sub(one, text)

    def floor(m: re.Match) -> str:
        return m.group(0) if float(m.group(2)) >= FLOOR_REM else f"{m.group(1)}max({m.group(2)}rem,var(--tfloor,0px))"
    return SMALL_FONT.sub(floor, text)


KEEP = re.compile(r"/\*.*?\*/|@media[^{]*\{|html\.sa-scale\{font-size:clamp\([^}]*\}|--tfloor:[^;}]*", re.S)


def css(text: str) -> str:
    """A stylesheet: everything but its comments, its @media conditions and the two rules above."""
    out, at = [], 0
    for m in KEEP.finditer(text):
        out.append(sizes(text[at:m.start()])); out.append(m.group(0)); at = m.end()
    out.append(sizes(text[at:]))
    return "".join(out)


STYLE_BLOCK = re.compile(r"(<style[^>]*>)(.*?)(</style>)", re.S)
STYLE_ATTR = re.compile(r'(\sstyle=")([^"]*)(")')


def page(text: str) -> str:
    """A page: its <style> blocks and its style="" attributes. Scripts and words are left alone."""
    def block(m: re.Match) -> str:
        return m.group(1) + css(m.group(2)) + m.group(3)
    # scripts are cut out first, so that a style="" written inside one is not touched
    parts = re.split(r"(<script\b.*?</script>)", text, flags=re.S)
    for i in range(0, len(parts), 2):
        parts[i] = STYLE_BLOCK.sub(block, parts[i])
        parts[i] = STYLE_ATTR.sub(lambda m: m.group(1) + sizes(m.group(2)) + m.group(3), parts[i])
    return "".join(parts)


def main() -> None:
    check = "--check" in sys.argv[1:]
    stale, unmarked = [], []
    for rel in SHEETS + PAGES:
        path = ROOT_DIR / rel
        before = path.read_text(encoding="utf-8")
        after = css(before) if rel.endswith(".css") else page(before)
        if after != before:
            stale.append(rel)
            if not check:
                path.write_text(after, encoding="utf-8")
        if rel.endswith(".html") and MARK not in after:
            unmarked.append(rel)
    if unmarked:
        print("no " + MARK + " in: " + ", ".join(unmarked))
        sys.exit(1)
    if check:
        if stale:
            print("a size in px, or a font under 13px with no floor, in: " + ", ".join(stale))
            print("write it in rem, or run: python3 scripts/scale_css.py")
            sys.exit(1)
        print("ok: %d files, every size in rem" % len(SHEETS + PAGES))
    else:
        print("rewrote: " + (", ".join(stale) if stale else "nothing, all in rem already"))


if __name__ == "__main__":
    main()
