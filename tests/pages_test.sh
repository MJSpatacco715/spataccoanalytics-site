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
for f in unleash/index.html unleash/kraken.html; do
  check "the delisted page /$f is kept out of search and out of the sitemap" 'grep -q "<meta name=\"robots\" content=\"noindex\">" "$dist/$f" && ! grep -q "unleash" "$site/sitemap.xml"'
done

# --- Bing is told what a publish changed (IndexNow)
key=$(cd "$site" && ls | grep -E '^[0-9a-f]{32}\.txt$' | sed 's/\.txt$//')
check "the site serves one IndexNow key, and the file holds its own name" '[ "$(printf "%s\n" "$key" | grep -c .)" = 1 ] && [ "$(cat "$site/$key.txt")" = "$key" ] && [ -s "$dist/$key.txt" ]'
tell() { printf '%s\n' "$@" | python3 "$here/scripts/indexnow.py" --site "$site" --dist "$dist"; }
told=$(tell site/services/index.html site/index.html site/tools/website-scorer.html site/services/index.html)
check "a changed page is named once, by its own address, with the key and where to read it" 'python3 - "$told" "$key" <<'"'"'PY'"'"'
import json, sys
d = json.loads(sys.argv[1]); k = sys.argv[2]
ok = (d["host"] == "spataccoanalytics.com" and d["key"] == k and d["keyLocation"] == "https://spataccoanalytics.com/%s.txt" % k
      and d["urlList"] == ["https://spataccoanalytics.com/services/", "https://spataccoanalytics.com/", "https://spataccoanalytics.com/tools/website-scorer.html"])
sys.exit(0 if ok else 1)
PY'
check "a style, a script, a picture or a test changing names nothing" '[ -z "$(tell site/css/ticker.css site/js/ticker.js site/img/logo-square.png tests/pages_test.sh site/lib/market.php README.md)" ]'
check "a page kept out of search is never named" '[ -z "$(tell site/unleash/index.html site/unleash/kraken.html site/score/index.html site/bank/index.html)" ]'
check "a post is named only once the sitemap lists it" '[ -z "$(tell content/posts/2026-12-01-not-published-yet.json)" ]'
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
  grep -qF "<a href=\"$li\" target=\"_blank\" rel=\"noopener\" style=\"color:inherit;text-decoration:underline;text-underline-offset:3px\">LinkedIn</a>" "$f" || { bare=$((bare+1)); echo "  no readable LinkedIn link: ${f#$dist}"; }
done
check "every page that signs off links to it, in the colour of its own footer line and underlined" '[ "$signed" -ge 6 ] && [ "$bare" = 0 ]'

# --- house rules
check "no long dash on the home page or the two new pages" '! grep -lE "&mdash;|"$'"'"'\xe2\x80\x94'"'"' "$home" "$site/approach/index.html" "$site/about/index.html"'
check "no project price on any of them" '! grep -nE "\\\$[0-9][0-9,]{3,}" "$site/approach/index.html" "$site/about/index.html"'

if [ "$fails" -eq 0 ]; then echo "$n/$n page checks passed"; else echo "$fails of $n page checks failed"; exit 1; fi
