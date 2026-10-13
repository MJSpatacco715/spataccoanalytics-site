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


def desk_cards(tools_page: str) -> list[dict]:
    """Every card in the tools page's Sports Desk panel, in its order, so the
    tool pages link the whole desk (the explainers too) and stay in step with
    it."""
    m = re.search(r'(?s)<div class="subgroup subgroup-stadium[^"]*"[^>]*>(.*?)(?=<div class="subgroup |</section>)', tools_page)
    if not m:
        fail("tools/index.html no longer has the Sports Desk panel (subgroup-stadium)")
    cards = []
    for href, inner in re.findall(r'(?s)<a href="([^"]+)" class="scorecard">(.*?)</a>', m.group(1)):
        icon = re.search(r'(?s)<span class="scorecard-icon">(.*?)</span>', inner)
        name = re.search(r"(?s)<h4>(.*?)</h4>", inner)
        cards.append({"href": html.unescape(href), "html": f'<a href="{href}" class="scorecard">{inner}</a>',
                      "icon": html.unescape(icon.group(1)).strip() if icon else "",
                      "name": html.unescape(re.sub(r"<[^>]+>", "", name.group(1))).strip() if name else href})
    if not cards:
        fail("the Sports Desk panel on tools/index.html has no cards")
    return cards


# Keeps the Sports Desk bar just under the fixed site menu, whatever height the
# menu takes on this screen.
NAVH_JS = """<script>(function(){function s(){var n=document.getElementById('main-nav');if(n)document.documentElement.style.setProperty('--navh',n.offsetHeight+'px')}s();addEventListener('resize',s);addEventListener('load',s)})();</script>"""


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
@media (max-width:860px){.nfl-cols{grid-template-columns:1fr;gap:28px}}
.nfl-crumbs{font-size:12px;letter-spacing:3px;text-transform:uppercase;font-weight:600;color:var(--cyan);margin-bottom:22px}
.nfl-crumbs a{color:var(--cyan);text-decoration:none;border-bottom:1px solid rgba(61,216,216,.35);padding-bottom:2px}
.nfl-crumbs a:hover{color:#fff;border-color:#fff}
.nfl-crumbs .sep{margin:0 10px;color:rgba(61,216,216,.5)}
.nfl-crumbs [aria-current]{color:#CBD5E1}
.nfl-desk{position:sticky;top:var(--navh,76px);z-index:90;background:#0C1F3F;border-bottom:3px solid #1A4D3A;box-shadow:0 6px 18px rgba(12,31,63,.18)}
.nfl-desk-in{max-width:1240px;margin:0 auto;padding:10px 24px;display:flex;align-items:center;gap:14px}
.nfl-desk-back{flex:none;font-size:13px;font-weight:700;color:#0C1F3F;background:#F4D744;text-decoration:none;padding:8px 14px;border-radius:4px;white-space:nowrap}
.nfl-desk-back:hover{background:#fff}
.nfl-desk-label{flex:none;font-size:10px;letter-spacing:4px;text-transform:uppercase;font-weight:700;color:#F4D744;opacity:.8}
.nfl-desk-tabs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.nfl-desk-tabs::-webkit-scrollbar{display:none}
.nfl-desk-tabs a{flex:none;font-size:14px;font-weight:600;color:#E2E8F0;text-decoration:none;padding:8px 14px;border-radius:4px;border:1px solid rgba(61,216,216,.3);white-space:nowrap}
.nfl-desk-tabs a:hover{border-color:#3DD8D8;color:#fff}
.nfl-desk-tabs a[aria-current]{background:#3DD8D8;border-color:#3DD8D8;color:#0C1F3F}
.nfl-desk-tabs .ic{margin-right:6px}
.nfl-moredesk{margin-top:64px}
.nfl-moredesk .subgroup-header{padding-top:40px}
.nfl-allbtn{display:inline-block;margin:28px 0 0;font-size:15px;font-weight:700;color:#fff;background:#0C1F3F;text-decoration:none;padding:14px 24px;border-radius:4px}
.nfl-allbtn:hover{background:#1A4D3A}
@media (max-width:1180px){.nfl-desk-label{display:none}}
@media (max-width:700px){.nfl-desk-in{padding:8px 12px;gap:10px}.nfl-desk-label{display:none}.nfl-desk-tabs a{font-size:13px;padding:7px 11px}.nfl-crumbs{font-size:10px;letter-spacing:2px}}
"""


def page(tool: dict, live: dict, img: str | None, desk: list[dict], head: str, nav: str, foot: str) -> str:
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
    here = f"/tools/football/{tool['id']}.html"
    tabs = "".join(
        f'<a href="{esc(c["href"])}"{" aria-current=\"page\"" if c["href"] == here else ""}>'
        f'<span class="ic" aria-hidden="true">{esc(c["icon"])}</span>{esc(c.get("short") or c["name"])}</a>'
        for c in desk)
    more = "\n".join(c["html"] for c in desk if c["href"] != here)

    body = f"""<body>

{nav}

<section class="page-hero">
  <div class="page-hero-inner">
    <div class="nfl-crumbs" role="navigation" aria-label="You are here"><a href="/tools/">Tools</a><span class="sep" aria-hidden="true">&rsaquo;</span><a href="/tools/#sports-desk">Sports Desk</a><span class="sep" aria-hidden="true">&rsaquo;</span><span aria-current="page">{esc(tool.get('short') or tool['name'])}</span></div>
    <h1>{esc(tool['name'])}</h1>
    <p class="tools-intro">{esc(tool['tagline'])}</p>
  </div>
</section>

<div class="nfl-desk" role="navigation" aria-label="Sports Desk">
  <div class="nfl-desk-in">
    <a class="nfl-desk-back" href="/tools/">&larr; All tools</a>
    <span class="nfl-desk-label">Sports Desk</span>
    <div class="nfl-desk-tabs">{tabs}</div>
  </div>
</div>

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
      </div>
    </div>
    <div class="subgroup subgroup-stadium nfl-moredesk">
      <div class="subgroup-header">
        <span class="subgroup-eyebrow">Sports Desk</span>
        <h3 class="subgroup-title">More from the Sports Desk</h3>
      </div>
      <div class="subgroup-grid">
{more}
      </div>
    </div>
    <a class="nfl-allbtn" href="/tools/">&larr; Back to all tools</a>
  </div>
</section>
{NAVH_JS}

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
    desk = desk_cards(s)
    shorts = {f"/tools/football/{t['id']}.html": t.get("short") for t in tools}
    for c in desk:
        c["short"] = shorts.get(c["href"])
    football = out / "tools" / "football"
    football.mkdir(parents=True, exist_ok=True)
    (football / ".htaccess").write_text(CACHE_RULES)
    for t in tools:
        live = live_all.get(t["id"], {})
        img = image_for(t, shots, football / "img")
        (football / f"{t['id']}.html").write_text(page(t, live, img, desk, head, nav, foot))
    print(f"built {out}: {len(tools)} cards on tools/index.html, {len(tools)} tool pages")


if __name__ == "__main__":
    main()
