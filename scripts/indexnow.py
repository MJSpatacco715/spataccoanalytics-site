#!/usr/bin/env python3
"""Tell Bing which pages a publish changed (IndexNow).

  git diff --name-only BEFORE AFTER | python3 scripts/indexnow.py --site site --dist dist

Reads the changed repository paths on standard input and prints the request
IndexNow expects (https://www.indexnow.org/documentation), or nothing when no
page changed. Bing and the engines that share IndexNow then fetch those pages
at once. Google does not take part: it reads the sitemap.

Rules:
- A page is named only if the built sitemap lists it, so a page kept out of
  search (noindex, delisted, private) is never sent.
- Only pages are named. A stylesheet, script or picture changing names nothing.
- The key is the one 32-character .txt file in the site's root whose content
  is its own name. It is public by design: the search engine reads it from the
  site to see that the request came from the site's owner.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BASE = "https://spataccoanalytics.com"
HOST = "spataccoanalytics.com"


def fail(msg: str) -> None:
    print(f"indexnow: {msg}", file=sys.stderr)
    sys.exit(1)


def key_of(site: Path) -> str:
    keys = [f.stem for f in site.glob("*.txt")
            if re.fullmatch(r"[0-9a-f]{32}", f.stem) and f.read_text(encoding="utf-8").strip() == f.stem]
    if len(keys) != 1:
        fail(f"expected one key file in {site}, found {len(keys)}")
    return keys[0]


def pages_for(path: str) -> list[str]:
    """The addresses a changed repository path can change."""
    path = path.strip()
    # a post file is YYYY-MM-DD-slug.json and is published at /insights/slug/
    m = re.fullmatch(r"content/posts/\d{4}-\d{2}-\d{2}-([a-z0-9]+(?:-[a-z0-9]+)*)\.json", path)
    if m:
        return [f"/insights/{m.group(1)}/", "/insights/"]
    if path.startswith("showcase/"):
        return ["/tools/"]
    if path == "content/site.json":
        return ["/"]          # the firm's details in what search engines read on the home page
    if not path.startswith("site/") or not path.endswith(".html"):
        return []
    rel = path[len("site/"):]
    if rel == "index.html":
        return ["/"]
    if rel.endswith("/index.html"):
        return ["/" + rel[: -len("index.html")]]
    return ["/" + rel]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="site")
    ap.add_argument("--dist", default="dist")
    a = ap.parse_args()

    sitemap = Path(a.dist) / "sitemap.xml"
    if not sitemap.is_file():
        fail(f"{sitemap} is not built")
    listed = set(re.findall(r"<loc>([^<]+)</loc>", sitemap.read_text(encoding="utf-8")))

    urls: list[str] = []
    for line in sys.stdin:
        pages = pages_for(line)
        if pages and pages[0].startswith("/insights/") and BASE + pages[0] not in listed:
            continue        # a draft or an unpublished post: the Insights page did not change either
        for page in pages:
            url = BASE + page
            if url in listed and url not in urls:
                urls.append(url)
    if not urls:
        return
    key = key_of(Path(a.site))
    print(json.dumps({"host": HOST, "key": key, "keyLocation": f"{BASE}/{key}.txt", "urlList": urls}))


if __name__ == "__main__":
    main()
