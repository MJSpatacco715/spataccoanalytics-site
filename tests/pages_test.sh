#!/usr/bin/env bash
# The site's shape. The home page is short on purpose: five screens that each
# send a visitor on to a page of its own (contact, the website scorer, a
# service, how we work). The argument for how we work and the firm's
# background live on their own pages. Every page's menu reaches every other,
# every statistic names its source, and nothing points at a section that is
# no longer there.
#   bash tests/pages_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }

site="$here/site"; home="$site/index.html"
python3 "$here/scripts/build_site.py" --site "$site" --out "$t/dist" >/dev/null 2>&1
check "the site builds" '[ -s "$t/dist/index.html" ]'
dist="$t/dist"

# ask FILE WHAT -> one fact about a page
ask() { python3 - "$1" "$2" <<'PY'
import re, sys, html, json
s = open(sys.argv[1], encoding='utf-8').read()
what = sys.argv[2]
body = s[s.index('<body'):] if '<body' in s else s
body = re.sub(r'src="data:[^"]*"', '', body)
if what == 'sections':
    print(','.join((m.group(2) or m.group(1).split()[0]) for m in re.finditer(r'<section class="([^"]+)"(?: id="([^"]+)")?', body)))
elif what == 'words':
    b = re.sub(r'<script.*?</script>', ' ', body, flags=re.S)
    b = re.sub(r'<span class="sa-cite-card".*?</a></span>', ' ', b, flags=re.S)   # the source cards open on demand
    print(len(html.unescape(re.sub(r'<[^>]+>', ' ', b)).split()))
elif what == 'nav':
    m = re.search(r'<nav[^>]*>.*?</nav>', body, re.S)
    print(','.join(re.findall(r'<a href="([^"]+)"', m.group(0))) if m else '')
elif what == 'active':
    m = re.search(r'<nav[^>]*>.*?</nav>', body, re.S)
    print(','.join(re.findall(r'<a href="([^"]+)" class="active"', m.group(0))) if m else '')
elif what == 'h1s':
    print(len(re.findall(r'<h1[ >]', body)))
elif what == 'desc':
    m = re.search(r'<meta name="description" content="([^"]*)"', s)
    print(len(html.unescape(m.group(1))) if m else 0)
elif what == 'ld':
    try:
        d = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', s, re.S).group(1))
        print(d.get('@type', 'graph') if isinstance(d, dict) else 'list')
    except Exception:
        print('BAD')
elif what == 'said':
    # the words a visitor reads, without styles, scripts or source cards
    b = re.sub(r'<(script|style).*?</\1>', ' ', body, flags=re.S)
    print(html.unescape(re.sub(r'<[^>]+>', ' ', b)))
elif what == 'stats':
    items = re.findall(r'<div class="stat-item sa-cite"[^>]*>(.*?)</span></div>', body, re.S)
    ok = [i for i in items if 'class="sa-cite-src">Source: ' in i and re.search(r'<a href="https://[^"]+" target="_blank" rel="noopener">', i)]
    print(len(items), len(ok), ','.join(re.findall(r'<div class="stat-num">([^<]+)</div>', body)))
PY
}

# --- the home page
check "the home page is five screens, in order" '[ "$(ask "$home" sections)" = "hero,website,services,approach,contact" ]'
check "the long sections are gone from it" '! grep -qE "The Reality|Who We Are|Who We Serve|problem-card|client-tag" "$home"'
words=$(ask "$home" words)
check "it says what it has to in under 480 words (now $words)" '[ "$words" -lt 480 ]'
check "the first screen's button goes straight to the contact page" 'grep -q "<a href=\"/contact/\" class=\"hero-cta\">Start a Conversation</a>" "$home"'
check "the first screen warns that a slow answer draws a harder look" 'grep -q "The longer each answer takes, the harder they look at everything else." "$home"'
check "the second screen is about the website, in the first screen's two lines" 'grep -q "<h2 class=\"screen-title\"><span class=\"h1-main\">Prospects will look at your website.</span> <em>Make sure it works for you.</em></h2>" "$home"'
check "and sends the visitor to the website scorer" 'grep -q "<a href=\"/tools/website-scorer/?scope=website&amp;utm_source=home\" class=\"screen-cta\">Score Your Website</a>" "$home" && [ -s "$dist/tools/website-scorer/index.html" ]'
check "it does not call the website the number one way advisors are checked (no study says so)" '! ask "$home" said | grep -qiE "number one|#1|no\. 1|top way|most important"'
check "How We Work keeps its headline and its line, and leads to its own page" 'ask "$home" said | grep -qE "Keep the way you work\. +Lose the mess\." && ! grep -qi "messy system" "$home" "$here/site/approach/index.html" && grep -q "<p class=\"approach-kicker reveal d05\">Adoption shouldn&rsquo;t be a battle. It should be a non-event.</p>" "$home" && grep -q "<a href=\"/approach/\" class=\"section-go\">Read how we work</a>" "$home"'
check "the place posts are added to the home page is still there, above the closing band" 'grep -q "<!-- sa-insights -->" "$home" && [ "$(grep -bo "<!-- sa-insights -->" "$home" | cut -d: -f1)" -lt "$(grep -bo "class=\"contact-section\"" "$home" | cut -d: -f1)" ]'

# --- every pillar leads somewhere real
for id in crm audit design; do
  check "a pillar links to the $id service, and the services page has it" 'grep -q "<a class=\"service-card [a-z]* reveal d[0-9]*\" href=\"/services/#$id\">" "$home" && grep -q "<fieldset class=\"sv-card reveal\" id=\"$id\" data-service=\"$id\"" "$site/services/index.html"'
done
check "the first screen says what we do in the owner's softer words" 'grep -q "We help advisory firms get their CRM, data and website ready before anyone asks." "$home"'
check "on a desktop the first screen and the website screen put their figures in a column on the right" 'grep -q "@media(min-width:1080px){" "$home" && grep -q "\.hero-content{display:grid;grid-template-columns:minmax(0,1fr) 18.125rem;" "$home" && grep -q "\.screen-inner{display:grid;grid-template-columns:minmax(0,1fr) 18.125rem;" "$home"'
check "on a phone the figures are one vertical stack, not side by side" 'grep -q "\.stat-bar{flex-direction:column;gap:1.25rem}" "$home" && ! grep -q "\.hero \.stat-bar{display:grid" "$home"'
check "the pillars are one height with their links on one line" 'grep -q "a.service-card{display:flex;flex-direction:column;" "$home" && grep -q "\.service-go{display:block;margin-top:auto;" "$home"'
# The pillars were the one light section of the home page. The owner, 2026-11-27: "weirdly all
# white in a sea of blue". Asked, with a picture of it in navy: "Yes, make it navy".
check "no section of the home page is light: the pillars sit on the navy, each one the site panel" '! grep -q "class=\"section-light" "$home" && grep -q "<section class=\"section-dark section-pillars\" id=\"services\">" "$home" && grep -q "\.service-card{background:rgba(var(--lift),0.045);border:1px solid rgba(var(--line),0.16);" "$home" && grep -q "\.service-card h3{font-size:1.25rem;font-weight:600;color:var(--white);" "$home" && grep -q "<h2 class=\"section-heading section-heading-dark\">Three pillars. One consultative engagement.</h2>" "$home"'
check "and the Insights teaser, when the home page has one, sits on the navy too" 'grep -qF ".section-light.in-home{background:var(--navy)}" "$site/css/insights.css" && grep -qF ".in-home .in-card h3{color:#FFFFFF}" "$site/css/insights.css" && grep -qF ".in-home .in-card{background:rgba(var(--lift),0.045);" "$site/css/insights.css"'
check "there are three pillars and each is a link" '[ "$(grep -o "<a class=\"service-card " "$home" | wc -l)" = 3 ] && ! grep -q "<div class=\"service-card" "$home"'

# --- every statistic carries its source
read -r total sourced nums <<<"$(ask "$home" stats)"
check "six statistics on the home page: $nums" '[ "$total" = 6 ] && [ "$nums" = "35%,63%,3%,96%,72%,62%" ]'
check "each with its source in view and a card that links to it" '[ "$sourced" = "$total" ]'
check "the figure that did not hold up is not on the site" '! grep -rq "38%" "$home" "$site/approach/index.html" "$site/about/index.html"'
check "the first screen has three figures: who is retiring, how many say their data is unified, and how few say fully" 'grep -q "<div class=\"stat-num\">63%</div><div class=\"stat-label\">of advisors say their firm&rsquo;s data is unified</div><span class=\"sa-cite-src\">Source: Orion, 2026</span>" "$home" && grep -q "<div class=\"stat-num\">3%</div><div class=\"stat-label\">say it is fully unified, with no manual steps</div><span class=\"sa-cite-src\">Source: Orion, 2026</span>" "$home" && [ "$(grep -o "Orion sells technology to advisors." "$home" | wc -l)" = 2 ]'
check "the card behind 63% says what it is made of" 'grep -q "That is 3% who said fully unified and 60% who said mostly unified but still needing manual steps." "$home"'
check "a publisher that sells to advisors is named as one" '[ "$(grep -o "sells marketing services to advisors\|sells websites and marketing to advisors" "$home" | wc -l)" = 3 ]'

# --- the two pages that took the long sections
for page in approach about; do
  f="$dist/$page/index.html"
  check "/$page/ is built" '[ -s "$f" ]'
  check "/$page/ has a title, a description that fits, and its own address" 'grep -q "<title>[^<]* | Spatacco Analytics</title>" "$f" && [ "$(ask "$f" desc)" -ge 80 ] && [ "$(ask "$f" desc)" -le 160 ] && grep -q "<link rel=\"canonical\" href=\"https://spataccoanalytics.com/$page/\">" "$f" && grep -q "<meta property=\"og:url\" content=\"https://spataccoanalytics.com/$page/\">" "$f"'
  check "/$page/ has one headline and tells search engines what it is" '[ "$(ask "$f" h1s)" = 1 ] && [[ "$(ask "$f" ld)" == *Page ]]'
  check "/$page/ is lit in its own menu and ends on the contact page" '[ "$(ask "$f" active)" = "/$page/" ] && grep -q "<a href=\"/contact/\" class=\"btn-primary\">Start a Conversation</a>" "$f"'
done
check "the approach page has the argument and the four steps in full" 'f="$site/approach/index.html"; grep -q "We just finish the job." "$f" && grep -q "Adoption shouldn&rsquo;t be a battle. It should be a non-event." "$f" && [ "$(grep -o "class=\"step-num\"" "$f" | wc -l)" = 4 ] && grep -q "Self-sufficiency is the goal." "$f"'
check "the about page has who we are, who we serve, and the Microsoft 365 line" 'f="$site/about/index.html"; grep -q "founded by a business development and M&amp;A professional" "$f" && [ "$(grep -o "<span class=\"client-tag" "$f" | wc -l)" = 9 ] && grep -q "Microsoft 365 Business Premium" "$f"'

# --- every menu reaches every page
# The owner set the order on 2026-11-26: "menu should be: services approach tools about contact".
want="/services/,/approach/,/tools/,/about/,/contact/"
for f in "$home" "$site/services/index.html" "$site/tools/index.html" "$site/contact/index.html" "$site/approach/index.html" "$site/about/index.html"; do
  check "the menu on ${f#$site} reaches all five pages" '[ "$(ask "$f" nav | sed "s#^/,##")" = "$want" ]'
done
check "the scorer carries the same menu, in the same order" '[ "$(ask "$site/tools/website-scorer/index.html" nav | sed "s#^/,##")" = "$want" ]'
check "posts carry the same menu, in the same order" '[ "$(ask "$dist/insights/index.html" nav | sed "s#^/,##")" = "$want" ] && [ "$(ask "$dist/insights/most-firms-dont-need-more-software/index.html" nav | sed "s#^/,##")" = "$want" ]'
check "and so does each tool page, which is built with the tools page menu" '[ "$(ask "$dist/tools/football/nfl-lines-tracker/index.html" nav | sed "s#^/,##")" = "$want" ]'
check "nothing points at a section that left the home page" '! grep -rnE "/#(approach|about)|href=\"#(approach|about|contact)\"" "$site" "$here/scripts" --include=*.html --include=*.py --include=*.txt --include=.htaccess'
check "the earlier site's pages go to the new ones" 'grep -q "^RewriteRule \^about\\\\.php\$ https://spataccoanalytics.com/about/ \[R=301,QSD,L\]" "$site/.htaccess" && grep -q "^RewriteRule \^approach\\\\.php\$ https://spataccoanalytics.com/approach/ \[R=301,QSD,L\]" "$site/.htaccess"'

# --- search engines are told
for page in approach about; do
  check "the sitemap lists /$page/" 'grep -q "<loc>https://spataccoanalytics.com/$page/</loc>" "$site/sitemap.xml"'
done
missing=0
for u in $(grep -o '<loc>[^<]*</loc>' "$site/sitemap.xml" | sed 's#<loc>https://spataccoanalytics.com##; s#</loc>##'); do
  p="$dist$u"; [ "${u: -1}" = / ] && p="${p}index.html"; [ -s "$p" ] || { missing=$((missing+1)); echo "  not built: $u"; }
done
check "every address in the sitemap is a page that is built" '[ "$missing" = 0 ]'
# A page people are sent to is addressed by its folder, never by a file name. The host hands out a page asked
# for by file name from its own layer: a browser may keep it 180 days, and none of the rules in site/.htaccess
# are applied to it (not "check before reuse", not www to the bare domain). Found 2026-11-27, when the owner's
# own scores were missing from his record: a browser can go on running an old scorer, and on www the scorer's
# record and lead calls were redirected and dropped.
check "no page search engines are given is addressed by file name" '! grep -q "\.html</loc>" "$site/sitemap.xml"'
check "the scorer lives at its folder address, and the file at its old address is gone" '[ -s "$dist/tools/website-scorer/index.html" ] && [ ! -e "$site/tools/website-scorer.html" ] && [ ! -e "$dist/tools/website-scorer.html" ]'
check "its old address forwards to the folder, with whatever followed the question mark" 'grep -qF "RewriteRule ^tools/website-scorer\.html\$ https://spataccoanalytics.com/tools/website-scorer/ [R=301,L]" "$site/.htaccess"'
check "nothing that is published still points at the old address" '! grep -rq "website-scorer\.html" "$dist" --include="*.html" --include="*.xml" --include="*.txt" --include="*.json" --include="*.js"'
check "the page names its folder as its own address, and the printed code forwards there" 'grep -q "<link rel=\"canonical\" href=\"https://spataccoanalytics.com/tools/website-scorer/\">" "$site/tools/website-scorer/index.html" && grep -q "url=https://spataccoanalytics.com/tools/website-scorer/?scope=website&amp;utm_source=leave-behind&amp;utm_medium=qr" "$site/score/index.html"'
# Every tool's own page has a folder address too. Shown the nine still addressed by file name and three ways to deal
# with them, the owner, 2026-11-27: "re the decision: A" (move them, the old addresses forwarding).
check "every page in the build is its folder's index: none is addressed by file name (the framed live tools apart)" '[ -z "$(cd "$dist" && find . -name "*.html" ! -name index.html ! -path "./tools/football/live/*")" ]'
check "each tool's old address forwards to its folder: the five in tools/, the three NFL tools and the delisted page" 'grep -qF "RewriteRule ^tools/(afi-tracker|card-evaluator|cricket-explainer|curling-explainer|oscar-tracker)\.html\$ https://spataccoanalytics.com/tools/\$1/ [R=301,L]" "$site/.htaccess" && grep -qF "RewriteRule ^tools/football/(nfl-lines-tracker|nfl-injury-tracker|nfl-depth-charts)\.html\$ https://spataccoanalytics.com/tools/football/\$1/ [R=301,L]" "$site/.htaccess" && grep -qF "RewriteRule ^unleash/kraken\.html\$ https://spataccoanalytics.com/unleash/kraken/ [R=301,L]" "$site/.htaccess"'
check "nothing that is published points at an old tool address, and every tool the Tools page links is there" '! grep -rqE "/tools/(football/nfl-[a-z-]+|afi-tracker|card-evaluator|cricket-explainer|curling-explainer|oscar-tracker)\.html|/unleash/kraken\.html" "$dist" --include="*.html" --include="*.xml" --include="*.txt" --include="*.json" --include="*.js" && for h in $(grep -oE "href=\"/tools/[a-z/-]+/\"" "$dist/tools/index.html" | sort -u | sed "s/^href=\"//; s/\"\$//"); do [ -s "$dist${h}index.html" ] || exit 1; done'
# A framed live tool is still a file the host hands out by name, so the page that frames it names it by its whole
# address with the file's own version: when the tool changes, the address changes. (A stand-in for the live build.)
mkdir -p "$t/live" && for a in lines injuries depth-charts; do printf '<html><body>%s</body></html>' "$a" > "$t/live/$a.html"; done
python3 "$here/scripts/build_site.py" --site "$site" --out "$t/dist-live" --live "$t/live" >/dev/null 2>&1
check "a tool page frames its live tool by its whole address and the file's version, and carries what follows the question mark into it" 'v=$(sha1sum "$t/live/lines.html" | cut -c1-8); f="$t/dist-live/tools/football/nfl-lines-tracker/index.html"; grep -q "<iframe id=\"nfl-app\" src=\"/tools/football/live/lines.html?v=$v\"" "$f" && grep -q "href=\"/tools/football/live/lines.html?v=$v\">Open full screen" "$f" && grep -qF "s.indexOf(\"?\")<0?q:\"&\"+q.slice(1)" "$f" && [ -s "$t/dist-live/tools/football/live/lines.html" ]'
check "the summary for AI tools lists both new pages" 'grep -q "https://spataccoanalytics.com/approach/" "$site/llms.txt" && grep -q "https://spataccoanalytics.com/about/" "$site/llms.txt"'
long=0; hidden=0
for u in $(grep -o '<loc>[^<]*</loc>' "$site/sitemap.xml" | sed 's#<loc>https://spataccoanalytics.com##; s#</loc>##'); do
  p="$dist$u"; [ "${u: -1}" = / ] && p="${p}index.html"
  d=$(ask "$p" desc); { [ "$d" -ge 80 ] && [ "$d" -le 160 ]; } || { long=$((long+1)); echo "  description of $u is $d characters"; }
  grep -q '<meta name="robots" content="noindex' "$p" && { hidden=$((hidden+1)); echo "  $u is in the sitemap and marked noindex"; }
done
check "every page in the sitemap has a description a results page shows whole" '[ "$long" = 0 ]'
check "no page in the sitemap is kept out of search" '[ "$hidden" = 0 ]'
check "the services page is titled with what it sells, not the word Services" 'grep -q "<title>CRM Repair, Websites and Audits for RIAs | Spatacco Analytics</title>" "$site/services/index.html" && grep -q "<meta property=\"og:title\" content=\"CRM Repair, Websites and Audits for RIAs | Spatacco Analytics\">" "$site/services/index.html"'
check "the resume parser is titled with what it does" 'grep -q "<title>Resume Parser: Resume to Excel or CSV | Spatacco Analytics</title>" "$site/tools/resume-parser/index.html"'
for f in unleash/index.html unleash/kraken/index.html; do
  check "the delisted page /$f is kept out of search and out of the sitemap" 'grep -q "<meta name=\"robots\" content=\"noindex\">" "$dist/$f" && ! grep -q "unleash" "$site/sitemap.xml"'
done

# --- Bing is told what a publish changed (IndexNow)
key=$(cd "$site" && ls | grep -E '^[0-9a-f]{32}\.txt$' | sed 's/\.txt$//')
check "the site serves one IndexNow key, and the file holds its own name" '[ "$(printf "%s\n" "$key" | grep -c .)" = 1 ] && [ "$(cat "$site/$key.txt")" = "$key" ] && [ -s "$dist/$key.txt" ]'
tell() { printf '%s\n' "$@" | python3 "$here/scripts/indexnow.py" --site "$site" --dist "$dist"; }
told=$(tell site/services/index.html site/index.html site/tools/website-scorer/index.html site/services/index.html)
check "a changed page is named once, by its own address, with the key and where to read it" 'python3 - "$told" "$key" <<'"'"'PY'"'"'
import json, sys
d = json.loads(sys.argv[1]); k = sys.argv[2]
ok = (d["host"] == "spataccoanalytics.com" and d["key"] == k and d["keyLocation"] == "https://spataccoanalytics.com/%s.txt" % k
      and d["urlList"] == ["https://spataccoanalytics.com/services/", "https://spataccoanalytics.com/", "https://spataccoanalytics.com/tools/website-scorer/"])
sys.exit(0 if ok else 1)
PY'
check "a style, a script, a picture or a test changing names nothing" '[ -z "$(tell site/css/ticker.css site/js/ticker.js site/img/logo-square.png tests/pages_test.sh site/lib/market.php README.md)" ]'
check "a page kept out of search is never named" '[ -z "$(tell site/unleash/index.html site/unleash/kraken/index.html site/score/index.html site/bank/index.html)" ]'
check "a post that is not published names nothing, not even the Insights page" '[ -z "$(tell content/posts/2026-12-01-not-published-yet.json)" ]'
python3 "$here/scripts/build_site.py" --site "$site" --out "$t/withposts" --posts "$here/tests/fixtures/posts" >/dev/null 2>&1
check "a published post is named by its own address, without the date in its file name, with the Insights page" '[[ "$(printf "%s\n" content/posts/2026-01-05-sample-practice.json content/posts/2026-01-07-sample-draft.json | python3 "$here/scripts/indexnow.py" --site "$site" --dist "$t/withposts")" == *"\"urlList\": [\"https://spataccoanalytics.com/insights/sample-practice/\", \"https://spataccoanalytics.com/insights/\"]"* ]]'
check "the site settings file names the home page, where search engines read the firm's details" '[[ "$(tell content/site.json)" == *"\"urlList\": [\"https://spataccoanalytics.com/\"]"* ]]'
check "the showcase file names the tools page" '[[ "$(tell showcase/tools.json)" == *"\"urlList\": [\"https://spataccoanalytics.com/tools/\"]"* ]]'
wf="$here/.github/workflows/publish.yml"
check "the publish tells Bing after a merge only, and can never fail on it" 'python3 - "$wf" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r"      - name: Tell Bing what changed\n(.*?)\n      - name: ", s, re.S)
step = m.group(1) if m else ""
ok = ("github.event_name == '"'"'push'"'"'" in step and "continue-on-error: true" in step and "scripts/indexnow.py --site site --dist dist" in step
      and "https://api.indexnow.org/indexnow" in step and s.index("- name: Verify on the server") < s.index("- name: Tell Bing what changed"))
sys.exit(0 if ok else 1)
PY'

# --- the LinkedIn page is tied to the site
li="https://www.linkedin.com/company/spatacco-analytics/"
check "the firm's LinkedIn page is set" '[ "$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[\"linkedin_url\"])" "$here/content/site.json")" = "$li" ]'
check "search engines are told the LinkedIn page is the firm's" 'grep -qF "\"@type\":\"ProfessionalService\",\"sameAs\":[\"$li\"]," "$dist/index.html"'
signed=0; bare=0
for f in $(grep -rl "&copy; 2026 Spatacco Analytics LLC" "$dist" --include=*.html); do
  signed=$((signed+1))
  grep -qF "<a href=\"$li\" target=\"_blank\" rel=\"noopener\" style=\"color:inherit;text-decoration:underline;text-underline-offset:0.1875rem\">LinkedIn</a>" "$f" || { bare=$((bare+1)); echo "  no readable LinkedIn link: ${f#$dist}"; }
done
check "every page that signs off links to it, in the colour of its own footer line and underlined" '[ "$signed" -ge 6 ] && [ "$bare" = 0 ]'

# --- the Insights section
ins=0
for f in $(grep -rl "&copy; 2026 Spatacco Analytics LLC" "$dist" --include=*.html); do
  grep -qF "<a href=\"/insights/\" style=\"color:inherit;text-decoration:underline;text-underline-offset:0.1875rem\">Insights</a>" "$f" || { ins=$((ins+1)); echo "  no Insights link: ${f#$dist}"; }
done
check "the Insights section is built and every page that signs off leads to it" '[ -s "$dist/insights/index.html" ] && [ -s "$dist/insights/feed.xml" ] && [ "$ins" = 0 ]'
check "the first post is published at its own address and listed for search engines" '[ -s "$dist/insights/most-firms-dont-need-more-software/index.html" ] && grep -q "<loc>https://spataccoanalytics.com/insights/most-firms-dont-need-more-software/</loc>" "$dist/sitemap.xml" && grep -q "<loc>https://spataccoanalytics.com/insights/</loc>" "$dist/sitemap.xml"'
check "the first post is the owner's own words, without the line about LinkedIn" 'f="$dist/insights/most-firms-dont-need-more-software/index.html"; grep -q "We work with financial advisors and small business owners on three things" "$f" && grep -q "They need the software they have to work the way they do." "$f" && ! grep -q "is now on LinkedIn" "$f"'
check "the home page carries an Insights teaser only when a published post is written for advisors" 'python3 - "$here/content/posts" "$dist/index.html" <<'"'"'PY'"'"'
import json, pathlib, sys
posts = [json.loads(f.read_text(encoding="utf-8")) for f in pathlib.Path(sys.argv[1]).glob("*.json")]
want = any(p.get("category") == "practice" and not p.get("draft") for p in posts)
has = "in-home" in open(sys.argv[2], encoding="utf-8").read()
sys.exit(0 if want == has else 1)
PY'

# --- the scorer reads an address however it is typed
scorer="$site/tools/website-scorer/index.html"
# The scorer wears the site's own look. The owner, 2026-11-27: "scorer has a bland SA logo and
# all white screen ... it contrasts with the style and feel of the site overall and feels
# imported, rather than in house. match the visual style of the scorer to the overall site".
check "the scorer is dressed by the site: the shared stylesheet, the site's two typefaces, its menu with Tools lit, its footer and its script" 'grep -q "<link rel=\"stylesheet\" href=\"/css/shared.css?v=[0-9a-f]\{8\}\">" "$scorer" && grep -q "family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap" "$scorer" && grep -q "<a href=\"/tools/\" class=\"active\">Tools</a>" "$scorer" && grep -q "<div class=\"footer-text\">Bala Cynwyd, PA &middot; &copy; 2026 Spatacco Analytics LLC</div>" "$scorer" && grep -q "<script src=\"/js/shared.js\"></script>" "$scorer"'
check "nothing of its old look is left: no SA box, no second footer, no white ground, none of its three old typefaces" '! grep -qE "masthead|class=\"footer\"|Built by|Lato|Courier Prime|--bg:|#F6F7F5|var\(--mono\)" "$scorer"'
check "its headline is the site's: one h1 in the page hero, the blue line last and on a line of its own" 'grep -q "<section class=\"page-hero sc-hero\" id=\"screen-hero\">" "$scorer" && grep -q "<h1>See how your digital presence <em>actually stacks up.</em></h1>" "$scorer" && [ "$(grep -c "<h1" "$scorer")" = 1 ]'
check "the PDF keeps its paper colours: only what is drawn on the page is lit for dark" 'grep -q "const LIT = {" "$scorer" && grep -q "fill(tier.bg); pen(tier.color, 1)" "$scorer" && grep -q "ink(meta.color)" "$scorer" && ! sed -n "/^async function generatePDF/,/^\/\/ .* THE OWNER/p" "$scorer" | grep -qE "lit\(|wash\(" && grep -q "label:\"Excellent\",   color:\"#1A6B40\", bg:\"#EAF5EE\"" "$scorer"'
# The owner, 2026-11-27: "I don't love the category titles Distinction ...Poor" (naming "Excellent, Strong, Adequate,
# Needs Work, Red Flags and Violations"), and "use the Linkedin Logo on the page where appropriate instead of a briefcase".
check "the scorer's five ratings are the owner's names, in the legend and in the scoring alike, and the old ones are gone" '(for w in Excellent Strong Adequate "Needs Work" "Red Flags and Violations"; do grep -q "&nbsp;$w</span>" "$scorer" && grep -q "label:\"$w\"" "$scorer" || exit 1; done; ! grep -qE "label:\"(Distinction|Weak|Poor)\"|&nbsp;(Distinction|Weak|Poor)<" "$scorer")'
check "a rating's name is kept whole on the record and in the notice (forty characters)" 'grep -q "lead_text(\$in\[.tier.\] ?? .., 40)" "$site/score/lead.php" && grep -q "lead_text(\$in\[.tier.\] ?? .., 40)" "$site/score/run.php"'
check "the scorer draws its marks: a globe and LinkedIn's own, and no emoji stands in for an icon on the form" 'grep -q "<symbol id=\"i-web\"" "$scorer" && grep -q "<symbol id=\"i-linkedin\"" "$scorer" && grep -q "fill=\"#0A66C2\"" "$scorer" && [ "$(grep -c "href=\"#i-linkedin\"" "$scorer")" -ge 4 ] && ! grep -q "class=\"scope-icon\">[^<]" "$scorer"'
check "the breakdown's three figures are buttons, each with a card filled from the scorer's own list of categories" '[ "$(grep -c "<button type=\"button\" class=\"sc-point p[123]\" aria-expanded=\"false\" aria-controls=\"sc-more-[123]\">" "$scorer")" = 3 ] && [ "$(grep -c "<div class=\"sc-more m[123]\" id=\"sc-more-[123]\" role=\"note\"></div>" "$scorer")" = 3 ] && grep -q "WEBSITE_CATS.filter((c) => c.group === \"website\")" "$scorer" && grep -q "transition-delay: .3s" "$scorer"'
check "the scorer takes an address with or without https://, and turns away what is not one" 'node - "$scorer" <<'"'"'JS'"'"'
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const m = src.match(/\/\* tidy-address:start \*\/([\s\S]*?)\/\* tidy-address:end \*\//);
if (!m) { console.log("  the address reader is not in the page"); process.exit(1); }
const tidyAddress = new Function(m[1] + "; return tidyAddress;")();
const want = [
  ["www.columbusmacro.com", "https://www.columbusmacro.com"],
  ["columbusmacro.com", "https://columbusmacro.com"],
  ["  Columbusmacro.com/  ", "https://columbusmacro.com"],
  ["https://www.columbusmacro.com", "https://www.columbusmacro.com"],
  ["http://columbusmacro.com", "http://columbusmacro.com"],
  ["HTTPS://Firm.com/About", "https://firm.com/About"],
  ["https//firm.com", "https://firm.com"],
  ["http:/firm.com", "http://firm.com"],
  ["firm.com/team?x=1", "https://firm.com/team?x=1"],
  ["firm.com.", "https://firm.com"],
  ["httpbin.org", "https://httpbin.org"],
  ["linkedin.com/company/yourfirm", "https://linkedin.com/company/yourfirm"],
  ["www.linkedin.com/company/yourfirm/", "https://www.linkedin.com/company/yourfirm/"],
  ["", ""], ["columbus macro", ""], ["firm", ""], ["john@firm.com", ""], ["mailto:john@firm.com", ""],
  ["javascript:alert(1)", ""], ["<script>", ""], ["https://", ""], ["1.2.3.4", ""],
];
let bad = 0;
for (const [typed, out] of want) { const got = tidyAddress(typed); if (got !== out) { bad++; console.log("  typed " + JSON.stringify(typed) + " gave " + JSON.stringify(got) + ", wanted " + JSON.stringify(out)); } }
process.exit(bad ? 1 : 0);
JS'
check "its fields do not ask for https://, in the hint or in the message" '! grep -q "starting with https://" "$scorer" && grep -q "id=\"inp-website\" placeholder=\"yourfirm.com or your firm.s name\"" "$scorer" && grep -q "id=\"inp-linkedin\" placeholder=\"linkedin.com/company/yourfirm\"" "$scorer" && ! grep -q "type=\"url\"" "$scorer"'
# A firm name typed in place of the website is looked up, not turned away. The owner,
# 2026-11-26: "If i type a firm name (and not website (not https not even www)) could it
# offer user option of is this the right one? With logic (and shown/listed confidence per
# card shown)". tests/scorer_browser.cjs opens it; tests/worker_test.mjs holds the relay to it.
check "a firm name typed into the scorer is looked up before anything is refused, and nothing in the lookup is an em dash" 'python3 - "$scorer" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
ask = re.search(r"askClaude\(`(Find the official website of a financial advisory firm from the name a visitor typed\.[\s\S]*?)`, FIND_ASK\)", s)
ok = bool(ask) and "Never invent a website." in ask.group(1) and "confidence" in ask.group(1) and chr(8212) not in ask.group(1)
i = s.index("const name = firmName(typedSite);"); j = s.index("We could not read that as a website address.")
ok = ok and i < j and "if (name) { lookUpFirm(name); return; }" in s[i:j]
ok = ok and "id=\"firm-matches\"" in s and "Is this the right one?" in s
sys.exit(0 if ok else 1)
PY'
check "the scorer checks what was typed through the address reader, not for the letters http" 'grep -q "const website   = tidyAddress(typedSite);" "$scorer" && ! grep -q "startsWith(\"http\")" "$scorer"'

# --- the first screen of the inner pages
# The owner, 2026-11-26: "services page is all talk and no service options on
# first screen", and "as a standard I'd like the blue response hero text to be
# on its own line. don't LOVE 'scoped before you commit". Asked which line
# instead, the owner chose "Pick where to start."
svc="$site/services/index.html"
check "the Services page opens on its four services, each going to its own part of the page, inside the first section" 'python3 - "$svc" <<'"'"'PY'"'"'
import re, sys, html
s = open(sys.argv[1], encoding="utf-8").read()
hero = re.search(r"<section class=\"page-hero sv-hero\">.*?</section>", s, re.S)
if not hero: sys.exit(1)
picks = re.findall(r"<a href=\"#([a-z]+)\"><span class=\"sv-pick-name\">([^<]+)</span><span class=\"sv-pick-what\">([^<]+)</span><span class=\"sv-pick-go\">([^<]+)</span></a>", hero.group(0))
ok = [p[0] for p in picks] == ["audit", "design", "crm", "hosting"]
ok = ok and all(re.search(r"id=\"%s\"" % p[0], s) for p in picks)
# each is named as its own part of the page names it
heads = dict(re.findall(r"<fieldset class=\"sv-card reveal\" id=\"([a-z]+)\".*?<h3>([^<]+)</h3>", s, re.S))
ok = ok and all(html.unescape(p[1]) == html.unescape(heads[p[0]]) for p in picks[:3]) and picks[3][1] == "Managed Hosting"
# what each says beside its name is what the page itself says lower down
part = lambda i: re.search(r"<fieldset class=\"sv-card reveal\" id=\"%s\".*?</fieldset>" % i, s, re.S).group(0)
times = lambda i: re.findall(r"<span class=\"sv-time\">([^<]+)<", part(i))
go = {p[0]: p[3] for p in picks}
ok = ok and go["audit"] == "Starts free" and "<span class=\"sv-price\">Free</span>" in part("audit")
ok = ok and go["design"] == "%s to %s" % (times("design")[0].split()[0], times("design")[-1]) 
ok = ok and go["crm"] == "From " + times("crm")[0].split()[0] + " week"
ok = ok and go["hosting"] == "From $%d/mo" % min(int(x) for x in re.findall(r"data-monthly=\"(\d+)\"", s))
sys.exit(0 if ok else 1)
PY'
# The free Website Score on the Services page, in three asks of the owner's, 2026-11-26:
#  - it was a level to tick like the others, and a tap only ticked it: "This should
#    (obviously) link to the web scorer";
#  - it then left the plan: "Add it to the builder. Essentially will be auto-checked on
#    all paid engagements" (and, asked whether a hosting plan alone counts: "Project work
#    only");
#  - "Maybe an option to add/bundle with other services or other option to go to the
#    scorer", and of three ways to do that the owner chose two buttons, a tap anywhere
#    else opening the scorer.
check "the free Website Score on the Services page has its two ways: a link to the scorer laid over the whole card, and a button that bundles it into the plan" 'python3 - "$svc" "$dist" <<'"'"'PY'"'"'
import os, re, sys
s = open(sys.argv[1], encoding="utf-8").read()
card = re.search(r"<fieldset class=\"sv-card reveal\" id=\"audit\".*?</fieldset>", s, re.S).group(0)
opt = re.search(r"<div class=\"sv-opt sv-opt-go\">(.*?)</div>", card, re.S)
if not opt: sys.exit(1)
o = opt.group(1)
go = re.findall(r"<a class=\"sv-go\" href=\"(/tools/website-scorer/)\?scope=website&amp;utm_source=services\">Score my site</a>", o)
ok = len(go) == 1 and o.count("<a ") == 1 and os.path.isfile(sys.argv[2] + go[0] + "index.html")     # one link, to a page that is in the built site
ok = ok and "Website Score" in o and "<span class=\"sv-price\">Free</span>" in o and "Included with every project." in o
# the link is laid over the card, and the one button sits above it
ok = ok and ".sv-go::after{content:\"\";position:absolute;inset:0}".replace(chr(34), chr(39)) in s and re.search(r"\.sv-opt\{position:relative;", s)
ok = ok and re.findall(r"<button type=\"button\" class=\"sv-add\" id=\"sv-score-add\" aria-pressed=\"false\">([^<]+)</button>", o) == ["Bundle with other services"] and o.count("<button") == 1
ok = ok and re.search(r"\.sv-add\{position:relative;z-index:1;", s) and "<input" not in o
# it is not one of the levels to choose
ok = ok and re.findall(r"<input type=\"radio\" name=\"audit\" value=\"([a-z]+)\"", card) == ["professional", "complete"]
sys.exit(0 if ok else 1)
PY'
check "its headline ends on the line the owner chose, and the one the owner did not love is gone" 'grep -q "<h1>Websites, CRM, and data for independent advisors. <em>Pick where to start.</em></h1>" "$svc" && ! grep -rqi "scoped before you commit" "$site" "$here/scripts" "$here/content"'
check "no project price came onto the first screen with them: the one figure there is the published hosting price" '[ "$(python3 -c "
import re,sys
s=open(sys.argv[1],encoding=\"utf-8\").read()
h=re.search(r\"<section class=\\\"page-hero sv-hero\\\">.*?</section>\", s, re.S).group(0)
print(\",\".join(re.findall(r\"\\\$[0-9][0-9,]*\", h)))" "$svc")" = "\$160" ]'
heads_ok=0; heads_all=0
for f in "$svc" "$site/approach/index.html" "$site/about/index.html" "$site/tools/index.html" "$site/contact/index.html" "$dist/insights/index.html"; do
  heads_all=$((heads_all+1))
  # one blue part, closing the headline, so that it is the headline's last line
  grep -qE "<h1>[^<]+ <em>[^<]+</em></h1>" "$f" && heads_ok=$((heads_ok+1)) || echo "  the headline of ${f#$here/} does not end on one blue part"
done
check "every inner page's headline ends on one blue part, and the shared stylesheet gives it a line of its own: $heads_ok of $heads_all" '[ "$heads_ok" = "$heads_all" ] && grep -q "^\.page-hero h1 em{display:block;font-style:italic;color:var(--cyan)}" "$site/css/shared.css"'

# --- the Tools page opens on its tools
# The owner, 2026-11-26: "on the tools page the meat is too buried. I need tiles
# or chips that fit with the overall scheme to pull to the top (visible on first
# glance) the tools that meet the criteria. Sports Movies Business, etc". And of
# its headline, when the blue line became a line of its own everywhere: "this
# one is okay to stay".
# The first cut had five kinds and all thirteen tools on the first screen. The
# owner, the same afternoon, of that on a phone: "This is too many
# categories/tiles/chips And I want the scroll to show bottom of first visible
# screen". So: three kinds, each tool of exactly one, only the chosen kind's
# tools showing (Business to begin with), and the section as tall as the first
# screen less the market strip, which comes next.
check "every tool on the Tools page has a tile in its first section and every tile leads to a tool that is there; three kinds, each tool of one, each kind saying how many it has, and only the first kind showing" 'python3 - "$dist/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
hero = re.search(r"<section class=\"page-hero tl-hero\">.*?</section>", s, re.S)
if not hero: sys.exit(1)
h = hero.group(0); rest = s[hero.end():]
tiles = re.findall(r"<a class=\"tl-tile tl-(?:live|see)\" href=\"([^\"]+)\" data-kind=\"([a-z]+)\"( hidden)?>", h)
# the tools the page itself shows: the two that launch, the three kinds of card below them, and the platforms described
shown = set(re.findall(r"<a href=\"(/tools/[^\"]+)\" class=\"(?:tool-link|scorecard|playbill|tradingcard)\"", rest))
shown |= {"#" + i for i in re.findall(r"class=\"tool-card build-card[^\"]*\" id=\"([a-z-]+)\"", rest)}
ok = len(tiles) == h.count("class=\"tl-tile ") and len(tiles) == len(set(t[0] for t in tiles)) and set(t[0] for t in tiles) == shown and len(shown) >= 13
chips = re.findall(r"<button type=\"button\" class=\"tl-chip( on)?\" data-kind=\"([a-z]+)\" aria-pressed=\"(true|false)\">[^<]+<span>(\d+)</span>", h)
ok = ok and len(chips) == len(re.findall(r"class=\"tl-chip[ \"]", h)) and [c[1] for c in chips] == ["business", "sports", "movies"]
ok = ok and [(c[0], c[2]) for c in chips] == [(" on", "true"), ("", "false"), ("", "false")]
for _, kind, _, said in chips:
    ok = ok and int(said) == sum(1 for t in tiles if t[1] == kind) and int(said) > 0
ok = ok and sum(int(c[3]) for c in chips) == len(tiles)                                   # no tile of a kind that cannot be chosen
ok = ok and all((t[2] == "") == (t[1] == "business") for t in tiles)                      # what shows before anything is pressed
sys.exit(0 if ok else 1)
PY'
# The owner, 2026-11-27, of that first screen: "this needs better / greater definition of the three up top are
# categories and some sort of greater interactive/non delineation beyond just the blue logo/icon", and "RIA digital
# scorecard should also be clear that this is THE same free (and genuinely useful) tool that you see other parts of
# the site".
# The owner, the same day, of the platforms' group, which stood beside the tools: "this ... should be down a level and
# should have the commonly understood (theres text if you click here) carrot".
check "the three chips are named as categories, and the tiles stand in two named groups, one under the other: the tools to use, then the platforms, each a press with a caret that opens what it is" 'python3 - "$dist/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
h = re.search(r"<section class=\"page-hero tl-hero\">.*?</section>", s, re.S).group(0)
ok = "<div class=\"tl-chips\" role=\"group\" aria-label=\"Show tools by category\">" in h and "<span class=\"tl-chips-label\">Browse by category</span>" in h
groups = re.findall(r"<div class=\"tl-group tl-group-(live|see)\">\s*<div class=\"tl-group-label\"><b>([^<]+)</b><span>([^<]+)</span></div>\s*<div class=\"tl-group-tiles\">(.*?)</div>\s*</div>", h, re.S)
ok = ok and [(g[0], g[1]) for g in groups] == [("live", "Interactive"), ("see", "Built to order")]
for kind, _, _, inside in groups:
    kinds = re.findall(r"<a class=\"tl-tile tl-(live|see)\"", inside)
    ok = ok and len(kinds) > 0 and set(kinds) == {kind}                    # every tile is in the group that says what it is
ok = ok and sum(len(re.findall(r"<a class=\"tl-tile ", g[3])) for g in groups) == 13
ok = ok and ".tl-see{border-style:dashed" in s and ".tl-group[hidden]{display:none}" in s
ok = ok and groups[1][2] == "open one to read about it"
ok = ok and ".tl-tiles{display:grid;grid-template-columns:minmax(0,1fr);" in s and "minmax(0,3fr) minmax(0,1fr)" not in s    # one under the other
see = re.findall(r"<a class=\"tl-tile tl-see\"[^>]*>(.*?)</a>", groups[1][3], re.S)
ok = ok and len(see) == 3 and all(x.count("<b class=\"tl-caret\"></b>") == 1 for x in see) and "tl-caret" not in groups[0][3]
# what opens is the words of its own card, read when it is pressed: the page holds an empty place for it and no second copy
ok = ok and h.count("<div class=\"tl-more\" id=\"tl-more\" hidden></div>") == 1 and "card.querySelector(\x27.build-head ~ p\x27)" in h
sys.exit(0 if ok else 1)
PY'
check "the scorecard is named on the Tools page as the rest of the site names it: the free website score" 'f="$site/tools/index.html"; grep -q "<span class=\"tl-name\">Free Website Score <small>The RIA Digital Presence Scorecard</small></span>" "$f" && grep -q "<h3>Free Website Score</h3>" "$f" && grep -q "The RIA Digital Presence Scorecard: the same free score offered on our home page and under Services." "$f" && ! grep -q "<h3>RIA Digital Presence Scorecard</h3>" "$f"'
# The owner, the same day, of the three platforms: "these cards are too verbose and vertically long".
check "a platform card is its name, a short paragraph, three figures and the way to ask: what it does opens on a press" 'python3 - "$site/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
cards = re.findall(r"<div class=\"tool-card build-card reveal d\d\d\" id=\"(built-[a-z]+)\">(.*?)\n      </div>\n", s, re.S)
ok = [c[0] for c in cards] == ["built-crm", "built-league", "built-golf"]
for cid, inside in cards:
    para = re.findall(r"\n        <p>(.*?)</p>", inside)
    ok = ok and len(para) == 1 and len(re.sub(r"&[a-z]+;", "x", para[0]).split()) <= 34          # two sentences, not a column
    more = re.search(r"<details class=\"build-more\">\s*<summary>What it does</summary>\s*<ul class=\"build-points\">(.*?)</ul>\s*</details>", inside, re.S)
    ok = ok and bool(more) and len(re.findall(r"<li>", more.group(1))) == 6 and " open" not in inside.split("<details")[1].split(">")[0]
    ok = ok and len(re.findall(r"<span><b>[\d,]+</b> [^<]+</span>", inside)) == 3 and "class=\"tool-link\">Ask for a walkthrough</a>" in inside
    ok = ok and inside.index("build-head") < inside.index("build-facts") < inside.index("build-more") < inside.index("tool-link")
sys.exit(0 if ok else 1)
PY'
# And of the light section under them, with its stadium, cinema and trading-card panels: "this section is out of
# keeping with the style and should be better organized and displayed".
check "no section of the Tools page is light: Just for fun sits on the navy, one grid of cards of one kind under Sports and Movies" 'python3 - "$dist/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
body = s[s.index("<body"):]
ok = "class=\"section-light" not in body and "<section class=\"section-dark fun-band\" id=\"fun\">" in body
fun = body[body.index("<section class=\"section-dark fun-band\""):]
fun = fun[:fun.index("</section>")]
heads = re.findall(r"<h3 class=\"subgroup-title\">([^<]+)</h3>", fun)
ok = ok and heads == ["Sports", "Movies"]
cards = re.findall(r"<a href=\"(/tools/[^\"]+)\" class=\"(scorecard|playbill|tradingcard)\">(.*?)</a>", fun, re.S)
ok = ok and len(cards) == 8
for href, kind, inside in cards:                                             # the same parts, in the same order, on every card
    parts = [m.start() for m in (re.search(p, inside) for p in (r"<svg class=\"[a-z]+-icon\" aria-hidden=\"true\"><use href=\"#i-[a-z]+\"/></svg>", r"<h4>[^<]+</h4>", r"<p>.+?</p>", r"<span class=\"scorecard-stat\">Interactive[^<]*</span>", r"<span class=\"scorecard-launch\">(Open|See it)</span>")) if m]
    ok = ok and len(parts) == 5 and parts == sorted(parts)
order = [c[0] for c in cards]
ok = ok and order.index("/tools/card-evaluator/") < order.index("/tools/oscar-tracker/")       # the card evaluator is filed with Sports
ok = ok and not re.search(r"playbill-ticket|tradingcard-holo|tradingcard-stats|Now Showing|From the Collection", fun)
ok = ok and ".fun-band .subgroup,.fun-band .subgroup-grid{display:contents}" in s
sys.exit(0 if ok else 1)
PY'
check "its first section is as tall as the first screen less the strip, by a phone's own measure where there is one, and the strip is the next thing in the page" 'python3 - "$site/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
ok = "min-height:calc(100vh - 2.125rem)" in s and "@supports (height:100svh){.tl-hero{min-height:calc(100svh - 2.125rem)}}" in s
ok = ok and "min-height:calc(100vh - 2rem)" in s and "@supports (height:100svh){.tl-hero{min-height:calc(100svh - 2rem)}}" in s
# the strip is 2.125rem tall (34px as drawn), 2rem on a phone: the numbers above are its
css = open(sys.argv[1].replace("tools/index.html", "css/ticker.css"), encoding="utf-8").read()
ok = ok and re.search(r"\.sa-tk\{[^}]*height:2\.125rem", css) and re.search(r"@media\(max-width:768px\)\{[^@]*\.sa-tk\{[^}]*height:2rem", css)
hero = re.search(r"<section class=\"page-hero tl-hero\">.*?</section>", s, re.S)
after = re.sub(r"<!--.*?-->", "", s[hero.end():], flags=re.S).lstrip() if hero else ""
ok = ok and after.startswith("<link rel=\"stylesheet\" href=\"/css/ticker.css?v=")
sys.exit(0 if ok else 1)
PY'
# Its headline was one sentence kept on one line ("this one is okay to stay") until the
# owner asked for it to put the question ("frame it more of your website can do
# more..... what can/should your website do for you?") and chose, of four: the white
# line as it was, with "website", and the question in blue on a line of its own.
check "its headline keeps its line and adds the question, in blue, on a line of its own like every page's: no rule of its own keeps it on one line any more" 'grep -q "<h1>Your website can do more than describe you. <em>What should it do for you?</em></h1>" "$site/tools/index.html" && ! grep -q "tl-hero h1 em{display:inline}" "$site/tools/index.html"'
# A tile says what it is. The owner, 2026-11-27, of the Business tools on a phone: "RIA digital
# presence scorecard and Resume parser should be bigger/stand alone there as interactive tools
# or named as interactive versus merely descriptive". And of the emoji: "Icons could be MUCH better".
check "a tile for a tool to use says it is interactive, and one for a platform described below says it is built to order: by where it leads" 'python3 - "$dist/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
h = re.search(r"<section class=\"page-hero tl-hero\">.*?</section>", s, re.S).group(0)
tiles = re.findall(r"<a class=\"tl-tile tl-(live|see)\" href=\"([^\"]+)\" data-kind=\"([a-z]+)\"(?: hidden)?>(.*?)</a>", h, re.S)
ok = len(tiles) == 13
for how, href, kind, inside in tiles:
    ok = ok and (how == "see") == href.startswith("#built-")                       # described lower down, or a tool of its own
    tag = re.search(r"<span class=\"tl-tag\">(.*?)</span>(?:</span>)?<span class=\"tl-go\"", inside, re.S)
    ok = ok and bool(tag) and (tag.group(1) == "Interactive &middot; try it now" if how == "live" else tag.group(1).startswith("Built to order"))
    ok = ok and ("&rarr;" if how == "live" else "class=\"tl-caret\"") in inside and ("&darr;" not in inside)
# the two an advisor would use are tools to use, and lead the page as it opens
first = [(how, href) for how, href, kind, _ in tiles if kind == "business"]
ok = ok and first == [("live", "/tools/website-scorer/"), ("live", "/tools/resume-parser/"), ("see", "#built-crm")]
# in each kind the tools to use come before the platforms described
for kind in ("business", "sports", "movies"):
    hows = [how for how, _, k, _ in tiles if k == kind]
    ok = ok and hows == sorted(hows)
ok = ok and "<div class=\"tl-tiles few\" id=\"tl-tiles\">" in h                # Business, three tools: the large tiles from the start
sys.exit(0 if ok else 1)
PY'
check "every icon on the Tools page is drawn: one of the page own symbols, and no emoji stands in for one" 'python3 - "$dist/tools/index.html" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
have = set(re.findall(r"<symbol id=\"(i-[a-z]+)\" viewBox=\"0 0 24 24\">", s))
used = re.findall(r"<svg class=\"(tl-ico|tool-icon|scorecard-icon|playbill-icon|tradingcard-icon)\" aria-hidden=\"true\"><use href=\"#(i-[a-z]+)\"/></svg>", s)
ok = len(have) == 13 and len(used) == 13 + 13 and all(i in have for _, i in used) and {i for _, i in used} == have
ok = ok and sum(1 for c, _ in used if c == "tl-ico") == 13
ok = ok and not re.search(r"class=\"(?:tl-ico|tool-icon|scorecard-icon|playbill-icon|tradingcard-icon)\"[^>]*>[^<]", s)   # no text or emoji in an icon
ok = ok and not re.search(r"&#(?:1[0-9]{4,5}|9[0-9]{3});", s)                    # no emoji entity left on the page
sys.exit(0 if ok else 1)
PY'
check "the rules for its first section are for that section alone: a tool page, built with the same head, opens on a plain one with no tiles" 'f="$dist/tools/football/nfl-lines-tracker/index.html"; grep -q "<section class=\"page-hero\">" "$f" && ! grep -q "class=\"page-hero tl-hero\"" "$f" && ! grep -q "class=\"tl-tile" "$f" && ! grep -E "^\.tl-[a-z]+" "$site/tools/index.html" | grep -vqE "^\.tl-(hero|chips|chip|tiles|tile|ico|text|name|kind|tag|go|live|see|more|group|caret)(-[a-z]+)?[ .:,{\[]"'

# --- every inner page opens on a supporting figure with its source
# The owner, 2026-11-26: "each of the page heros should be consistent. white
# line 1, blue line 2. They should all have at least one supporting statistic.
# adoption dies in week three. how do i know that? how do they know that's
# true?" The owner approved the five figures and chose the Approach page's line.
figs_ok=0
for pair in "services:62%:Broadridge, 2025" "approach:56%:Morningstar, 2026" "about:244:DeVoe &amp; Company, 2026" "contact:3%:Orion, 2026" "tools:72%:Wealthtender, 2025"; do
  page=${pair%%:*}; rest=${pair#*:}; num=${rest%%:*}; src=${rest#*:}
  if python3 - "$dist/$page/index.html" "$num" "$src" <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read(); num, src = sys.argv[2], sys.argv[3]
hero = re.search(r"<section class=\"page-hero[^\"]*\">.*?</section>", s, re.S)
figs = re.findall(r"<div class=\"hero-stat sa-cite[^\"]*\" tabindex=\"0\">(.*?</a></span>)</div>", hero.group(0) if hero else "", re.S)
ok = len(figs) == 1
if ok:
    f = figs[0]
    ok = f.startswith("<div class=\"stat-num\">%s</div><div class=\"stat-label\">" % num)
    ok = ok and "<span class=\"sa-cite-src\">Source: %s</span>" % src in f                      # who says so, and when, in view
    card = re.search(r"<span class=\"sa-cite-card\" role=\"note\"><strong>[^<]{30,}</strong>.*?<span>[^<]{40,}</span><a href=\"https://[^\"]+\" target=\"_blank\" rel=\"noopener\">[^<]+</a></span>$", f, re.S)
    ok = ok and bool(card)                                                                      # the finding, who was asked, a link
# the source cards are styled and opened on this page
ok = ok and re.search(r"href=\"/css/cite\.css\?v=[0-9a-f]{8}\"", s) and "<script src=\"/js/cite.js\"></script>" in s
sys.exit(0 if ok else 1)
PY
  then figs_ok=$((figs_ok+1)); else echo "  the opening figure is not right on /$page/"; fi
done
check "Services, Approach, About, Contact and Tools each open on one figure, with its source in view and a card that links to it: $figs_ok of 5" '[ "$figs_ok" = 5 ]'
check "the four figures taken from the home page say of themselves what the home page says" 'python3 - "$home" "$site" <<'"'"'PY'"'"'
import re, sys
home = open(sys.argv[1], encoding="utf-8").read()
ok = True
for page, num in (("services", "62%"), ("contact", "3%"), ("tools", "72%")):
    s = open("%s/%s/index.html" % (sys.argv[2], page), encoding="utf-8").read()
    there = re.search(r"<div class=\"stat-num\">%s</div>.*?(<span class=\"sa-cite-card\".*?</a></span>)</div>" % re.escape(num), home, re.S)
    here = re.search(r"<div class=\"hero-stat sa-cite[^\"]*\" tabindex=\"0\"><div class=\"stat-num\">%s</div>.*?(<span class=\"sa-cite-card\".*?</a></span>)</div>" % re.escape(num), s, re.S)
    ok = ok and bool(there and here) and there.group(1) == here.group(1)
sys.exit(0 if ok else 1)
PY'
check "the About page's figure is the deal count the market strip carries, and names the same Deal Book" 'python3 - "$site/about/index.html" "$site/lib/market.php" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read(); php = open(sys.argv[2], encoding="utf-8").read()
deals = php[php.index("const MARKET_DEALS = ["):]
count = re.search(r"\x27count\x27 => (\d+)", deals).group(1)
year = re.search(r"\x27year\x27 => (\d+)", deals).group(1)
book = re.search(r"\x27book\x27 => \x27([^\x27]+)\x27", deals).group(1)
url = re.search(r"\x27url\x27 => \x27([^\x27]+)\x27", deals).group(1)
fig = re.search(r"<div class=\"hero-stat sa-cite\" tabindex=\"0\"><div class=\"stat-num\">(\d+)</div><div class=\"stat-label\">([^<]+)</div>.*?</a></span></div>", s, re.S)
ok = bool(fig) and fig.group(1) == count and year in fig.group(2)
ok = ok and book.replace("&", "&amp;") in fig.group(0) and "href=\"%s\"" % url in fig.group(0)
sys.exit(0 if ok else 1)
PY'
check "the line with no source is gone from the Approach page, which now says what the owner chose" '! grep -rqi "week three" "$site" "$here/content" "$here/scripts" && ! grep -q "Most &ldquo;cleanups&rdquo; fail" "$site/approach/index.html" && grep -q "<p class=\"page-hero-sub\">A cleanup built on someone else&rsquo;s workflow does not stick. We build on the way your team already works.</p>" "$site/approach/index.html"'

# --- the logo
# The owner, 2026-11-26: "the logo is small and near invisible on the site". The
# menu showed the logo file whole, a white square 36px tall with the name about
# 8px tall inside it. Asked which fix, the owner chose the wordmark alone with
# white lettering for the menu, and both logos together "where appropriate":
# the footer.
word="$site/img/wordmark-on-dark.png"; vword=$(sha1sum "$word" | cut -c1-8); vcss=$(sha1sum "$site/css/shared.css" | cut -c1-8)
dims=$(python3 -c 'import struct,sys; print("%d %d" % struct.unpack(">II", open(sys.argv[1],"rb").read()[16:24]))' "$word")
check "the menu's logo is the wordmark alone: a wide picture with a clear ground, not the square" 'python3 - "$word" <<'"'"'PY'"'"'
import struct, sys
b = open(sys.argv[1], "rb").read()
if b[:8] != b"\x89PNG\r\n\x1a\n": sys.exit(1)
w, h, depth, kind = struct.unpack(">IIBB", b[16:26])
clear = kind in (4, 6) or b"tRNS" in b          # its own transparency
sys.exit(0 if clear and w >= 450 and w > h * 2.5 and len(b) < 60000 else 1)
PY'
check "the tool that makes it from the logo file is kept with it" '[ -s "$here/scripts/logo_cutout.py" ] && grep -q "site. / .img. / .logo.jpg" "$here/scripts/logo_cutout.py" && [ -s "$site/img/logo.jpg" ]'
logos_ok=0; logo_pages=0
for f in "$dist/index.html" "$dist/services/index.html" "$dist/approach/index.html" "$dist/tools/index.html" "$dist/about/index.html" "$dist/contact/index.html" "$dist/insights/index.html" "$dist/insights/most-firms-dont-need-more-software/index.html" "$dist/tools/football/nfl-lines-tracker/index.html"; do
  logo_pages=$((logo_pages+1))
  if python3 - "$f" "$vword" $dims <<'PY'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read(); v = sys.argv[2]
word = r'<img src="/img/wordmark-on-dark\.png\?v=' + v + r'" alt="Spatacco Analytics" class="%s" width="' + sys.argv[3] + '" height="' + sys.argv[4] + '">'
nav = re.search(r"<nav[^>]*>.*?</nav>", s, re.S); foot = re.search(r"<footer>.*?</footer>", s, re.S)
ok = bool(nav and foot)
ok = ok and len(re.findall(word % "logo", nav.group(0))) == 1 and len(re.findall(r"<img\b", nav.group(0))) == 1
# the footer: the wordmark first, alone in its place at the left; the SA mark on its tile last, after the line of
# text, at the right (the owner, 2026-11-27: "move it to the right side so it's more of a reference rather than
# competing"); and nothing else pictured
F = foot.group(0)
mark = '<img src="/img/logo-square.png" alt="" class="footer-mark" width="512" height="512">'
ok = ok and len(re.findall(r'class="footer-brand">' + word % "footer-logo" + r"</(?:a|span)>", F)) == 1 and len(re.findall(r"<img\b", F)) == 2
ok = ok and F.count(mark) == 1 and re.search(r'<div class="footer-text">.*?</div>\s*' + re.escape(mark) + r"\s*</footer>$", F, re.S) is not None
# the square is not shown anywhere on the page, and no logo is written into the page itself
ok = ok and "/img/logo.jpg" not in s and not re.search(r"<img[^>]*src=\"data:", s)
sys.exit(0 if ok else 1)
PY
  then logos_ok=$((logos_ok+1)); else echo "  the logo is not right on ${f#$dist}"; fi
done
check "every page shows the wordmark in its menu, and in its footer the wordmark first and the SA mark last, at the picture's current address (now ?v=$vword): $logos_ok of $logo_pages" '[ "$logos_ok" = "$logo_pages" ]'
check "the home page no longer carries the logo written into the page twice (it is now $(wc -c < "$home") bytes)" '[ "$(wc -c < "$home")" -lt 60000 ]'
check "the menu shows it 48px tall as drawn (3rem), and the bar is no taller for it" 'grep -q "nav .logo{height:3rem;width:auto;display:block}" "$site/css/shared.css" && grep -q "nav .logo{height:3rem;width:auto;display:block}" "$home" && grep -q "align-items:center;padding:0.875rem 3rem;" "$site/css/shared.css" && grep -q "align-items:center;padding:0.875rem 3rem;" "$home"'
# --- the picture a link to the site shows
# The owner, 2026-11-26: "can i make sure the new logo is front and center for
# linkedin / google search, etc?" The share picture led with the SA mark and the
# name set in type; it leads with the wordmark now. A site that shows a link's
# picture keeps its own copy by address, so the address carries a version.
share="$site/img/social-card.png"; vshare=$(sha1sum "$share" | cut -c1-8)
check "the share picture is the size link previews ask for, and light enough for every one of them ($(( $(wc -c < "$share") / 1024 )) KB)" 'python3 - "$share" <<'"'"'PY'"'"'
import struct, sys
b = open(sys.argv[1], "rb").read()
w, h = struct.unpack(">II", b[16:24])
sys.exit(0 if b[:8] == b"\x89PNG\r\n\x1a\n" and (w, h) == (1200, 630) and len(b) < 300000 else 1)
PY'
shared_ok=$(grep -rlE "og:image\" content=\"https://spataccoanalytics.com/img/social-card\.png" "$dist" --include=*.html | while read -r f; do grep -q "og:image\" content=\"https://spataccoanalytics.com/img/social-card.png?v=$vshare\"" "$f" && echo "$f"; done | wc -l)
shared_all=$(grep -rlE "og:image\" content=\"https://spataccoanalytics.com/img/social-card\.png" "$dist" --include=*.html | wc -l)
check "every page that shares it names its current address (now ?v=$vshare): $shared_ok of $shared_all pages" '[ "$shared_all" -ge 9 ] && [ "$shared_ok" = "$shared_all" ]'
check "the tools that draw the wordmark and the pictures made with it are kept, with the large wordmark they use" '[ -s "$here/scripts/brand_images.cjs" ] && [ -s "$here/brand/wordmark-on-dark-large.png" ] && grep -q "brand/wordmark-on-dark-large.png" "$here/scripts/brand_images.cjs"'
check "the pictures for the owner to upload are there: a LinkedIn banner, a Google cover, and the wordmark and the SA mark as squares" 'python3 - "$here/brand/profile" <<'"'"'PY'"'"'
import struct, sys, os
want = {"linkedin-cover-2256x382.png": (2256, 382), "google-cover-1200x900.png": (1200, 900), "wordmark-square-800.png": (800, 800), "google-logo-720.png": (720, 720)}
ok = True
for name, size in want.items():
    f = os.path.join(sys.argv[1], name)
    if not os.path.isfile(f): ok = False; continue
    b = open(f, "rb").read()
    ok = ok and struct.unpack(">II", b[16:24]) == size and 10000 < len(b) < 3000000      # LinkedIn takes up to 3 MB, Google from 10 KB to 5 MB
sys.exit(0 if ok else 1)
PY'

# The host keeps a stylesheet for a year, so the shared one carries a version too.
stale=$(grep -rlE "href=\"/css/shared\.css" "$dist" --include=*.html | while read -r f; do grep -q "href=\"/css/shared.css?v=$vcss\"" "$f" || echo "$f"; done | wc -l)
linked=$(grep -rlE "href=\"/css/shared\.css" "$dist" --include=*.html | wc -l)
check "every page that uses the shared stylesheet asks for its current version (now ?v=$vcss): $linked pages" '[ "$linked" -ge 8 ] && [ "$stale" = 0 ]'
# The same goes for every stylesheet and script the pages share (scripts/asset_versions.py):
# the source cards' and the Insights pages' had no version at all until November 2026.
check "every shared stylesheet and script is asked for by its current version: $(python3 "$here/scripts/asset_versions.py" --check 2>&1 | head -1)" 'python3 "$here/scripts/asset_versions.py" --check >/dev/null'
check "and the built pages carry those versions, the Insights pages and each tool page included" 'v1=$(sha1sum "$site/css/cite.css" | cut -c1-8); v2=$(sha1sum "$site/css/insights.css" | cut -c1-8); ! grep -rlE "href=\"/css/(cite|insights)\.css\"" "$dist" --include=*.html | grep -q . && grep -q "href=\"/css/cite.css?v=$v1\"" "$dist/insights/index.html" && grep -q "href=\"/css/insights.css?v=$v2\"" "$dist/insights/index.html" && grep -q "href=\"/css/cite.css?v=$v1\"" "$dist/tools/football/nfl-lines-tracker/index.html"'

# --- the page grows with the window (scripts/scale_css.py)
# The owner, 2026-11-27, with the site at 100% beside the same page at 150%: "the site looks
# better at 150% size than 100%, there should be some adjustment. with a target market of
# 50-80 year olds I shouldn't ask people to squint". Chosen of three: match the 150% view.
check "every size on the main pages, the scorer and the Insights pages is in rem, and each says it grows: $(python3 "$here/scripts/scale_css.py" --check 2>&1 | head -1)" 'python3 "$here/scripts/scale_css.py" --check >/dev/null'
check "the rule that grows them is the one written down, in the shared stylesheet and on the home page, which does not use it" 'r="html.sa-scale{font-size:clamp(16px,min(calc(100vw / 78.4375),calc(100vh / 37.9375)),28px)}"; grep -qF "$r" "$site/css/shared.css" && grep -qF "$r" "$home" && grep -q "href=\"/css/shared.css?v=" "$site/tools/website-scorer/index.html"'
check "on a phone no text is under 13px: the floor is set in the same two places" 'f="@media(max-width:760px){:root{--tfloor:0.8125rem}}"; grep -qF "$f" "$site/css/shared.css" && grep -qF "$f" "$home"'
check "the Insights pages grow too, and a tool page built with the tools head does not until its own styles are in rem" 'grep -q "<html lang=\"en\" class=\"sa-scale\">" "$dist/insights/index.html" && ! grep -q "sa-scale" "$dist/tools/football/nfl-lines-tracker/index.html"'
# --- the light and the dark version (scripts/theme_css.py, site/js/theme.js)
# The owner, 2026-11-27: "Spatacco analytics should have a light/dark option ... sun/moon. I would like the sun to
# have sunglasses on and be in the top right corner of the box".
check "the colours of the main pages, the scorer and the Insights stylesheet are on the shared variables, so each has a light counterpart: $(python3 "$here/scripts/theme_css.py" --check 2>&1 | head -1)" 'python3 "$here/scripts/theme_css.py" --check >/dev/null'
check "every main page, and the Insights shell, sets the chosen version in its first line after body and loads the switch by its version; a tool page built with the tools head does neither" 'v=$(sha1sum "$site/js/theme.js" | cut -c1-8); for f in "$home" "$site/services/index.html" "$site/approach/index.html" "$site/about/index.html" "$site/contact/index.html" "$site/tools/index.html" "$site/tools/website-scorer/index.html" "$dist/insights/index.html"; do grep -A3 "^<body>" "$f" | grep -q "localStorage.getItem(\"sa_theme\")===\"light\"" && grep -q "<script src=\"/js/theme.js?v=$v\" defer></script>" "$f" || exit 1; done; ! grep -q "theme.js\|sa_theme" "$dist/tools/football/nfl-lines-tracker/index.html"'
check "the two palettes are declared in the shared stylesheet and on the home page, which carries its own styles, and the menu, the footer and a section that was light from the start keep their first colours" 'for f in "$site/css/shared.css" "$home"; do grep -q "^:root\[data-theme=\"light\"\]{--navy:#F6F8FB;" "$f" && grep -q "^:root\[data-theme=\"light\"\] nav,:root\[data-theme=\"light\"\] footer,:root\[data-theme=\"light\"\] .sa-dark,:root\[data-theme=\"light\"\] .section-light{--navy:#0F1B2D;" "$f" || exit 1; done'
if node -e "require('playwright')" 2>/dev/null; then
  (cd "$dist" && exec python3 -m http.server 18747 --bind 127.0.0.1 >/dev/null 2>&1) & lpid=$!
  for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:18747/" && break; sleep 0.1; done
  lout=$(node "$here/tests/logo_browser.cjs" http://127.0.0.1:18747 2>&1); lcode=$?
  hout=$(node "$here/tests/hero_browser.cjs" http://127.0.0.1:18747 2>&1); hcode=$?
  sout=$(node "$here/tests/scorer_browser.cjs" http://127.0.0.1:18747 2>&1); scode=$?
  zout=$(node "$here/tests/scale_browser.cjs" http://127.0.0.1:18747 2>&1); zcode=$?
  tout=$(node "$here/tests/theme_browser.cjs" http://127.0.0.1:18747 2>&1); tcode=$?
  kill "$lpid" 2>/dev/null
  check "the logos show in a browser: $(printf '%s' "$lout" | tail -1)" '[ $lcode -eq 0 ]'
  [ $lcode -eq 0 ] || printf '%s\n' "$lout"
  check "the first screens are right in a browser: $(printf '%s' "$hout" | tail -1)" '[ $hcode -eq 0 ]'
  [ $hcode -eq 0 ] || printf '%s\n' "$hout"
  check "the scorer looks a firm name up in a browser: $(printf '%s' "$sout" | tail -1)" '[ $scode -eq 0 ]'
  [ $scode -eq 0 ] || printf '%s\n' "$sout"
  check "the pages grow with the window, and a phone shows no text under 13px: $(printf '%s' "$zout" | tail -1)" '[ $zcode -eq 0 ]'
  [ $zcode -eq 0 ] || printf '%s\n' "$zout"
  check "the light and the dark version, in a browser: $(printf '%s' "$tout" | tail -1)" '[ $tcode -eq 0 ]'
  [ $tcode -eq 0 ] || printf '%s\n' "$tout"
else
  echo "no browser here: the logos were not opened"
fi

# --- house rules
check "no long dash on the home page or the two new pages" '! grep -lE "&mdash;|"$'"'"'\xe2\x80\x94'"'"' "$home" "$site/approach/index.html" "$site/about/index.html"'
check "no project price on any of them" '! grep -nE "\\\$[0-9][0-9,]{3,}" "$site/approach/index.html" "$site/about/index.html"'

if [ "$fails" -eq 0 ]; then echo "$n/$n page checks passed"; else echo "$fails of $n page checks failed"; exit 1; fi
