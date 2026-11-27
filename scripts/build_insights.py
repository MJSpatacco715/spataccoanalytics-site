#!/usr/bin/env python3
"""The Insights section: posts kept as files, built into pages.

A post is one JSON file in content/posts/, named YYYY-MM-DD-slug.json:

  {"title": "...", "date": "2026-12-01", "category": "practice",
   "summary": "One or two sentences. Also the search and share description.",
   "blocks": [
     {"type": "p", "text": "A paragraph."},
     {"type": "h", "text": "A subheading"},
     {"type": "stat", "value": "35%", "label": "of advisors plan to retire within 10 years",
      "source": {"name": "Cerulli", "year": "2026", "finding": "...", "sample": "...", "url": "https://..."}},
     {"type": "quote", "text": "...", "by": "Who said it"},
     {"type": "list", "items": ["...", "..."]},
     {"type": "link", "text": "Score your website", "url": "/tools/website-scorer/"},
     {"type": "image", "src": "/img/insights/x.png", "alt": "...", "caption": "..."}],
   "linkedin": "Optional: the exact words for the LinkedIn post.",
   "card": "/img/insights/slug.png",
   "draft": true}

card is optional: the post's own picture (drawn by scripts/stat_card.cjs),
shown when the post is shared. It must be a file in site/img/insights/.

Categories: practice (for advisors; the only one shown on the homepage),
markets, business, sports. A stat must carry its source: a post with a
number and no source does not build.

With no published posts nothing is written, and the site is exactly as it
was. `python3 scripts/build_insights.py --linkedin SLUG` prints the words to
post on LinkedIn for one post.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from datetime import date, datetime, timezone
from email.utils import format_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://spataccoanalytics.com"
CATEGORIES = {"practice": "For advisors", "markets": "Markets", "business": "Business", "sports": "Sports"}
HOME_MARK = "<!-- sa-insights -->"
HOME_COUNT = 3


def esc(v) -> str:
    return html.escape(str(v if v is not None else ""), quote=True)


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def safe_url(u: str, where: str) -> str:
    u = str(u or "")
    if not (u.startswith("https://") or u.startswith("/")) or any(c in u for c in '"<> '):
        fail(f"{where}: a link must start with https:// or /, got {u!r}")
    return u


def load(posts_dir: Path, drafts: bool = False) -> list[dict]:
    posts = []
    for f in sorted(posts_dir.glob("*.json")):
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)", f.stem)
        if not m:
            fail(f"{f.name}: name a post YYYY-MM-DD-slug.json, lower case, words joined by hyphens")
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            fail(f"{f.name}: not valid JSON ({e})")
        for k in ("title", "date", "category", "summary", "blocks"):
            if not p.get(k):
                fail(f"{f.name}: missing {k}")
        if p["date"] != m.group(1):
            fail(f"{f.name}: its date field must match the date in its name")
        date.fromisoformat(p["date"])
        if p["category"] not in CATEGORIES:
            fail(f"{f.name}: category must be one of {', '.join(CATEGORIES)}")
        if "\u2014" in json.dumps(p, ensure_ascii=False):
            fail(f"{f.name}: no em dashes on the site")
        for i, b in enumerate(p["blocks"]):
            if b.get("type") == "stat":
                s = b.get("source") or {}
                if not all(s.get(k) for k in ("name", "year", "finding", "url")):
                    fail(f"{f.name}: block {i + 1} is a statistic without a full source (name, year, finding, url)")
        if p.get("card") is not None and not re.fullmatch(r"/img/insights/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|jpg)", str(p["card"])):
            fail(f"{f.name}: card must be a picture in /img/insights/, lower case, .png or .jpg")
        if p.get("draft") and not drafts:
            continue
        p["slug"] = m.group(2)
        p["url"] = f"/insights/{p['slug']}/"
        posts.append(p)
    return sorted(posts, key=lambda p: (p["date"], p["slug"]), reverse=True)


def long_date(ymd: str) -> str:
    d = date.fromisoformat(ymd)
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def block(b: dict, where: str) -> str:
    t = b.get("type")
    if t == "p":
        return f"<p>{esc(b.get('text'))}</p>"
    if t == "h":
        return f"<h2>{esc(b.get('text'))}</h2>"
    if t == "quote":
        by = f"<cite>{esc(b['by'])}</cite>" if b.get("by") else ""
        return f"<blockquote><p>{esc(b.get('text'))}</p>{by}</blockquote>"
    if t == "list":
        return "<ul>" + "".join(f"<li>{esc(x)}</li>" for x in b.get("items", [])) + "</ul>"
    if t == "link":
        return f'<p><a class="in-link" href="{safe_url(b.get("url"), where)}">{esc(b.get("text"))} &rarr;</a></p>'
    if t == "image":
        cap = f"<figcaption>{esc(b['caption'])}</figcaption>" if b.get("caption") else ""
        return f'<figure><img src="{safe_url(b.get("src"), where)}" alt="{esc(b.get("alt"))}" loading="lazy">{cap}</figure>'
    if t == "stat":
        s = b["source"]
        sample = f"<span>{esc(s['sample'])}</span>" if s.get("sample") else ""
        return (f'<div class="in-stat sa-cite" tabindex="0"><div class="in-stat-num">{esc(b.get("value"))}</div>'
                f'<div class="in-stat-label">{esc(b.get("label"))}</div>'
                f'<span class="sa-cite-src">Source: {esc(s["name"])}, {esc(s["year"])}</span>'
                f'<span class="sa-cite-card" role="note"><strong>{esc(s["finding"])}</strong>{sample}'
                f'<a href="{safe_url(s["url"], where)}" target="_blank" rel="noopener">Read the source</a></span></div>')
    fail(f"{where}: unknown block type {t!r}")
    return ""


def shell(title: str, desc: str, path: str, body: str, linkedin: str, extra_head: str = "", image: str = "/img/social-card.png?v=fa9978ce") -> str:
    follow = f' &middot; {sign_off_link(linkedin, "LinkedIn")}' if linkedin else ""
    return f"""<!DOCTYPE html>
<html lang="en" class="sa-scale">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} | Spatacco Analytics</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{path}">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="alternate" type="application/rss+xml" title="Spatacco Analytics Insights" href="/insights/feed.xml">
<meta property="og:site_name" content="Spatacco Analytics">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:image" content="{BASE}{esc(image)}">
<meta name="twitter:card" content="summary_large_image">
{extra_head}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/shared.css?v=6139e5c8">
<link rel="stylesheet" href="/css/cite.css?v=d9368be7">
<link rel="stylesheet" href="/css/insights.css?v=36df3a69">
</head>
<body>
<nav id="main-nav">
  <a href="/" class="brand"><img src="/img/wordmark-on-dark.png?v=da9b4528" alt="Spatacco Analytics" class="logo" width="520" height="163"></a>
  <div class="nav-links">
    <a href="/services/">Services</a>
    <a href="/approach/">Approach</a>
    <a href="/tools/">Tools</a>
    <a href="/about/">About</a>
    <a href="/contact/">Contact</a>
  </div>
</nav>
{body}
<footer>
  <a href="/" class="footer-brand"><img src="/img/logo-square.png" alt="" class="footer-mark" width="512" height="512"><img src="/img/wordmark-on-dark.png?v=da9b4528" alt="Spatacco Analytics" class="footer-logo" width="520" height="163"></a>
  <div class="footer-text">Bala Cynwyd, PA &middot; &copy; 2026 Spatacco Analytics LLC &middot; {sign_off_link("/insights/", "Insights")}{follow}</div>
</footer>
<script src="/js/shared.js"></script>
<script src="/js/cite.js"></script>
</body>
</html>
"""


def card(p: dict) -> str:
    return (f'<a class="in-card" href="{p["url"]}" data-category="{p["category"]}"><span class="in-tag">{esc(CATEGORIES[p["category"]])}</span>'
            f'<h3>{esc(p["title"])}</h3><p>{esc(p["summary"])}</p><span class="in-date">{long_date(p["date"])}</span></a>')


def sign_off_link(url: str, text: str) -> str:
    """A link in a page's last line. Pages style their footers in different
    places and some style no links there at all, where a browser would draw
    one dark blue on the navy footer. So it carries its own look: the colour
    of the line it sits in, underlined. A link off the site opens a new tab."""
    away = ' target="_blank" rel="noopener"' if url.startswith("http") else ""
    return f'<a href="{esc(url)}"{away} style="color:inherit;text-decoration:underline;text-underline-offset:0.1875rem">{esc(text)}</a>'


def linkedin_text(p: dict) -> str:
    if p.get("linkedin"):
        return p["linkedin"].strip() + f"\n\n{BASE}{p['url']}"
    lines = [p["title"], "", p["summary"]]
    stats = [b for b in p["blocks"] if b.get("type") == "stat"][:3]
    if stats:
        lines.append("")
        lines += [f"- {b['value']} {b['label']} ({b['source']['name']}, {b['source']['year']})" for b in stats]
    lines += ["", f"Full piece: {BASE}{p['url']}"]
    return "\n".join(lines)


def build(out: Path, posts_dir: Path | None = None, drafts: bool = False) -> int:
    posts_dir = posts_dir or ROOT / "content" / "posts"
    cfg_file = ROOT / "content" / "site.json"
    cfg = json.loads(cfg_file.read_text()) if cfg_file.is_file() else {}
    linkedin = cfg.get("linkedin_url") or ""
    if linkedin:
        safe_url(linkedin, "content/site.json linkedin_url")

    posts = load(posts_dir, drafts) if posts_dir.is_dir() else []

    # Where the site signs off: the Insights section once it has a post, so a
    # visitor and a search engine can reach it from any page, then the firm's
    # LinkedIn page. The home page also tells search engines the page is the firm's.
    tail = (f' &middot; {sign_off_link("/insights/", "Insights")}' if posts else "") + \
           (f' &middot; {sign_off_link(linkedin, "LinkedIn")}' if linkedin else "")
    if tail:
        sign = "&copy; 2026 Spatacco Analytics LLC"
        for f in out.rglob("*.html"):
            s = f.read_text(encoding="utf-8")
            if sign in s and sign + tail not in s:
                f.write_text(s.replace(sign, sign + tail), encoding="utf-8")
    if linkedin:
        home = out / "index.html"
        s = home.read_text(encoding="utf-8")
        mark = '"@type":"ProfessionalService",'
        if mark in s and '"sameAs"' not in s:
            home.write_text(s.replace(mark, mark + '"sameAs":[' + json.dumps(linkedin) + '],', 1), encoding="utf-8")
    if not posts:
        return 0

    root = out / "insights"
    root.mkdir(parents=True, exist_ok=True)
    follow = (f'<p class="in-follow">New pieces are posted on <a href="{esc(linkedin)}" target="_blank" rel="noopener">LinkedIn</a> as they go up.</p>'
              if linkedin else "")
    for p in posts:
        where = f"{p['date']}-{p['slug']}"
        ld = json.dumps({"@context": "https://schema.org", "@type": "Article", "headline": p["title"], "description": p["summary"],
                         "datePublished": p["date"], "mainEntityOfPage": BASE + p["url"],
                         "author": {"@id": BASE + "/#organization"}, "publisher": {"@id": BASE + "/#organization"}}, separators=(",", ":"))
        body = f"""<section class="page-hero">
  <div class="page-hero-inner">
    <div class="page-hero-tag"><a href="/insights/">Insights</a> &middot; {esc(CATEGORIES[p['category']])}</div>
    <h1>{esc(p['title'])}</h1>
    <p class="page-hero-sub">{long_date(p['date'])}</p>
  </div>
</section>
<section class="section-light">
  <article class="in-post">
    <p class="in-summary">{esc(p['summary'])}</p>
    {''.join(block(b, where) for b in p['blocks'])}
    <div class="in-end">
      <p>Spatacco Analytics builds and fixes the digital front office of independent advisory firms: websites, CRM, and data.</p>
      <p><a class="btn-primary" href="/tools/website-scorer/?scope=website&amp;utm_source=insights">Score your website, free</a> <a class="in-link" href="/services/?utm_source=insights">See services &rarr;</a></p>
      {follow}
    </div>
  </article>
</section>"""
        d = root / p["slug"]
        d.mkdir(parents=True, exist_ok=True)
        image = "/img/social-card.png?v=fa9978ce"
        if p.get("card"):
            if not (out / p["card"].lstrip("/")).is_file():
                fail(f"{where}: its card {p['card']} is not in site/img/insights/")
            image = p["card"]
        (d / "index.html").write_text(shell(p["title"], p["summary"], p["url"], body, linkedin, f'<script type="application/ld+json">{ld}</script>\n', image), encoding="utf-8")

    used = [c for c in CATEGORIES if any(p["category"] == c for p in posts)]
    filters = ('<div class="in-filters" role="group" aria-label="Show"><button type="button" class="on" data-show="all">All</button>'
               + "".join(f'<button type="button" data-show="{c}">{esc(CATEGORIES[c])}</button>' for c in used) + "</div>") if len(used) > 1 else ""
    feed_body = f"""<section class="page-hero">
  <div class="page-hero-inner">
    <div class="page-hero-tag">Insights</div>
    <h1>What the data says. <em>Briefly.</em></h1>
    <p class="page-hero-sub">Short, sourced observations on advisory practices, markets, business, and now and then sports.</p>
  </div>
</section>
<section class="section-light">
  <div class="in-feed">
    {filters}
    <div class="in-grid">{''.join(card(p) for p in posts)}</div>
    {follow}
  </div>
</section>
<script>
document.querySelectorAll('.in-filters button').forEach(function (b) {{
  b.addEventListener('click', function () {{
    document.querySelectorAll('.in-filters button').forEach(function (x) {{ x.classList.toggle('on', x === b); }});
    var show = b.getAttribute('data-show');
    document.querySelectorAll('.in-card').forEach(function (c) {{ c.hidden = show !== 'all' && c.getAttribute('data-category') !== show; }});
  }});
}});
</script>"""
    (root / "index.html").write_text(shell("Insights", "Short, sourced observations on advisory practices, markets, business and sports from Spatacco Analytics.", "/insights/", feed_body, linkedin), encoding="utf-8")

    items = "".join(
        f"<item><title>{esc(p['title'])}</title><link>{BASE}{p['url']}</link><guid>{BASE}{p['url']}</guid>"
        f"<category>{esc(CATEGORIES[p['category']])}</category>"
        f"<pubDate>{format_datetime(datetime.fromisoformat(p['date']).replace(hour=13, tzinfo=timezone.utc))}</pubDate>"
        f"<description>{esc(p['summary'])}</description></item>" for p in posts[:30])
    (root / "feed.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Spatacco Analytics Insights</title>'
        f"<link>{BASE}/insights/</link><description>Short, sourced observations from Spatacco Analytics.</description>{items}</channel></rss>\n", encoding="utf-8")

    # the homepage shows the newest pieces written for advisors, and only those
    home = out / "index.html"
    s = home.read_text(encoding="utf-8")
    front = [p for p in posts if p["category"] == "practice"][:HOME_COUNT]
    if HOME_MARK in s and front:
        teaser = ('<link rel="stylesheet" href="/css/insights.css?v=36df3a69"><section class="section-light in-home"><div class="section-inner">'
                  '<div class="section-tag">Insights</div><h2 class="section-heading section-heading-light">What the data says about practices like yours.</h2>'
                  f'<div class="accent-line"></div><div class="in-grid">{"".join(card(p) for p in front)}</div>'
                  '<p class="in-more"><a class="in-link" href="/insights/">All insights &rarr;</a></p></div></section>')
        home.write_text(s.replace(HOME_MARK, teaser, 1), encoding="utf-8")

    sm = out / "sitemap.xml"
    if sm.is_file():
        s = sm.read_text(encoding="utf-8")
        add = "".join(f"  <url><loc>{BASE}{u}</loc></url>\n" for u in ["/insights/"] + [p["url"] for p in posts] if f"<loc>{BASE}{u}</loc>" not in s)
        sm.write_text(s.replace("</urlset>", add + "</urlset>"), encoding="utf-8")
    return len(posts)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--linkedin", metavar="SLUG", help="print the words to post on LinkedIn for one post")
    ap.add_argument("--posts", default=str(ROOT / "content" / "posts"))
    a = ap.parse_args()
    if a.linkedin:
        match = [p for p in load(Path(a.posts), drafts=True) if p["slug"] == a.linkedin]
        if not match:
            fail(f"no post with the slug {a.linkedin}")
        print(linkedin_text(match[0]))
    else:
        print(f"{len(load(Path(a.posts)))} published post(s) in {a.posts}")
