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
check "and sends the visitor to the website scorer" 'grep -q "<a href=\"/tools/website-scorer.html?scope=website&amp;utm_source=home\" class=\"screen-cta\">Score Your Website</a>" "$home" && [ -s "$dist/tools/website-scorer.html" ]'
check "it does not call the website the number one way advisors are checked (no study says so)" '! ask "$home" said | grep -qiE "number one|#1|no\. 1|top way|most important"'
check "How We Work keeps its headline and its line, and leads to its own page" 'ask "$home" said | grep -qE "Keep the way you work\. +Lose the mess\." && ! grep -qi "messy system" "$home" "$here/site/approach/index.html" && grep -q "<p class=\"approach-kicker reveal d05\">Adoption isn&rsquo;t a fight. It&rsquo;s a non-event.</p>" "$home" && grep -q "<a href=\"/approach/\" class=\"section-go\">Read how we work</a>" "$home"'
check "the place posts are added to the home page is still there, above the closing band" 'grep -q "<!-- sa-insights -->" "$home" && [ "$(grep -bo "<!-- sa-insights -->" "$home" | cut -d: -f1)" -lt "$(grep -bo "class=\"contact-section\"" "$home" | cut -d: -f1)" ]'

# --- every pillar leads somewhere real
for id in crm audit design; do
  check "a pillar links to the $id service, and the services page has it" 'grep -q "<a class=\"service-card [a-z]* reveal d[0-9]*\" href=\"/services/#$id\">" "$home" && grep -q "<fieldset class=\"sv-card reveal\" id=\"$id\" data-service=\"$id\"" "$site/services/index.html"'
done
check "the first screen says what we do in the owner's softer words" 'grep -q "We help advisory firms get their CRM, data and website ready before anyone asks." "$home"'
check "on a desktop the first screen and the website screen put their figures in a column on the right" 'grep -q "@media(min-width:1080px){" "$home" && grep -q "\.hero-content{display:grid;grid-template-columns:minmax(0,1fr) 290px;" "$home" && grep -q "\.screen-inner{display:grid;grid-template-columns:minmax(0,1fr) 290px;" "$home"'
check "on a phone the figures are one vertical stack, not side by side" 'grep -q "\.stat-bar{flex-direction:column;gap:20px}" "$home" && ! grep -q "\.hero \.stat-bar{display:grid" "$home"'
check "the pillars are one height with their links on one line" 'grep -q "a.service-card{display:flex;flex-direction:column;" "$home" && grep -q "\.service-go{display:block;margin-top:auto;" "$home"'
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
check "the approach page has the argument and the four steps in full" 'f="$site/approach/index.html"; grep -q "We just finish the job." "$f" && grep -q "Adoption isn&rsquo;t a fight. It&rsquo;s a non-event." "$f" && [ "$(grep -o "class=\"step-num\"" "$f" | wc -l)" = 4 ] && grep -q "Self-sufficiency is the goal." "$f"'
check "the about page has who we are, who we serve, and the Microsoft 365 line" 'f="$site/about/index.html"; grep -q "founded by a business development and M&amp;A professional" "$f" && [ "$(grep -o "<span class=\"client-tag" "$f" | wc -l)" = 9 ] && grep -q "Microsoft 365 Business Premium" "$f"'

# --- every menu reaches every page
want="/services/,/approach/,/about/,/tools/,/contact/"
for f in "$home" "$site/services/index.html" "$site/tools/index.html" "$site/contact/index.html" "$site/approach/index.html" "$site/about/index.html"; do
  check "the menu on ${f#$site} reaches all five pages" '[ "$(ask "$f" nav | sed "s#^/,##")" = "$want" ]'
done
check "posts carry the same menu" 'grep -q "<a href=\"/approach/\">Approach</a>" "$here/scripts/build_insights.py" && grep -q "<a href=\"/about/\">About</a>" "$here/scripts/build_insights.py"'
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
check "the summary for AI tools lists both new pages" 'grep -q "https://spataccoanalytics.com/approach/" "$site/llms.txt" && grep -q "https://spataccoanalytics.com/about/" "$site/llms.txt"'

# --- house rules
check "no long dash on the home page or the two new pages" '! grep -lE "&mdash;|"$'"'"'\xe2\x80\x94'"'"' "$home" "$site/approach/index.html" "$site/about/index.html"'
check "no project price on any of them" '! grep -nE "\\\$[0-9][0-9,]{3,}" "$site/approach/index.html" "$site/about/index.html"'

if [ "$fails" -eq 0 ]; then echo "$n/$n page checks passed"; else echo "$fails of $n page checks failed"; exit 1; fi
