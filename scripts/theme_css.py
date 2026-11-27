#!/usr/bin/env python3
"""Keep the main pages' colours on the shared variables, so the site has a light version.

  python3 scripts/theme_css.py            # rewrite the listed colours as variables in the files below
  python3 scripts/theme_css.py --check    # exit 1 if any of them still writes one out

Why. The owner, 2026-11-27: "Spatacco analytics should have a light/dark option and
should make mention somewhere of my tendency to create both light/dark versions of
the sites because it makes a difference for different environments."

How. The pages were drawn for the navy ground, in a handful of colours: the navy,
white ink, four greys, cyan, blue and purple, and washes of them. Each of those is a
variable (site/css/shared.css, DARK and LIGHT below). In the dark version a variable
holds the colour the page always had, so nothing there changes. On a page whose
<html> carries data-theme="light" each holds its light counterpart: the ground is
near white, the ink is the navy, the cyan is a teal dark enough to read on white.

A colour written out does not change with the theme, and on the light ground a pale
grey or a bright cyan cannot be read. So: write var(--g2), not #CBD5E1, or write the
colour and run this. What stays written out on purpose:
  - a colour that is the same in both versions (a white tile under a logo, the
    paper colours of the PDF, a tool's own look);
  - the declarations of the variables themselves;
  - ::selection, and anything in a comment or in a script.

The menu, the footer and the market strip stay navy in both versions, and a section
that was light from the start stays as it was drawn: inside them the variables hold
their first values again (KEEP_DARK below).

tests/pages_test.sh runs --check, and tests/theme_browser.cjs opens every page in
both versions and measures the contrast of every piece of text.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

SHEETS = ["site/css/shared.css", "site/css/cite.css", "site/css/insights.css"]
PAGES = [
    "site/index.html", "site/services/index.html", "site/approach/index.html", "site/about/index.html",
    "site/contact/index.html", "site/tools/index.html", "site/tools/website-scorer/index.html",
]

# A colour written as six hex digits, and the variable that holds it in the dark version.
HEX = {
    "#0F1B2D": "var(--navy)", "#162640": "var(--navy-light)", "#1C3352": "var(--navy-mid)",
    "#3DD8D8": "var(--cyan)", "#5EE4E4": "var(--cyan-light)",
    "#5B8DEF": "var(--blue)", "#7B5CFF": "var(--purple)", "#9B82FF": "var(--purple-light)",
    "#E2E8F0": "var(--g1)", "#CBD5E1": "var(--g2)", "#A9B8CC": "var(--g3)", "#8FA0B8": "var(--g4)",
    "#94A3B8": "var(--text-light)",
}
# A wash: rgba(r,g,b,alpha) becomes rgba(var(--name),alpha), the variable holding "r,g,b".
RGB = {
    (61, 216, 216): "--cy", (255, 255, 255): "--lift", (203, 213, 225): "--line",
    (15, 27, 45): "--nv", (123, 92, 255): "--pu", (91, 141, 239): "--bl",
}

# The two palettes, as shared.css declares them (tests/pages_test.sh holds the file to these).
DARK = {
    "--navy": "#0F1B2D", "--navy-light": "#162640", "--navy-mid": "#1C3352",
    "--cyan": "#3DD8D8", "--cyan-light": "#5EE4E4", "--purple": "#7B5CFF", "--purple-light": "#9B82FF", "--blue": "#5B8DEF",
    "--white": "#FFFFFF", "--text-light": "#94A3B8",
    "--g1": "#E2E8F0", "--g2": "#CBD5E1", "--g3": "#A9B8CC", "--g4": "#8FA0B8",
    "--cy": "61,216,216", "--lift": "255,255,255", "--line": "203,213,225", "--nv": "15,27,45", "--pu": "123,92,255", "--bl": "91,141,239",
}
LIGHT = {
    "--navy": "#F6F8FB", "--navy-light": "#FFFFFF", "--navy-mid": "#E9EEF5",
    "--cyan": "#006E7C", "--cyan-light": "#005A66", "--purple": "#5B3FE0", "--purple-light": "#6A4DF0", "--blue": "#2A5BC7",
    "--white": "#0F1B2D", "--text-light": "#52627A",
    "--g1": "#1E293B", "--g2": "#334155", "--g3": "#475569", "--g4": "#52627A",
    "--cy": "0,110,124", "--lift": "15,27,45", "--line": "15,27,45", "--nv": "246,248,251", "--pu": "91,63,224", "--bl": "42,91,199",
}

# What is drawn the same in both versions: inside these the variables hold their first values again. The menu, the
# footer and anything marked .sa-dark stay navy; a section that was light from the start (.section-light, on the
# Services page) was drawn with the same variables meaning what they say (white is white), so it keeps them too.
KEEP_DARK = ["nav", "footer", ".sa-dark", ".section-light"]
# Where the palette rules are written: the shared stylesheet, and the home page, which carries its own styles whole.
HOLDS_PALETTES = ["site/css/shared.css", "site/index.html"]
BEGIN, END = "/* theme:begin (written by scripts/theme_css.py) */", "/* theme:end */"


def block() -> str:
    """The rules that declare the two palettes."""
    def decls(d: dict) -> str:
        return ";".join(f"{k}:{v}" for k, v in d.items())
    light = ",".join(f':root[data-theme="light"] {k}' for k in KEEP_DARK)
    return "\n".join([
        BEGIN,
        ":root,.sa-dark{" + decls(DARK) + "}",
        ':root[data-theme="light"]{' + decls(LIGHT) + "}",
        light + "{" + decls(DARK) + "}",
        # the menu is a little see-through: over a light page that reads as grey, so there it is all but solid
        ':root[data-theme="light"] nav{background:rgba(15,27,45,0.97)}',
        END,
    ])


def palettes(text: str) -> str:
    """A stylesheet with the palette rules as this script holds them, after its own :root rule."""
    if BEGIN in text and END in text:
        a, b = text.index(BEGIN), text.index(END) + len(END)
        return text[:a] + block() + text[b:]
    m = re.search(r":root\s*\{[^{}]*--navy:[^{}]*\}\n", text)
    if not m:
        raise SystemExit("a stylesheet that should hold the palettes no longer declares its colours in a :root rule")
    return text[:m.end()] + "\n" + block() + "\n" + text[m.end():]


COMMENT = re.compile(r"/\*.*?\*/", re.S)
RULE = re.compile(r"([^{}]*)\{([^{}]*)\}")
HEX6 = re.compile(r"#[0-9A-Fa-f]{6}\b")
RGBA = re.compile(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)")


def value(v: str) -> str:
    """One declaration's value, its listed colours as variables."""
    v = HEX6.sub(lambda m: HEX.get(m.group(0).upper(), m.group(0)), v)

    def wash(m: re.Match) -> str:
        name = RGB.get((int(m.group(1)), int(m.group(2)), int(m.group(3))))
        return f"rgba(var({name}),{m.group(4)})" if name else m.group(0)
    return RGBA.sub(wash, v)


def rule(m: re.Match) -> str:
    sel, body = m.group(1), m.group(2)
    if "::selection" in sel:
        return m.group(0)
    out = []
    for decl in body.split(";"):
        prop, colon, val = decl.partition(":")
        if colon and not prop.strip().startswith("--"):
            decl = prop + colon + value(val)
        out.append(decl)
    return sel + "{" + ";".join(out) + "}"


def css(text: str) -> str:
    """A stylesheet's text: every rule outside a comment."""
    parts, at = [], 0
    for c in COMMENT.finditer(text):
        parts.append(RULE.sub(rule, text[at:c.start()]))
        parts.append(c.group(0))
        at = c.end()
    parts.append(RULE.sub(rule, text[at:]))
    return "".join(parts)


def page(text: str) -> str:
    """A page: its <style> blocks only. Scripts and markup are left as they are."""
    return re.sub(r"(?is)(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + css(m.group(2)) + m.group(3), text)


def main() -> int:
    check = "--check" in sys.argv[1:]
    bad = []
    for rel in SHEETS + PAGES:
        path = ROOT_DIR / rel
        old = path.read_text(encoding="utf-8")
        new = css(old) if rel.endswith(".css") else page(old)
        if rel in HOLDS_PALETTES:
            new = palettes(new)
        if new != old:
            if check:
                bad.append(rel)
            else:
                path.write_text(new, encoding="utf-8")
                print("rewrote", rel)
    if check:
        if bad:
            print("a colour is written out where its variable belongs (run scripts/theme_css.py): " + ", ".join(bad))
            return 1
        print(f"ok: {len(SHEETS + PAGES)} files, every listed colour on its variable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
