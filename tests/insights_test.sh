#!/usr/bin/env bash
# scripts/build_insights.py: posts become pages, a feed and a homepage teaser;
# drafts stay out; what a post says is text, never markup; a number without a
# source does not build; and with no posts the site is left as it was.
#   bash tests/insights_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }

python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/none" --posts "$t/no-such-dir" >/dev/null
check "no posts: no insights pages" '[ ! -e "$t/none/insights" ]'
check "no posts: the homepage has no teaser" '! grep -q "in-home" "$t/none/index.html"'

python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/out" --posts "$here/tests/fixtures/posts" >/dev/null
i="$t/out/insights"
check "a page per published post" '[ -f "$i/sample-practice/index.html" ] && [ -f "$i/sample-sports/index.html" ]'
check "a draft is not published" '[ ! -e "$i/sample-draft" ] && ! grep -q "A draft" "$i/index.html"'
check "the feed lists both, newest first" 'grep -q "A sample sports piece" "$i/index.html" && [ "$(grep -o "sample-[a-z]*/" "$i/index.html" | head -1)" = "sample-sports/" ]'
check "the feed offers the categories in use" 'grep -q "data-show=\"practice\"" "$i/index.html" && grep -q "data-show=\"sports\"" "$i/index.html" && ! grep -q "data-show=\"markets\"" "$i/index.html"'
check "what a post says is text, never markup" 'grep -q "&lt;b&gt;markup&lt;/b&gt;" "$i/sample-practice/index.html" && ! grep -q "<b>markup</b>" "$i/sample-practice/index.html" && grep -q "A sample piece &lt;for&gt; advisors" "$i/sample-practice/index.html"'
check "a statistic carries its source card" 'grep -q "sa-cite-card" "$i/sample-practice/index.html" && grep -q "Source: Test Bureau, 2026" "$i/sample-practice/index.html" && grep -q "https://example.com/source" "$i/sample-practice/index.html"'
check "the homepage shows the advisor piece and not the sports one" 'grep -q "in-home" "$t/out/index.html" && grep -q "sample-practice/" "$t/out/index.html" && ! grep -q "sample-sports/" "$t/out/index.html"'
check "the RSS feed is well-formed and has both" 'python3 -c "import sys,xml.dom.minidom as m; d=m.parse(sys.argv[1]); assert len(d.getElementsByTagName(\"item\"))==2" "$i/feed.xml"'
check "the sitemap gains the section and its posts" 'grep -q "/insights/</loc>" "$t/out/sitemap.xml" && grep -q "/insights/sample-practice/</loc>" "$t/out/sitemap.xml"'
check "LinkedIn words: the custom ones when given, with the link" '[ "$(python3 "$here/scripts/build_insights.py" --posts "$here/tests/fixtures/posts" --linkedin sample-sports | head -1)" = "Custom words for LinkedIn." ] && python3 "$here/scripts/build_insights.py" --posts "$here/tests/fixtures/posts" --linkedin sample-sports | grep -q "https://spataccoanalytics.com/insights/sample-sports/"'
check "LinkedIn words: built from the post otherwise, statistics with their source" 'python3 "$here/scripts/build_insights.py" --posts "$here/tests/fixtures/posts" --linkedin sample-practice | grep -q "12% of made-up things (Test Bureau, 2026)"'

mkdir -p "$t/bad" && printf '%s' '{"title":"x","date":"2026-01-08","category":"practice","summary":"s","blocks":[{"type":"stat","value":"9%","label":"l"}]}' > "$t/bad/2026-01-08-no-source.json"
check "a number without a source does not build" '! python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/b" --posts "$t/bad" >/dev/null 2>&1'
printf '%s' '{"title":"x","date":"2026-01-08","category":"practice","summary":"s","blocks":[{"type":"link","text":"t","url":"javascript:alert(1)"}]}' > "$t/bad/2026-01-08-no-source.json"
check "a link that is not a web address does not build" '! python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/b" --posts "$t/bad" >/dev/null 2>&1'

# a post's own picture is its share image, and it has to be there
check "a post with no card shares the site's picture" 'grep -q "og:image\" content=\"https://spataccoanalytics.com/img/social-card.png" "$i/sample-practice/index.html"'
mkdir -p "$t/site" "$t/cardposts" && cp -r "$here/site/." "$t/site/" && mkdir -p "$t/site/img/insights" && cp "$here/site/img/logo-square.png" "$t/site/img/insights/with-card.png"
printf '%s' '{"title":"With a card","date":"2026-01-09","category":"practice","summary":"s","card":"/img/insights/with-card.png","blocks":[{"type":"p","text":"x"}]}' > "$t/cardposts/2026-01-09-with-card.json"
python3 "$here/scripts/build_site.py" --site "$t/site" --out "$t/c" --posts "$t/cardposts" >/dev/null
check "a post's card is its share image" 'grep -q "og:image\" content=\"https://spataccoanalytics.com/img/insights/with-card.png" "$t/c/insights/with-card/index.html"'
rm "$t/site/img/insights/with-card.png"
check "a card that is not there does not build" '! python3 "$here/scripts/build_site.py" --site "$t/site" --out "$t/c2" --posts "$t/cardposts" >/dev/null 2>&1'
printf '%s' '{"title":"x","date":"2026-01-09","category":"practice","summary":"s","card":"https://elsewhere.example/x.png","blocks":[{"type":"p","text":"x"}]}' > "$t/cardposts/2026-01-09-with-card.json"
check "a card from somewhere else does not build" '! python3 "$here/scripts/build_site.py" --site "$t/site" --out "$t/c3" --posts "$t/cardposts" >/dev/null 2>&1'

echo "$((n - fails))/$n insights checks passed"
[ "$fails" = 0 ]
