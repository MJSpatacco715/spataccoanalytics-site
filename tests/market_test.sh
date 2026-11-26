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
all_sources() { cp "$src/treasury.xml" "$src/ecb.xml" "$src/coingecko.json" "$src/coingecko_days.json" "$src/eia_spot.json" "$src/eia_gas.json" "$fx/"; cp "$src/treasury-october.xml" "$fx/treasury-prev.xml"; }
with_key() { printf '{"eia_key":"%s"}' "$KEY" > "$t/home/sa-market.json"; }
forget() { rm -rf "$t/home/sa-market" "$fx/requests.log"; }

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1 (body=${BODY:0:200})"; fi; }
# feed1 TIME -> BODY, as one visit gets it. The slow sources are asked after
# the answer has gone out, so what they say shows on the next visit.
feed1() { BODY=$(SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW="$1" php -r '$_SERVER["DOCUMENT_ROOT"]=$argv[1]; $_SERVER["REQUEST_METHOD"]="GET"; include $argv[1]."/market/feed.php";' "$web" 2>&1); }
# feed TIME -> BODY once everything due at that time has been asked (two visits)
feed() { feed1 "$1"; feed1 "$1"; }
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

# --- nobody waits for a slow source
all_sources; with_key; forget
feed1 $NOW
check "the first visitor is answered without waiting for the energy source" '[ "$(ok)" = true ] && [ "$(every)" = "ria,ust30,ust10,eurusd,btc" ]'
check "which was asked once he had his answer" '[ "$(asked "https://api.eia.gov/v2/")" = 2 ] && [ "$(wc -l < "$fx/requests.log")" = 7 ]'
feed1 $NOW
check "so the next visitor gets its figures, and nothing is asked twice" '[ "$(every)" = "ria,ust30,ust10,eurusd,btc,brent,wti,gas" ] && [ "$(wc -l < "$fx/requests.log")" = 7 ]'

# --- every source answers
all_sources; with_key; forget
feed $NOW
check "eight figures, in the order they scroll" '[ "$(ok)" = true ] && [ "$(every)" = "ria,ust30,ust10,eurusd,btc,brent,wti,gas" ]'
check "the RIA deal count, against the record" '[ "$(of ria label)" = "RIA Deals 2026" ] && [ "$(of ria value)" = 244 ] && [ "$(of ria delta)" = "78 to tie record" ] && [ "$(of ria by)" = DeVoe ] && [ "$(of ria when)" = "Q1-Q3" ]'
check "its card says what is counted, the record and how far off it is" '[ "$(of ria card.title)" = "RIA deals announced in 2026: 244 through September" ] && [[ "$(of ria card.text)" == *"January through September 2026"*"322, set in 2025"*"Another 78 "*"the next count is the full year, early in 2027."* ]]'
check "the card is drawn too: the count, large, and what it covers" '[ "$(of ria card.eyebrow)" = "RIA deals announced in 2026" ] && [ "$(of ria card.hero.value)" = 244 ] && [ "$(of ria card.hero.label)" = "January through September" ]'
check "a bar toward the record" '[ "$(of ria card.meter.pct)" = 76 ] && [ "$(of ria card.meter.left)" = "76% of the record" ] && [ "$(of ria card.meter.right)" = "322 in 2025" ]'
check "the year beside the record year, quarter by quarter, and what the last quarter needs" '[ "$(of ria card.chart.rows)" = "[{\"q\":\"Q1\",\"then\":75,\"now\":93},{\"q\":\"Q2\",\"then\":73,\"now\":74},{\"q\":\"Q3\",\"then\":93,\"now\":77},{\"q\":\"Q4\",\"then\":81,\"need\":78}]" ] && [ "$(of ria card.chart.now)" = 2026 ] && [ "$(of ria card.chart.then)" = 2025 ] && [ "$(of ria card.chart.need)" = "needed to tie" ]'
check "the chart says in words what it shows, for a reader who cannot see it" '[[ "$(of ria card.chart.label)" == "Deals by quarter. 2026: Q1 93, Q2 74, Q3 77. 2025: Q1 75, Q2 73, Q3 93, Q4 81. 78 in the fourth quarter of 2026 would tie the record." ]]'
check "and what a repeat of last year would do" '[ "$(of ria card.chart.note)" = "A fourth quarter like 2025'"'"'s (81) would end 2026 at 325, a new record." ]'
check "two more facts from the Deal Book, and when the next count is due" '[[ "$(of ria card.facts)" == *"Q3 fell 17% from a year earlier"*"Consolidators made 129 of the 244 deals (53%)"* ]] && [ "$(of ria card.next)" = "Next count: the full year, early in 2027." ]'
quarters=$(php -r 'require $argv[1]; $d=MARKET_DEALS; echo (array_sum($d["quarters"])===$d["count"] && array_sum($d["record_quarters"])===$d["record"] && count($d["record_quarters"])===4) ? "ok" : "no";' "$web/lib/market.php")
check "the quarters typed in add up to the counts" '[ "$quarters" = ok ]'
check "and names the Deal Book, with a link to it" '[[ "$(of ria card.source)" == "DeVoe & Company RIA Deal Book"* ]] && [[ "$(of ria card.url)" == https://www.devoeandcompany.com/* ]]'
check "the 30-year yield, and its move in basis points" '[ "$(of ust30 value)" = "5.30%" ] && [ "$(of ust30 delta)" = "+1 bp" ] && [ "$(of ust30 dir)" = up ]'
check "the 10-year yield" '[ "$(of ust10 value)" = "4.91%" ] && [ "$(of ust10 delta)" = "-1 bp" ] && [ "$(of ust10 dir)" = dn ]'
check "the dollar in euros, to four places, said as what a dollar buys" '[ "$(of eurusd label)" = "USD/EUR" ] && [ "$(of eurusd value)" = "\$1 = €0.9122" ] && [ "$(of eurusd delta)" = "-0.22%" ] && [ "$(of eurusd dir)" = dn ]'
check "its card gives the rate both ways round and says which is worth more" '[ "$(of eurusd card.pair.0)" = "\$1 = €0.9122" ] && [ "$(of eurusd card.pair.1)" = "€1 = \$1.0963" ] && [ "$(of eurusd card.verdict)" = "The euro is worth more: one euro buys \$1.10." ] && [ "$(of eurusd card.hero.value)" = "€0.9122" ]'
check "and that it is worked out from the ECB's euro rate" '[[ "$(of eurusd card.text)" == "One U.S. dollar bought €0.9122 on November 24, 2026, and one euro bought \$1.0963."*"It was €0.9142 on November 23, 2026"*"Worked out from the European Central Bank"* ]] && [ "$(of eurusd card.about)" = "Worked out from the European Central Bank'"'"'s euro reference rate, set once each business day." ]'
check "bitcoin, with the change its source gives" '[ "$(of btc value)" = "\$58,349" ] && [ "$(of btc delta)" = "-3.31%" ] && [ "$(of btc dir)" = dn ]'
check "Brent and WTI" '[ "$(of brent value)" = "\$92.94" ] && [ "$(of wti value)" = "\$89.53" ] && [ "$(of wti delta)" = "+0.32%" ]'
check "regular gasoline, to the tenth of a cent" '[ "$(of gas value)" = "\$3.642" ] && [ "$(of gas delta)" = "-4.28%" ]'
check "each figure says who published it and for when" '[ "$(of ust10 by)" = Treasury ] && [ "$(of ust10 when)" = "Nov 24" ] && [ "$(of eurusd by)" = ECB ] && [ "$(of brent by)" = EIA ] && [ "$(of brent when)" = "Nov 17" ] && [ "$(of btc by)" = CoinGecko ] && [ "$(of btc when)" = "9:24 AM ET" ]'
check "a source card names the figure and its day" '[ "$(of ust10 card.title)" = "U.S. 10-year Treasury yield: 4.91%" ] && [[ "$(of ust10 card.text)" == *"November 24, 2026"*"4.92% on November 23, 2026"* ]]'
check "and its publisher, with a link to them" '[[ "$(of ust10 card.source)" == "U.S. Department of the Treasury"* ]] && [[ "$(of ust10 card.url)" == https://home.treasury.gov/* ]] && [[ "$(of eurusd card.url)" == https://www.ecb.europa.eu/* ]] && [[ "$(of gas card.url)" == https://www.eia.gov/* ]]'
check "CoinGecko is credited the way it asks" '[ "$(of btc card.source)" = CoinGecko ] && [[ "$(of btc card.text)" == *"Data provided by CoinGecko." ]] && [[ "$(of btc card.url)" == https://www.coingecko.com/* ]]'
check "each publisher is named once, with a link, for the strip's own card" '[ "$(srcs)" = "DeVoe & Company|U.S. Department of the Treasury|European Central Bank|CoinGecko|U.S. Energy Information Administration" ]'
check "the oil card says the prices come out weekly, and on which day" '[[ "$(of brent card.text)" == *"released once a week, usually on Wednesday."* ]] && [[ "$(of wti card.text)" == *"released once a week, usually on Wednesday."* ]]'
check "the gas card says which week" '[[ "$(of gas card.text)" == *"week of November 23, 2026"*"\$3.805"* ]]'

# --- every figure is drawn on its card: the value, its history, low, high and change
pts() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["items"]??[]) as $i){ if($i["id"]===$argv[1]){ $p=$i["card"]["line"]["points"]??[]; echo count($p), " ", json_encode($p[0]??null), " ", json_encode(end($p)); } }' "$1"; }
check "a yield leads its card with the value, its change and the day before" '[ "$(of ust10 card.eyebrow)" = "U.S. 10-year Treasury yield" ] && [ "$(of ust10 card.hero)" = "{\"value\":\"4.91%\",\"label\":\"November 24, 2026\",\"delta\":\"-1 bp\",\"dir\":\"dn\",\"vs\":\"from Nov 23\"}" ]'
check "and draws every business day held: this month and last" '[ "$(pts ust10)" = "37 [\"2026-10-01\",5.24] [\"2026-11-24\",4.91]" ] && [ "$(of ust10 card.line.title)" = "Day by day, since Oct 1" ] && [ "$(of ust10 card.line.unit)" = pct ]'
check "with the low, the high and the change over that stretch" '[ "$(of ust10 card.tiles)" = "[{\"label\":\"Low\",\"value\":\"4.84%\",\"note\":\"Nov 5\"},{\"label\":\"High\",\"value\":\"5.31%\",\"note\":\"Oct 5\"},{\"label\":\"Change\",\"value\":\"-33 bp\",\"note\":\"since Oct 1\",\"dir\":\"dn\"}]" ]'
check "the chart says in words what it shows" '[ "$(of ust10 card.line.label)" = "U.S. 10-year Treasury yield, 37 days from October 1, 2026 to November 24, 2026. Low 4.84% on Nov 5, high 5.31% on Oct 5, latest 4.91%." ]'
check "one plain line says what the figure is" '[ "$(of ust10 card.about)" = "Daily par yield curve rate, set each business day." ] && [[ "$(of btc card.about)" == *"Data provided by CoinGecko." ]] && [[ "$(of brent card.about)" == *"released once a week, usually on Wednesday." ]]'
check "the dollar in euros: the last 45 business days of the ninety the ECB sends, each turned round" '[ "$(pts eurusd)" = "45 [\"2026-09-23\",0.8763] [\"2026-11-24\",0.9122]" ] && [ "$(of eurusd card.line.unit)" = eur4 ] && [ "$(of eurusd card.tiles.1.value)" = "€0.9142" ]'
check "bitcoin: a point a day, and the price now as the last" '[ "$(pts btc)" = "60 [\"2026-09-27\",84417] [\"2026-11-25\",58349]" ] && [ "$(of btc card.hero.vs)" = "in 24 hours" ] && [ "$(of btc card.tiles.1.value)" = "\$86,490" ]'
check "oil: forty-five trading days, asked for in the same request" '[ "$(pts brent | cut -d" " -f1)" = 45 ] && [ "$(pts wti | cut -d" " -f3)" = "[\"2026-11-17\",89.53]" ] && [ "$(asked "length=100")" = 1 ]'
check "gasoline: week by week for half a year" '[ "$(pts gas | cut -d" " -f1)" = 26 ] && [ "$(of gas card.line.title)" = "Week by week, since Jun 1" ] && [[ "$(of gas card.line.label)" == "U.S. regular gasoline, 26 weeks from June 1, 2026 to November 23, 2026."* ]] && [ "$(asked "length=30")" = 1 ]'
check "the history is kept beside the figures, and no key is in it" 'grep -q "\"days\":{\"2026-10-01\"" "$t/home/sa-market/cache.json" && ! grep -q "$KEY" "$t/home/sa-market/cache.json"'
check "no markup and no long dash in what the page is given" '[[ "$BODY" != *"<"* ]] && [[ "$BODY" != *$'"'"'\xe2\x80\x94'"'"'* ]]'
check "the answers are kept beside the web root, not in it" '[ -s "$t/home/sa-market/cache.json" ] && [ -z "$(find "$web" -type f ! -name feed.php ! -name market.php)" ]'
check "and only this account can read them" '[ "$(stat -c %a "$t/home/sa-market")" = 700 ] && [ "$(stat -c %a "$t/home/sa-market/cache.json")" = 600 ]'

# --- the energy key
check "the key went to the Energy Information Administration" '[ "$(asked "https://api.eia.gov/v2/")" = 2 ] && [ "$(asked "api_key=$KEY")" = 2 ]'
check "and to nobody else" '[ "$(grep -v "^https://api.eia.gov/" "$fx/requests.log" | grep -c "$KEY")" = 0 ]'
check "it is not in what the page is given, or in what is kept" '[[ "$BODY" != *"$KEY"* ]] && ! grep -q "$KEY" "$t/home/sa-market/cache.json"'
check "each energy question is bounded to recent months, as the source asks" '[ "$(asked "RWTC&start=2026-08-01&sort")" = 1 ] && [ "$(asked "EMM_EPMR_PTE_NUS_DPG&start=2026-03-01&sort")" = 1 ]'
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
check "seven requests fill the strip and its charts" '[ "$first" = 7 ]'
check "two of them for history: last month of yields, and bitcoin day by day" '[ "$(asked value_month=202610)" = 1 ] && [ "$(asked market_chart)" = 1 ]'
check "a minute later nothing is asked again" '[ "$(wc -l < "$fx/requests.log")" = 7 ] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
feed $((NOW + 400))
check "bitcoin is asked again after five minutes, the rest are not" '[ "$(wc -l < "$fx/requests.log")" = 8 ] && [ "$(asked simple/price)" = 2 ]'
feed $((NOW + 2000))
check "Treasury and the ECB after half an hour" '[ "$(asked value_month=202611)" = 2 ] && [ "$(asked ecb.europa.eu)" = 2 ] && [ "$(asked eia.gov)" = 2 ]'
check "with enough days held, last month of yields is not asked for again, and bitcoin's days keep for hours" '[ "$(asked value_month=202610)" = 1 ] && [ "$(asked market_chart)" = 1 ]'

# --- a source that stops answering
rm -f "$fx/coingecko.json"
feed $((NOW + 2400))
check "a silent source: the last answer is still shown" '[ "$(of btc value)" = "\$58,349" ] && [ "$(asked simple/price)" = 4 ]'
feed $((NOW + 2500))
check "and it is left alone for five minutes" '[ "$(asked simple/price)" = 4 ]'
feed $((NOW + 2800))
check "then tried again" '[ "$(asked simple/price)" = 5 ]'
check "the energy source has been left alone for the hour" '[ "$(asked eia.gov)" = 2 ]'
feed $((NOW + 3700))
check "and is asked again after it, so its weekly release shows the afternoon it is out" '[ "$(asked eia.gov)" = 4 ]'
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
  # a slow source that is taking its time does not hold up the quick ones
  all_sources; forget
  feed $NOW
  before=$(asked coingecko)
  ( exec 9>"$t/home/sa-market/lock-slow"; flock -x 9; sleep 2 ) &
  holder=$!
  sleep 0.4
  feed1 $((NOW + 400))
  check "while the energy source is still being asked, bitcoin is brought up to date" '[ "$(asked coingecko)" -gt "$before" ] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
  wait "$holder"
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
check "and the chart runs across the two months" '[ "$(pts ust10)" = "17 [\"2026-11-02\",4.91] [\"2026-12-01\",4.95]" ] && [ "$(of ust10 card.line.title)" = "Day by day, since Nov 2" ]'

# --- the energy source, when its first answer does not come
all_sources; with_key; forget
rm -f "$fx/eia_gas.json"
feed $NOW
check "a slow source that gives no answer costs only its own figure" '[ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti" ] && [ "$(asked EMM_EPMR_PTE_NUS_DPG)" = 1 ]'
feed $((NOW + 100))
check "it is left alone for three minutes" '[ "$(asked EMM_EPMR_PTE_NUS_DPG)" = 1 ]'
cp "$src/eia_gas.json" "$fx/"
feed $((NOW + 200))
check "then asked again, and its figure and chart arrive" '[ "$(asked EMM_EPMR_PTE_NUS_DPG)" = 2 ] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ] && [ "$(pts gas | cut -d" " -f1)" = 26 ]'

# --- which is worth more follows the rate
all_sources; forget
sed -i 's#currency="USD" rate="[0-9.]*"#currency="USD" rate="0.9500"#g' "$fx/ecb.xml"
feed $NOW
check "when a euro buys less than a dollar, the card says the dollar is worth more" '[ "$(of eurusd value)" = "\$1 = €1.0526" ] && [ "$(of eurusd card.verdict)" = "The dollar is worth more: one dollar buys €1.05." ] && [ "$(of eurusd card.pair.1)" = "€1 = \$0.9500" ]'
all_sources; forget
sed -i 's#currency="USD" rate="[0-9.]*"#currency="USD" rate="1.0000"#g' "$fx/ecb.xml"
feed $NOW
check "and at one for one, that they are worth the same" '[ "$(of eurusd card.verdict)" = "The dollar and the euro are worth the same." ] && [ "$(of eurusd delta)" = unch ]'

# --- history is added to, never replaced, and too little of it draws nothing
all_sources; forget
feed $NOW
php -r '$d=json_decode(file_get_contents($argv[1]),true); $d["response"]["data"]=array_slice($d["response"]["data"],0,3); file_put_contents($argv[1],json_encode($d));' "$fx/eia_gas.json"
feed $((NOW + 3700))
check "a later answer with only three weeks in it leaves the chart its twenty-six" '[ "$(asked EMM_EPMR_PTE_NUS_DPG)" = 2 ] && [ "$(pts gas | cut -d" " -f1)" = 26 ]'
forget
feed $NOW
check "three weeks and nothing held: the value and its change, and no chart" '[ "$(of gas card.hero.value)" = "\$3.642" ] && [ "$(of gas card.line)" = null ] && [ "$(of gas card.tiles)" = null ] && [ "$(of gas value)" = "\$3.642" ]'
all_sources; forget
php -r '$d=json_decode(file_get_contents($argv[1]),true); $d["prices"][10][1]="<script>alert(1)</script>"; $d["prices"][11][1]=-5; $d["prices"][12][0]="soon"; file_put_contents($argv[1],json_encode($d));' "$fx/coingecko_days.json"
feed $NOW
check "a day that is not a price is left out of the chart, the rest stay" '[ "$(pts btc | cut -d" " -f1)" = 57 ] && [[ "$BODY" != *"<"* ]]'
rm -f "$fx/coingecko_days.json"; forget
feed $NOW
check "with no history at all bitcoin still shows, without a chart" '[ "$(of btc value)" = "\$58,349" ] && [ "$(of btc card.line)" = null ]'

# --- over the web
all_sources; with_key; forget
SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW=$NOW php -S 127.0.0.1:18746 -t "$web" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18746/market/feed.php
for i in $(seq 1 50); do curl -s -o /dev/null "$base" && break; sleep 0.1; done
curl -s -o /dev/null "$base"                    # by now the slow sources have been asked
H=$(curl -s -D - -o "$t/body" "$base"); BODY=$(cat "$t/body")
check "the feed answers as JSON" '[[ "$H" == *"200 OK"* ]] && [[ "${H,,}" == *"content-type: application/json"* ]] && [ "$(ids)" = "ust30,ust10,eurusd,btc,brent,wti,gas" ]'
check "may be kept for a minute, and is not for search engines" '[[ "${H,,}" == *"cache-control: public, max-age=60"* ]] && [[ "${H,,}" == *"x-robots-tag: noindex"* ]] && [[ "${H,,}" == *"x-content-type-options: nosniff"* ]]'
check "it sets no cookie" '[[ "${H,,}" != *"set-cookie"* ]]'
check "it says how long the answer is, so a visitor is let go before the slow asking starts" '[[ "${H,,}" == *"content-length: $(wc -c < "$t/body" | tr -d " ")"* ]]'
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
tools="$here/site/tools/index.html"
check "the strip is on the tools page, after the opening copy and before the first group of tools, hidden until it has figures" 'python3 - "$tools" <<'"'"'PY'"'"'
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
# the copy leads: nothing of the strip between the menu and the opening section
lead = re.search(r"</nav>(.*?)<section class=\"page-hero[^\"]*\">", s, re.S)
if not lead or re.search(r"sa-tk|ticker\.(css|js)", lead.group(1)):
    sys.exit(1)
# then the strip, a child of the page itself, between that section and the next
m = re.search(r"<section class=\"page-hero[^\"]*\">.*?</section>(.*?)<section\b", s, re.S)
between = re.sub(r"<!--.*?-->", "", m.group(1), flags=re.S) if m else ""
ok = re.fullmatch(r"\s*<link rel=\"stylesheet\" href=\"/css/ticker\.css\?v=[0-9a-f]{8}\">\s*<aside class=\"sa-tk\" id=\"sa-ticker\" aria-label=\"Market figures\" hidden></aside>\s*<script src=\"/js/ticker\.js\?v=[0-9a-f]{8}\" defer></script>\s*", between)
sys.exit(0 if ok else 1)
PY'
# The host keeps scripts and styles for a year, so each tag carries the first
# eight characters of its file's SHA-1: change the file and the tag must follow.
vcss=$(sha1sum "$here/site/css/ticker.css" | cut -c1-8); vjs=$(sha1sum "$js" | cut -c1-8)
check "with its stylesheet, tagged with its version (now ?v=$vcss)" 'grep -q "<link rel=\"stylesheet\" href=\"/css/ticker.css?v=$vcss\">" "$tools"'
check "and its script, tagged with its version (now ?v=$vjs)" 'grep -q "<script src=\"/js/ticker.js?v=$vjs\" defer></script>" "$tools"'
check "the tools page is the only page with it" '[ "$(grep -rl "sa-ticker" "$here/site" --include=*.html)" = "$tools" ]'
check "the home page gave it up: no strip, and neither of its files" '! grep -qE "sa-tk|ticker\.(css|js)|market/feed" "$home"'
check "the script writes text, never markup" '! grep -nE "innerHTML|outerHTML|insertAdjacentHTML|document\.write" "$js"'
check "and asks only the site's own feed" '[ "$(grep -c "fetch(" "$js")" = 1 ] && grep -q "var FEED = ./market/feed.php.;" "$js" && ! grep -vF "var SVG = '"'"'http://www.w3.org/2000/svg'"'"';" "$js" | grep -qE "https?://"'
check "it says what the figures are, and that the tool runs on free public data" 'grep -q "These quotes are latest published figures and not necessarily live\.." "$js" && ! grep -q "live quotes" "$js" && grep -q "This tool runs entirely on free public data\. Yours could too\." "$js"'
check "the hover makes no pitch and links only to sources" '! grep -qiE "working for you|/contact|mailto:" "$js"'
check "it has a pause button and respects reduced motion" 'grep -q "sa-tk-pause" "$js" && grep -q "prefers-reduced-motion" "$js" && grep -q "prefers-reduced-motion" "$here/site/css/ticker.css"'
check "no long dash in any of it" '! grep -l $'"'"'\xe2\x80\x94'"'"' "$js" "$here/site/css/ticker.css" "$here/site/lib/market.php" "$here/site/market/feed.php"'
check "no licensed index or metal is named as a figure" '! grep -qiE "s&p|dow jones|gold" "$js" && ! grep -qE "\x27(spx|dow|gold)\x27 =>" "$here/site/lib/market.php"'
if python3 "$here/scripts/build_site.py" --site "$here/site" --out "$t/dist" >/dev/null 2>&1; then
  check "the built site carries the feed, its library, the script and the styles" '[ -s "$t/dist/market/feed.php" ] && [ -s "$t/dist/lib/market.php" ] && [ -s "$t/dist/js/ticker.js" ] && [ -s "$t/dist/css/ticker.css" ]'
  check "in the built site only the tools page loads the strip: not the home page, and not the tool pages that reuse its head, menu and footer" '[ "$(grep -rlE "sa-ticker|ticker\.(css|js)" "$t/dist" --include=*.html)" = "$t/dist/tools/index.html" ] && [ "$(ls "$t/dist/tools/football/"*.html | wc -l)" -ge 3 ]'
else
  check "the site builds" 'false'
fi

# --- in a browser, where there is one
if node -e "require('playwright')" 2>/dev/null && [ -d "$t/dist" ]; then
  kill "$pid" 2>/dev/null; pid=
  rm -rf "$web"; cp -r "$t/dist" "$web"; all_sources; with_key; forget
  SA_MARKET_FIXTURES="$fx" SA_MARKET_NOW=$NOW php -S 127.0.0.1:18746 -t "$web" >/dev/null 2>&1 & pid=$!
  for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:18746/" && break; sleep 0.1; done
  curl -s -o /dev/null "http://127.0.0.1:18746/market/feed.php"; curl -s -o /dev/null "http://127.0.0.1:18746/market/feed.php"   # every source asked before the browser looks
  out=$(node "$here/tests/ticker_browser.cjs" http://127.0.0.1:18746/tools/ 2>&1); code=$?
  BODY=$out
  check "the strip works in a browser: $(printf '%s' "$out" | tail -1)" '[ $code -eq 0 ]'
  [ $code -eq 0 ] || printf '%s\n' "$out"
else
  echo "no browser here: the strip itself was not opened"
fi

if [ "$fails" -eq 0 ]; then echo "ok: $n checks"; else echo "$fails of $n checks failed"; exit 1; fi
