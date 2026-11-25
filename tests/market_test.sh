#!/usr/bin/env bash
# The market strip (site/lib/market.php, site/market/feed.php, site/js/ticker.js):
# every figure comes from its publisher's own feed with the words for its
# source card, a source is asked only when its answer has run out, a figure
# that is too old or not a number is left off, the energy key goes to the
# Energy Information Administration and nowhere else, and nothing is kept
# inside the web root. The sources' answers are saved ones
# (tests/fixtures/market/), so nothing here leaves the machine.
#   bash tests/market_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

web="$t/home/public_html"
fx="$t/fx"
src="$here/tests/fixtures/market"
mkdir -p "$web/market" "$web/lib" "$fx"
cp "$here/site/market/feed.php" "$web/market/feed.php"
cp "$here/site/lib/market.php" "$web/lib/market.php"

NOW=1795616700                      # November 25, 2026, 9:25 AM Eastern
KEY='abcdefghijklmnopqrstuvwxyz0123456789ABCD'
all_sources() { cp "$src/treasury.xml" "$src/ecb.xml" "$src/coingecko.json" "$src/eia_spot.json" "$src/eia_gas.json" "$fx/"; rm -f "$fx/treasury-prev.xml"; }
with_key() { printf '{"eia_key":"%s"}' "$KEY" > "$t/home/sa-market.json"; }
forget() { rm -rf "$t/home/sa-market" "$fx/requests.log"; }

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1 (body=${BODY:0:200})"; fi; }
# feed TIME -> BODY, as the page would get it
feed() { BODY=$(SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW="$1" php -r '$_SERVER["DOCUMENT_ROOT"]=$argv[1]; $_SERVER["REQUEST_METHOD"]="GET"; include $argv[1]."/market/feed.php";' "$web" 2>&1); }
# every: all the figures. ids: the ones that come from a live source (not the quarterly deal count)
every() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo is_array($d)?implode(",",array_column($d["items"]??[],"id")):"NOT JSON";'; }
ids() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo is_array($d)?implode(",",array_diff(array_column($d["items"]??[],"id"),["ria"])):"NOT JSON";'; }
# of ID FIELD  (FIELD may be card.title and so on)
of() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["items"]??[]) as $i){ if($i["id"]===$argv[1]){ $v=$i; foreach(explode(".",$argv[2]) as $k){ $v=is_array($v)&&array_key_exists($k,$v)?$v[$k]:null; } echo is_scalar($v)?$v:json_encode($v); } }' "$1" "$2"; }
# the publishers the feed names for the strip's own card, as A|B|C
srcs() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $o=[]; foreach(($d["sources"]??[]) as $s){ $o[]=$s["name"].(strncmp($s["url"]??"","https://",8)===0?"":" NOT HTTPS"); } echo implode("|",$o);'; }
ok() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo is_array($d)&&array_key_exists("ok",$d)?json_encode($d["ok"]):"NOT JSON";'; }
asked() { awk -v p="$1" 'index($0,p){c++} END{print c+0}' "$fx/requests.log" 2>/dev/null || echo 0; }
BODY=

# --- every source answers
all_sources; with_key; forget
feed $NOW
check "eight figures, in the order they scroll" '[ "$(ok)" = true ] && [ "$(every)" = "ria,ust30,ust10,eurusd,btc,brent,wti,gas" ]'
check "the RIA deal count, against the record" '[ "$(of ria label)" = "RIA Deals 2026" ] && [ "$(of ria value)" = 244 ] && [ "$(of ria delta)" = "record 322" ] && [ "$(of ria by)" = DeVoe ] && [ "$(of ria when)" = "thru Sep" ]'
check "its card says what is counted, the record and how far off it is" '[ "$(of ria card.title)" = "RIA deals announced in 2026: 244 through September" ] && [[ "$(of ria card.text)" == *"January through September 2026"*"322, set in 2025"*"Another 78 "* ]]'
check "and names the Deal Book, with a link to it" '[[ "$(of ria card.source)" == "DeVoe & Company RIA Deal Book"* ]] && [[ "$(of ria card.url)" == https://www.devoeandcompany.com/* ]]'
check "the 30-year yield, and its move in basis points" '[ "$(of ust30 value)" = "5.30%" ] && [ "$(of ust30 delta)" = "+1 bp" ] && [ "$(of ust30 dir)" = up ]'
check "the 10-year yield" '[ "$(of ust10 value)" = "4.91%" ] && [ "$(of ust10 delta)" = "-1 bp" ] && [ "$(of ust10 dir)" = dn ]'
check "the euro in dollars, to four places" '[ "$(of eurusd value)" = "1.0963" ] && [ "$(of eurusd delta)" = "+0.22%" ]'
check "bitcoin, with the change its source gives" '[ "$(of btc value)" = "\$58,349" ] && [ "$(of btc delta)" = "-3.31%" ] && [ "$(of btc dir)" = dn ]'
check "Brent and WTI" '[ "$(of brent value)" = "\$92.94" ] && [ "$(of wti value)" = "\$89.53" ] && [ "$(of wti delta)" = "+0.32%" ]'
check "regular gasoline, to the tenth of a cent" '[ "$(of gas value)" = "\$3.642" ] && [ "$(of gas delta)" = "-4.28%" ]'
check "each figure says who published it and for when" '[ "$(of ust10 by)" = Treasury ] && [ "$(of ust10 when)" = "Nov 24" ] && [ "$(of eurusd by)" = ECB ] && [ "$(of brent by)" = EIA ] && [ "$(of brent when)" = "Nov 17" ] && [ "$(of btc by)" = CoinGecko ] && [ "$(of btc when)" = "9:24 AM ET" ]'
check "a source card names the figure and its day" '[ "$(of ust10 card.title)" = "U.S. 10-year Treasury yield: 4.91%" ] && [[ "$(of ust10 card.text)" == *"November 24, 2026"*"4.92% on November 23, 2026"* ]]'
check "and its publisher, with a link to them" '[[ "$(of ust10 card.source)" == "U.S. Department of the Treasury"* ]] && [[ "$(of ust10 card.url)" == https://home.treasury.gov/* ]] && [[ "$(of eurusd card.url)" == https://www.ecb.europa.eu/* ]] && [[ "$(of gas card.url)" == https://www.eia.gov/* ]]'
check "CoinGecko is credited the way it asks" '[ "$(of btc card.source)" = CoinGecko ] && [[ "$(of btc card.text)" == *"Data provided by CoinGecko." ]] && [[ "$(of btc card.url)" == https://www.coingecko.com/* ]]'
check "each publisher is named once, with a link, for the strip's own card" '[ "$(srcs)" = "DeVoe & Company|U.S. Department of the Treasury|European Central Bank|CoinGecko|U.S. Energy Information Administration" ]'
check "the oil card says the prices come out weekly" '[[ "$(of brent card.text)" == *"released once a week"* ]]'
check "the gas card says which week" '[[ "$(of gas card.text)" == *"week of November 23, 2026"*"\$3.805"* ]]'
check "no markup and no long dash in what the page is given" '[[ "$BODY" != *"<"* ]] && [[ "$BODY" != *$'"'"'\xe2\x80\x94'"'"'* ]]'
check "the answers are kept beside the web root, not in it" '[ -s "$t/home/sa-market/cache.json" ] && [ -z "$(find "$web" -type f ! -name feed.php ! -name market.php)" ]'
check "and only this account can read them" '[ "$(stat -c %a "$t/home/sa-market")" = 700 ] && [ "$(stat -c %a "$t/home/sa-market/cache.json")" = 600 ]'

# --- the energy key
check "the key went to the Energy Information Administration" '[ "$(asked "https://api.eia.gov/v2/")" = 2 ] && [ "$(asked "api_key=$KEY")" = 2 ]'
check "and to nobody else" '[ "$(grep -v "^https://api.eia.gov/" "$fx/requests.log" | grep -c "$KEY")" = 0 ]'
check "it is not in what the page is given, or in what is kept" '[[ "$BODY" != *"$KEY"* ]] && ! grep -q "$KEY" "$t/home/sa-market/cache.json"'
check "the right series are asked for" '[ "$(asked "facets[series][]=RBRTE&facets[series][]=RWTC")" = 1 ] && [ "$(asked "facets[series][]=EMM_EPMR_PTE_NUS_DPG")" = 1 ]'
rm -f "$t/home/sa-market.json"; forget
feed $NOW
check "with no key the strip shows the other four" '[ "$(ids)" = "ust30,ust10,eurusd,btc" ] && [ "$(asked "eia.gov")" = 0 ]'
check "and names only the publishers of what it shows" '[ "$(srcs)" = "DeVoe & Company|U.S. Department of the Treasury|European Central Bank|CoinGecko" ]'
printf '{"eia_key":"short&x=1"}' > "$t/home/sa-market.json"; forget
feed $NOW
check "a key that is not a key is no key" '[ "$(ids)" = "ust30,ust10,eurusd,btc" ] && [ "$(asked "eia.gov")" = 0 ]'

# --- asking only when an answer has run out
all_sources; with_key; forget
feed $NOW
first=$(wc -l < "$fx/requests.log")
feed $((NOW + 60))
check "five requests fill the strip" '[ "$first" = 5 ]'
check "a minute later nothing is asked again" '[ "$(wc -l < "$fx/requests.log")" = 5 ] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
feed $((NOW + 400))
check "bitcoin is asked again after five minutes, the rest are not" '[ "$(wc -l < "$fx/requests.log")" = 6 ] && [ "$(asked coingecko)" = 2 ]'
feed $((NOW + 2000))
check "Treasury and the ECB after half an hour" '[ "$(asked home.treasury.gov)" = 2 ] && [ "$(asked ecb.europa.eu)" = 2 ] && [ "$(asked eia.gov)" = 2 ]'

# --- a source that stops answering
rm -f "$fx/coingecko.json"
feed $((NOW + 2400))
check "a silent source: the last answer is still shown" '[ "$(of btc value)" = "\$58,349" ] && [ "$(asked coingecko)" = 4 ]'
feed $((NOW + 2500))
check "and it is left alone for five minutes" '[ "$(asked coingecko)" = 4 ]'
feed $((NOW + 2800))
check "then tried again" '[ "$(asked coingecko)" = 5 ]'
feed $((NOW + 7 * 3600))
check "after six hours a bitcoin price is too old to show" '[ "$(ids)" = "ust30,ust10,eurusd,brent,wti,gas" ]'
all_sources
feed $((NOW + 12 * 86400))
check "a yield or a rate more than ten days old is left off" '[ "$(ids)" = "brent,wti,gas" ]'
feed $((NOW + 40 * 86400))
check "with nothing fresh from a live source, only the quarterly count is left" '[ "$(ids)" = "" ] && [ "$(every)" = ria ]'
feed $((NOW + 100 * 86400))
check "the deal count leaves by itself when it is not brought up to date" '[ "$(ok)" = false ] && [ "$(every)" = "" ]'
rm -f "$fx"/*.xml "$fx"/*.json; forget
feed $NOW
check "every source down and nothing held: no live figure, and no error" '[ "$(ids)" = "" ] && [ "$(every)" = ria ]'
status=$(SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW=$NOW php -r '$_SERVER["DOCUMENT_ROOT"]=$argv[1]; require $argv[1]."/lib/market.php"; echo json_encode(market_status());' "$web")
check "why each source failed is kept for Publish to print" '[[ "$status" == *"\"why\":\"no answer\""* ]] && [[ "$status" == *"\"key\":\"present\""* ]]'
check "with no key and no address in it" '[[ "$status" != *"$KEY"* ]] && [[ "$status" != *"http"* ]] && ! grep -q "$KEY" "$t/home/sa-market/cache.json"'

# --- one visitor at a time asks
if command -v flock >/dev/null; then
  all_sources; forget
  feed $NOW
  before=$(wc -l < "$fx/requests.log")
  ( exec 9>"$t/home/sa-market/lock"; flock -x 9; sleep 2 ) &
  holder=$!
  sleep 0.4
  feed $((NOW + 2000))
  check "while one visitor is asking, another is given what is held" '[ "$(wc -l < "$fx/requests.log")" = "$before" ] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
  wait "$holder"
  feed $((NOW + 2000))
  check "and the next one asks" '[ "$(wc -l < "$fx/requests.log")" -gt "$before" ]'
fi

# --- answers that are not what they should be
all_sources; forget
printf 'not xml at all' > "$fx/ecb.xml"; printf '{' > "$fx/eia_spot.json"
feed $NOW
check "a broken answer costs only its own figures" '[ "$(ok)" = true ] && [ "$(ids)" = "ust30,ust10,btc,gas" ]'
all_sources; forget
sed -i 's#\(<d:BC_10YEAR[^>]*>\)[0-9.]*#\1250.00#g' "$fx/treasury.xml"
feed $NOW
check "a yield of 250 percent is not a yield" '[ "$(ids)" = "ust30,eurusd,btc,brent,wti,gas" ]'
all_sources; forget
printf '{"bitcoin":{"usd":"<script>alert(1)</script>","usd_24h_change":1,"last_updated_at":1795616670}}' > "$fx/coingecko.json"
sed -i 's#"series-description":"[^"]*"#"series-description":"<img src=x onerror=alert(1)>"#g; s#"units":"[^"]*"#"units":"<b>x</b>"#g' "$fx/eia_spot.json"
feed $NOW
check "markup in an answer never reaches the page" '[ "$(ids)" = "ust30,ust10,eurusd,brent,wti,gas" ] && [[ "$BODY" != *"<"* ]] && [[ "$BODY" != *"onerror"* ]]'
all_sources; forget
printf '{"bitcoin":{"usd":58349,"usd_24h_change":"-3.3; DROP","last_updated_at":1795616670}}' > "$fx/coingecko.json"
feed $NOW
check "a change that is not a number is left off, the price stays" '[ "$(of btc value)" = "\$58,349" ] && [ "$(of btc delta)" = "" ]'

# --- the first business day of a month
all_sources; forget
cp "$src/treasury-december.xml" "$fx/treasury.xml"; cp "$src/treasury.xml" "$fx/treasury-prev.xml"
feed $((NOW + 7 * 86400))                      # December 2
check "the day before comes from last month's feed" '[ "$(of ust10 value)" = "4.95%" ] && [ "$(of ust10 delta)" = "+4 bp" ] && [ "$(of ust10 when)" = "Dec 1" ] && [ "$(asked value_month=202612)" = 1 ] && [ "$(asked value_month=202611)" = 1 ]'
check "and the card names both days" '[[ "$(of ust10 card.text)" == *"December 1, 2026"*"4.91% on November 24, 2026"* ]]'

# --- over the web
all_sources; with_key; forget
SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW=$NOW php -S 127.0.0.1:18746 -t "$web" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18746/market/feed.php
for i in $(seq 1 50); do curl -s -o /dev/null "$base" && break; sleep 0.1; done
H=$(curl -s -D - -o "$t/body" "$base"); BODY=$(cat "$t/body")
check "the feed answers as JSON" '[[ "$H" == *"200 OK"* ]] && [[ "${H,,}" == *"content-type: application/json"* ]] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
check "may be kept for a minute, and is not for search engines" '[[ "${H,,}" == *"cache-control: public, max-age=60"* ]] && [[ "${H,,}" == *"x-robots-tag: noindex"* ]] && [[ "${H,,}" == *"x-content-type-options: nosniff"* ]]'
check "it sets no cookie" '[[ "${H,,}" != *"set-cookie"* ]]'
again=$(curl -s "$base?x=%3Cscript%3E&id=btc" -H 'Cookie: a=b')
check "nothing a visitor sends changes the answer" '[ "$again" = "$BODY" ]'
code=$(curl -s -o "$t/post" -w '%{http_code}' -X POST --data 'a=1' "$base")
check "it is read, never written to" '[ "$code" = 405 ]'
code=$(curl -s -o "$t/lib" -w '%{http_code}' "http://127.0.0.1:18746/lib/market.php")
check "the library opened directly says nothing" '[ "$code" = 200 ] && [ ! -s "$t/lib" ]'

# --- the page
home="$here/site/index.html"; js="$here/site/js/ticker.js"
check "the headline is two lines: the statement, then the ask" 'grep -q "<h1><span class=\"h1-main\">Buyers will look at your data.</span> <em>Make sure it is ready.</em></h1>" "$home" && grep -q "\.hero h1 \.h1-main,\.hero h1 em{display:block}" "$home"'
check "pages are served fresh, never from the host's page cache" 'grep -A3 "<FilesMatch \"\\\\.html\$\">" "$here/site/.htaccess" | grep -q "Header set Cache-Control \"private, no-cache\""'
check "the strip is on the homepage, hidden until it has figures" 'grep -q "<section class=\"hero\"><aside class=\"sa-tk\" id=\"sa-ticker\" aria-label=\"Market figures\" hidden></aside>" "$home"'
# The host keeps scripts and styles for a year, so each tag carries the first
# eight characters of its file's SHA-1: change the file and the tag must follow.
vcss=$(sha1sum "$here/site/css/ticker.css" | cut -c1-8); vjs=$(sha1sum "$js" | cut -c1-8)
check "with its stylesheet, tagged with its version (now ?v=$vcss)" 'grep -q "<link rel=\"stylesheet\" href=\"/css/ticker.css?v=$vcss\">" "$home"'
check "and its script, tagged with its version (now ?v=$vjs)" 'grep -q "<script src=\"/js/ticker.js?v=$vjs\" defer></script>" "$home"'
check "the homepage is the only page with it" '[ "$(grep -rl "sa-ticker" "$here/site" --include=*.html | wc -l)" = 1 ]'
check "the script writes text, never markup" '! grep -nE "innerHTML|outerHTML|insertAdjacentHTML|document\.write" "$js"'
check "and asks only the site's own feed" '[ "$(grep -c "fetch(" "$js")" = 1 ] && grep -q "var FEED = ./market/feed.php.;" "$js" && ! grep -qE "https?://" "$js"'
check "it says what the figures are, and that the tool runs on free public data" 'grep -q "These quotes are latest published figures and not necessarily live quotes\." "$js" && grep -q "This tool runs entirely on free public data\. Yours could too\." "$js"'
check "the hover makes no pitch and links only to sources" '! grep -qiE "working for you|/contact|mailto:" "$js"'
check "it has a pause button and respects reduced motion" 'grep -q "sa-tk-pause" "$js" && grep -q "prefers-reduced-motion" "$js" && grep -q "prefers-reduced-motion" "$here/site/css/ticker.css"'
check "no long dash in any of it" '! grep -l $'"'"'\xe2\x80\x94'"'"' "$js" "$here/site/css/ticker.css" "$here/site/lib/market.php" "$here/site/market/feed.php"'
check "no licensed index or metal is named as a figure" '! grep -qiE "s&p|dow jones|gold" "$js" && ! grep -qE "\x27(spx|dow|gold)\x27 =>" "$here/site/lib/market.php"'
if python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/dist" >/dev/null 2>&1; then
  check "the built site carries the feed, its library, the script and the styles" '[ -s "$t/dist/market/feed.php" ] && [ -s "$t/dist/lib/market.php" ] && [ -s "$t/dist/js/ticker.js" ] && [ -s "$t/dist/css/ticker.css" ]'
else
  check "the site builds" 'false'
fi

# --- in a browser, where there is one
if node -e "require('playwright')" 2>/dev/null && [ -d "$t/dist" ]; then
  kill "$pid" 2>/dev/null; pid=
  rm -rf "$web"; cp -r "$t/dist" "$web"; all_sources; with_key; forget
  SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW=$NOW php -S 127.0.0.1:18746 -t "$web" >/dev/null 2>&1 & pid=$!
  for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:18746/" && break; sleep 0.1; done
  out=$(node "$here/tests/ticker_browser.cjs" http://127.0.0.1:18746/ 2>&1); code=$?
  BODY=$out
  check "the strip works in a browser: $(printf '%s' "$out" | tail -1)" '[ $code -eq 0 ]'
  [ $code -eq 0 ] || printf '%s\n' "$out"
else
  echo "no browser here: the strip itself was not opened"
fi

if [ "$fails" -eq 0 ]; then echo "ok: $n checks"; else echo "$fails of $n checks failed"; exit 1; fi
