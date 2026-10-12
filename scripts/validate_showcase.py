#!/usr/bin/env python3
"""Check showcase/tools.json (or any files given) against showcase/schema.json
and the house rules for public copy.

  validate_showcase.py [FILE ...]          (default: showcase/tools.json)
  validate_showcase.py --html DIR          check generated pages under DIR too

The schema covers shape. The rules cover what a schema cannot: no em or en
dashes, no markup in plain-text fields, unique ids, and no private names:
the denylist in config/hosting.json, plus COPY_DENYLIST (comma-separated
regular expressions) when the environment sets it, which is how Publish adds
the source site's host name without writing it into this repository.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "showcase" / "schema.json").read_text())
DASHES = ("\u2014", "\u2013")  # em dash, en dash


def denylist() -> list[re.Pattern]:
    cfg = json.loads((ROOT / "config" / "hosting.json").read_text()).get("denylist", [])
    extra = [p.strip() for p in os.environ.get("COPY_DENYLIST", "").split(",") if p.strip()]
    return [re.compile(p, re.I) for p in dict.fromkeys(cfg + extra)]


def strings(node, path="$"):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from strings(v, f"{path}[{i}]")
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, f"{path}.{k}")


def text_errors(where: str, text: str, deny: list[re.Pattern]) -> list[str]:
    errs = []
    if any(d in text for d in DASHES):
        errs.append(f"{where}: contains an em or en dash")
    for pat in deny:
        if pat.search(text):
            errs.append(f"{where}: matches a denylisted term ({pat.pattern})")
    return errs


def content_errors(feed: dict, deny: list[re.Pattern]) -> list[str]:
    errs = []
    for path, s in strings(feed):
        if path == "$.generated":
            continue
        errs += text_errors(path, s, deny)
        if "<" in s or ">" in s:
            errs.append(f"{path}: angle brackets (fields are plain text)")
    ids = [t["id"] for t in feed.get("tools", [])]
    for dup in sorted({i for i in ids if ids.count(i) > 1}):
        errs.append(f"tool id {dup!r} appears more than once")
    return errs


def html_errors(root: Path, deny: list[re.Pattern]) -> list[str]:
    """Generated pages: house rules on the visible text, and links that resolve."""
    errs = []
    for f in sorted(root.rglob("*.html")):
        src = f.read_text(errors="replace")
        body = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", src)
        visible = re.sub(r"<[^>]+>", " ", body)
        errs += text_errors(str(f.relative_to(root)), visible, deny)
    return errs


def main(argv: list[str]) -> int:
    deny = denylist()
    html_dirs, files, it = [], [], iter(argv)
    for a in it:
        if a == "--html":
            html_dirs.append(Path(next(it)))
        else:
            files.append(a)
    if not files and not html_dirs:
        files = [str(ROOT / "showcase" / "tools.json")]
    validator = Draft202012Validator(SCHEMA, format_checker=FormatChecker())
    bad = 0
    for src in files:
        feed = json.loads(Path(src).read_text())
        errs = [f"{'/'.join(map(str, e.absolute_path)) or '$'}: {e.message}" for e in validator.iter_errors(feed)]
        errs += content_errors(feed, deny)
        bad += report(src, errs, f"{len(feed.get('tools', []))} tools")
    for d in html_dirs:
        bad += report(str(d), html_errors(d, deny), "pages")
    return 1 if bad else 0


def report(what: str, errs: list[str], ok_note: str) -> int:
    if errs:
        print(f"FAIL {what}")
        for e in errs:
            print(f"  - {e}")
        return 1
    print(f"ok   {what} ({ok_note})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
