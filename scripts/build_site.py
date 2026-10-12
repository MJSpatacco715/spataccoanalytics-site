#!/usr/bin/env python3
"""Build the deployable site into dist/.

  build_site.py [--site DIR] [--out DIR] [--metrics FILE] [--shots DIR]

1. Copies the main site's managed files (--site, default site/) into --out.
2. Applies site-edits.json (approved copy edits and the card markers).
3. Fills the NFL cards between the markers on tools/index.html, in the page's
   own Sports Desk "scorecard" markup.
4. Writes one page per tool at tools/football/<id>.html, using the tools
   page's own head, navigation and footer, so the pages match the site.
5. Copies each tool's screenshot: a fresh capture from --shots when there is
   one, otherwise the committed baseline in showcase/img/.

Every value from showcase/tools.json and the metrics file is escaped.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
START = "<!-- sa-tools:nfl-cards:start -->"
END = "<!-- sa-tools:nfl-cards:end -->"
ET = ZoneInfo("America/New_York")
STATUS = {"production": "Live", "beta": "Beta", "development": "In development"}


def esc(v) -> str:
    return html.escape(str(v), quote=True)


def fail(msg: str) -> None:
    print(f"build: {msg}", file=sys.stderr)
    sys.exit(1)


def apply_edits(out: Path, edits: list[dict]) -> None:
    for e in edits:
        f = out / e["file"]
        if not f.is_file():
            fail(f"edit target missing: {e['file']}")
        s = f.read_text()
        if e["replace"] in s:
            continue
        if e["find"] not in s:
            fail(f"edit no longer applies to {e['file']} ({e['why']}): neither the old nor the new text is there")
        f.write_text(s.replace(e["find"], e["replace"], 1))


def day(ymd: str | None) -> str | None:
    if not ymd:
        return None
    d = datetime.strptime(ymd, "%Y-%m-%d")
    return f"{d:%b} {d.day}, {d.year}"


def moment(iso: str | None) -> str | None:
    if not iso:
        return None
    t = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ET)
    return f"{t:%b} {t.day}, {t:%I:%M %p}".replace(" 0", " ") + " ET"


def fmt_num(v) -> str:
    return f"{v:,}" if isinstance(v, int) else str(v)


def metrics_for(tool: dict, live: dict) -> list[dict]:
    got = live.get("metrics", {})
    rows = []
    for m in tool.get("metrics", []):
        value = fmt_num(got[m["key"]]) if m.get("key") in got else m["value"]
        rows.append({"label": m["label"], "value": value})
    return rows


def image_for(tool: dict, shots: Path | None, dest: Path) -> str | None:
    """Fresh capture if there is one, else the baseline. Returns the public URL."""
    src = None
    for cand in ([shots / f"{tool['id']}.png"] if shots else []) + [ROOT / "showcase" / "img" / f"{tool['id']}.png"]:
        if cand.is_file():
            src = cand
            break
    if not src:
        return None
    dest.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image  # optional: smaller files when available
        im = Image.open(src).convert("RGB")
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        out = dest / f"{tool['id']}.jpg"
        im.save(out, "JPEG", quality=84, optimize=True, progressive=True)
    except ImportError:
        out = dest / f"{tool['id']}.png"
        shutil.copyfile(src, out)
    v = hashlib.sha1(out.read_bytes()).hexdigest()[:10]
    return f"/tools/football/img/{out.name}?v={v}"


def card(tool: dict, n: int) -> str:
    return f"""          <a href="/tools/football/{esc(tool['id'])}.html" class="scorecard">
            <span class="scorecard-num">Sport &middot; {n:02d}</span>
            <span class="scorecard-icon">{esc(tool['emoji'])}</span>
            <h4>{esc(tool['name'])}</h4>
            <p>{esc(tool['tagline'])}</p>
            <div class="scorecard-foot">
              <span class="scorecard-stat">Live data</span>
              <span class="scorecard-launch">See it</span>
            </div>
          </a>"""


def chrome(tools_page: str) -> tuple[str, str, str]:
    """The tools page's <head> contents, navigation and footer-to-end."""
    head = re.search(r"(?is)<head>(.*?)</head>", tools_page)
    nav = re.search(r'(?is)<nav id="main-nav">.*?</nav>', tools_page)
    foot = re.search(r"(?is)<footer>.*?</html>", tools_page)
    if not (head and nav and foot):
        fail("tools/index.html no longer has the <head>, <nav id=\"main-nav\"> and <footer> this build reuses")
    return head.group(1), nav.group(0), foot.group(0)


PAGE_CSS = """
.nfl-wrap{max-width:1100px;margin:0 auto}
.nfl-stamp{display:flex;flex-wrap:wrap;gap:10px 24px;font-family:'Courier Prime',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#3A4150;margin:0 0 18px}
.nfl-stamp b{color:#1A4D3A;font-weight:700}
.nfl-live{display:inline-flex;align-items:center;gap:8px}
.nfl-live::before{content:"";width:8px;height:8px;border-radius:50%;background:#1A9D5B;box-shadow:0 0 0 3px rgba(26,157,91,.18)}
.nfl-shot{margin:0 0 40px;border-radius:8px;overflow:hidden;border:1px solid #D4D6CE;background:#fff;box-shadow:0 18px 40px rgba(12,31,63,.12)}
.nfl-shot::before{content:"";display:block;height:6px;background:repeating-linear-gradient(90deg,#1A4D3A 0,#1A4D3A 14px,#235847 14px,#235847 28px)}
.nfl-shot img{display:block;width:100%;height:auto}
.nfl-shot figcaption{font-size:12px;color:#4A5060;padding:10px 16px;border-top:1px solid #E5E7E0}
.nfl-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:0 0 40px}
.nfl-metric{background:linear-gradient(170deg,#0C1F3F 0%,#0A1626 100%);border-radius:6px;padding:18px 20px;position:relative;overflow:hidden}
.nfl-metric::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#3DD8D8 0%,#F4D744 100%)}
.nfl-metric dd{font-family:'DM Sans',sans-serif;font-size:26px;font-weight:700;color:#fff;margin:0 0 4px;font-variant-numeric:tabular-nums}
.nfl-metric dt{font-family:'Courier Prime',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(244,215,68,.85)}
.nfl-cols{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:48px}
.nfl-cols h2{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:600;color:#0C1F3F;margin:0 0 14px}
.nfl-cols p{font-size:15px;line-height:1.75;color:var(--text);margin:0 0 18px}
.nfl-list{margin:0;padding:0;list-style:none}
.nfl-list li{font-size:14px;line-height:1.6;color:var(--text);padding:10px 0 10px 22px;border-bottom:1px dashed #D4D6CE;position:relative}
.nfl-list li::before{content:"";position:absolute;left:2px;top:17px;width:8px;height:8px;background:#F4D744;border:1px solid #1A4D3A;transform:rotate(45deg)}
.nfl-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px;padding:0;list-style:none}
.nfl-chips li{font-size:12px;padding:4px 10px;border-radius:3px;background:#0C1F3F;color:#3DD8D8;letter-spacing:.5px}
.nfl-note{font-size:13px;color:var(--slate);font-style:italic;border-left:3px solid #1A4D3A;padding:4px 0 4px 14px}
.nfl-back{display:inline-block;margin-top:40px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;color:#1A4D3A;text-decoration:none}
.nfl-back::before{content:'\\2190  '}
.nfl-more{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}
.nfl-more a{font-size:13px;color:#1A4D3A;font-weight:600}
@media (max-width:860px){.nfl-cols{grid-template-columns:1fr;gap:28px}}
"""


def page(tool: dict, live: dict, img: str | None, all_tools: list[dict], head: str, nav: str, foot: str) -> str:
    head = re.sub(r"(?is)<title>.*?</title>", f"<title>{esc(tool['name'])} | Spatacco Analytics</title>", head, count=1)
    head = re.sub(r'(?is)<meta name="description" content="[^"]*">',
                  f'<meta name="description" content="{esc(tool["tagline"])}">', head, count=1)
    head = head.replace("</style>", PAGE_CSS + "</style>", 1)

    stamp = []
    when = moment(live.get("data_as_of"))
    stamp.append(f'<span class="nfl-live">{esc(STATUS.get(tool["status"], "Live"))}</span>')
    if when:
        stamp.append(f"<span>Data as of <b>{esc(when)}</b></span>")
    improved = day(live.get("improved"))
    if improved:
        stamp.append(f"<span>Last improved <b>{esc(improved)}</b></span>")

    figure = ""
    if img:
        figure = (f'<figure class="nfl-shot reveal"><img src="{esc(img)}" alt="{esc(tool["image_alt"])}" loading="eager">'
                  f"<figcaption>Screenshot of the running tool, refreshed automatically.</figcaption></figure>")
    mets = metrics_for(tool, live)
    metrics = ""
    if mets:
        metrics = '<dl class="nfl-metrics reveal">' + "".join(
            f'<div class="nfl-metric"><dd>{esc(m["value"])}</dd><dt>{esc(m["label"])}</dt></div>' for m in mets) + "</dl>"
    highlights = "".join(f"<li>{esc(h)}</li>" for h in tool["highlights"])
    stack = "".join(f"<li>{esc(s)}</li>" for s in tool["stack"])
    sources = ""
    if tool.get("data_sources"):
        sources = f'<p><strong>Data:</strong> {esc(", ".join(tool["data_sources"]))}</p>'
    others = "".join(f'<a href="/tools/football/{esc(t["id"])}.html">{esc(t["name"])}</a>'
                     for t in all_tools if t["id"] != tool["id"])

    body = f"""<body>

{nav}

<section class="page-hero">
  <div class="page-hero-inner">
    <div class="page-hero-tag">Sports Desk &middot; Live NFL tool</div>
    <h1>{esc(tool['name'])}</h1>
    <p class="tools-intro">{esc(tool['tagline'])}</p>
  </div>
</section>

<section class="section-light">
  <div class="nfl-wrap">
    <div class="nfl-stamp">{''.join(stamp)}</div>
    {figure}
    {metrics}
    <div class="nfl-cols">
      <div class="reveal">
        <h2>What it does</h2>
        <p>{esc(tool['summary'])}</p>
        <ul class="nfl-list">{highlights}</ul>
      </div>
      <div class="reveal">
        <h2>How it is built</h2>
        <ul class="nfl-chips" aria-label="Built with">{stack}</ul>
        {sources}
        <p class="nfl-note">The tool runs inside a private platform. This page, its numbers and its screenshot refresh automatically from the live system.</p>
        <div class="nfl-more">{others}</div>
      </div>
    </div>
    <a class="nfl-back" href="/tools/#sports-desk">All tools</a>
  </div>
</section>

{foot}
"""
    return f"<!DOCTYPE html>\n<html lang=\"en\">\n<head>{head}</head>\n{body}"


CACHE_RULES = """# Generated by the site build. These pages and their numbers refresh through
# the day, so the host's cache must ask before reusing them. Screenshots carry
# a version in their address and can be cached for long.
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, max-age=0, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(jpg|png)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=str(ROOT / "site"))
    ap.add_argument("--out", default=str(ROOT / "dist"))
    ap.add_argument("--metrics", default=str(ROOT / "build" / "metrics.json"))
    ap.add_argument("--shots", default=str(ROOT / "build" / "shots"))
    a = ap.parse_args()

    site, out = Path(a.site), Path(a.out)
    if not (site / "tools" / "index.html").is_file():
        fail(f"{site}/tools/index.html not found (import the live site first, or pass --site reference/live for a preview)")
    content = json.loads((ROOT / "showcase" / "tools.json").read_text())
    tools = sorted(content["tools"], key=lambda t: t["order"])
    live_all = json.loads(Path(a.metrics).read_text())["tools"] if Path(a.metrics).is_file() else {}
    shots = Path(a.shots) if Path(a.shots).is_dir() else None

    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(site, out, ignore=shutil.ignore_patterns("LINKS.txt", ".imported"))
    apply_edits(out, json.loads((ROOT / "site-edits.json").read_text())["edits"])

    index = out / "tools" / "index.html"
    s = index.read_text()
    if s.count(START) != 1 or s.count(END) != 1:
        fail("tools/index.html must hold exactly one pair of card markers")
    cards = "\n".join(card(t, i + 1) for i, t in enumerate(tools))
    s = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: f"{START}\n{cards}\n{END}", s, flags=re.S)
    index.write_text(s)

    head, nav, foot = chrome(s)
    football = out / "tools" / "football"
    football.mkdir(parents=True, exist_ok=True)
    (football / ".htaccess").write_text(CACHE_RULES)
    for t in tools:
        live = live_all.get(t["id"], {})
        img = image_for(t, shots, football / "img")
        (football / f"{t['id']}.html").write_text(page(t, live, img, tools, head, nav, foot))
    print(f"built {out}: {len(tools)} cards on tools/index.html, {len(tools)} tool pages")


if __name__ == "__main__":
    main()
