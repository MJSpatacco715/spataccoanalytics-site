#!/usr/bin/env python3
"""Stamp each shared stylesheet's and script's address with the version of the file.

  python3 scripts/asset_versions.py            # write the current ?v= into every tag
  python3 scripts/asset_versions.py --check    # exit 1 if a tag is out of date or has none

Why. The host and Cloudflare keep a stylesheet or a script for a year under its
full address, ?v= included (CLAUDE.md, "Pages are never kept by the host's page
cache"). So when one of these files changes, its address has to change with it,
on every page that asks for it, or a returning visitor never gets the new file.
The version is the first eight characters of the file's SHA-1.

Run it after changing any file in ASSETS. tests/pages_test.sh runs --check, and
tests/market_test.sh holds the strip's two tags to the same rule.

What it reads: every page in site/, and scripts/build_insights.py, which writes
the head of each Insights page. A tag it does not know is left alone.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

# address on the site -> the file it is
ASSETS = {
    "/css/shared.css": "site/css/shared.css",
    "/css/cite.css": "site/css/cite.css",
    "/css/insights.css": "site/css/insights.css",
    "/css/ticker.css": "site/css/ticker.css",
    "/js/ticker.js": "site/js/ticker.js",
}


def version(rel: str) -> str:
    return hashlib.sha1((ROOT_DIR / rel).read_bytes()).hexdigest()[:8]


def stamp(text: str, versions: dict[str, str]) -> str:
    for address, v in versions.items():
        tag = re.compile(r'((?:href|src)=")' + re.escape(address) + r'(?:\?v=[0-9a-f]{8})?(")')
        text = tag.sub(lambda m: m.group(1) + address + "?v=" + v + m.group(2), text)
    return text


def main() -> None:
    check = "--check" in sys.argv[1:]
    versions = {address: version(rel) for address, rel in ASSETS.items()}
    files = sorted((ROOT_DIR / "site").rglob("*.html")) + [ROOT_DIR / "scripts" / "build_insights.py"]
    stale = []
    for path in files:
        before = path.read_text(encoding="utf-8")
        after = stamp(before, versions)
        if after != before:
            stale.append(str(path.relative_to(ROOT_DIR)))
            if not check:
                path.write_text(after, encoding="utf-8")
    if check:
        if stale:
            print("a stylesheet or script changed and its ?v= did not, in: " + ", ".join(stale))
            print("run: python3 scripts/asset_versions.py")
            sys.exit(1)
        print("ok: " + ", ".join(f"{a}?v={v}" for a, v in versions.items()))
    else:
        print("stamped: " + (", ".join(stale) if stale else "nothing, all current"))


if __name__ == "__main__":
    main()
