#!/usr/bin/env bash
# site/services/pricing.php: gives one project price free to a same-site
# POST that asks for one (once per browser, two different ones a day per
# address), gives every project price only to a POST that leaves a name and a
# valid email, keeps that lead first with the services ticked, and gives
# nothing (while still keeping the lead) when the prices are missing or
# malformed. The prices here are made up: the real ones are not in this
# repository.
#   bash tests/pricing_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

mkdir -p "$t/home/public_html/services" "$t/home/public_html/lib"
cp "$here/site/services/pricing.php" "$t/home/public_html/services/pricing.php"
cp "$here/site/lib/leads.php" "$t/home/public_html/lib/leads.php"
prices='{"audit":{"professional":11,"complete":12},"design":{"essential":21,"professional":22,"complete":23},"crm":{"essential":31,"professional":32,"complete":33}}'
printf '%s' "$prices" > "$t/home/sa-pricing.json"
SA_LEADS_NO_MAIL=1 php -S 127.0.0.1:18742 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
url=http://127.0.0.1:18742/services/pricing.php
for i in $(seq 1 50); do curl -s -o /dev/null "$url" && break; sleep 0.1; done
file="$t/home/sa-leads/pricing.jsonl"

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
post() {  # post BODY [curl args] -> sets CODE, BODY
  local b="$1"; shift
  BODY=$(curl -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' "$@" --data-binary "$b" "$url")
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
lines() { [ -f "$file" ] && wc -l < "$file" | tr -d ' ' || echo 0; }
noprice() { [[ "$BODY" != *'"prices":{'* ]] && [[ "$BODY" != *'22'* ]]; }

good='{"name":"Pat Advisor","email":"pat@example.com","firm":"Example Wealth","items":["design.complete","crm.complete","bogus","design.complete","audit.essential"],"unveiled":"design.professional","picks":{"audit":"professional","design":"complete","crm":"bogus","hosting":"managed"},"utm_source":"scorer","company":""}'

BODY=$(curl -s "$url"); CODE=$(curl -s -o /dev/null -w '%{http_code}' "$url")
check "GET is refused and shows no price" '[ "$CODE" = 405 ] && noprice'
check "the price file is not served" '[ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18742/sa-pricing.json)" = 404 ]'
check "the library alone gives nothing" '[ -z "$(curl -s http://127.0.0.1:18742/lib/leads.php)" ]'

post '{"name":"Pat","email":"not-an-email"}'
check "no price without a valid email" '[ "$CODE" = 422 ] && noprice && [ "$(lines)" = 0 ]'
post '{"name":"","email":"pat@example.com"}'
check "no price without a name" '[ "$CODE" = 422 ] && noprice && [ "$(lines)" = 0 ]'
post "$good" -H 'Origin: https://elsewhere.example'
check "no price to another site" '[ "$CODE" = 403 ] && noprice && [ "$(lines)" = 0 ]'
post '{"name":"Bot","email":"bot@example.com","company":"Acme"}'
check "no price to a filled hidden field" '[ "$CODE" = 200 ] && noprice && [ "$(lines)" = 0 ]'
post 'not json'
check "no price to a body that is not JSON" '[ "$CODE" = 400 ] && noprice'

# One free look. The owner, 2026-11-26: "each visitor gets one unveil (click to
# unveil) and then the second click brings about a contact form".
jar="$t/jar"
only() {  # the body names exactly one of the made-up prices, $1
  [[ "$BODY" == *"\"price\":$1"* ]] && [[ "$BODY" != *'"prices"'* ]] && [ -z "$(grep -Eo '[0-9]+' <<<"$BODY" | grep -vx "$1")" ]
}
look() { post "{\"unveil\":\"$1\",\"company\":\"\"}" "${@:2}"; }

look design.professional -c "$jar"
check "one price is given with no email" '[ "$CODE" = 200 ] && only 22 && [[ "$BODY" == *"\"item\":\"design.professional\""* ]]'
check "and no lead is kept for it" '[ "$(lines)" = 0 ]'
check "the browser is told which, in a cookie the page cannot read" 'grep -q "^#HttpOnly_.*sa_unveil[[:space:]]design.professional$" "$jar"'
look design.professional -b "$jar"
check "the same price again is given again" '[ "$CODE" = 200 ] && only 22'
look crm.complete -b "$jar"
check "a second price is refused to that browser" '[ "$CODE" = 403 ] && [[ "$BODY" == *"\"error\":\"used\""* ]] && [[ "$BODY" != *"33"* ]]'
check "and the answer gives back only the one it saw" 'only 22 && [[ "$BODY" == *"\"item\":\"design.professional\""* ]]'
look crm.complete
check "another browser on the same address gets its own look" '[ "$CODE" = 200 ] && only 33'
look audit.complete
check "a third price on that address in a day is refused" '[ "$CODE" = 429 ] && [[ "$BODY" == *"\"error\":\"used\""* ]] && [ -z "$(grep -Eo "[0-9]+" <<<"$BODY")" ]'
look design.professional
check "a price that address has seen is given again" '[ "$CODE" = 200 ] && only 22'
look audit.complete -H 'CF-Connecting-IP: 203.0.113.7'
check "behind Cloudflare, each visitor's own address counts" '[ "$CODE" = 200 ] && only 12'
check "the day is kept by a hash, not the address" '[ "$(ls "$t/home/sa-leads"/unveil-*.txt | wc -l)" = 2 ] && ! grep -q -e "127.0.0.1" -e "203.0.113.7" "$t/home/sa-leads"/unveil-*.txt'
look audit.essential
check "the free level is not a look" '[ "$CODE" = 422 ] && noprice'
look bogus
check "an unknown price is refused" '[ "$CODE" = 422 ] && noprice'
look design.professional -H 'Origin: https://elsewhere.example'
check "no look for another site" '[ "$CODE" = 403 ] && noprice'
post '{"unveil":"design.professional","company":"Acme"}'
check "no look for a filled hidden field" '[ "$CODE" = 200 ] && noprice'
mv "$t/home/sa-pricing.json" "$t/home/sa-pricing.off"
look crm.essential -D "$t/headers"
check "with no price file a look gives nothing and sets nothing" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"price\":null"* ]] && ! grep -qi "^set-cookie" "$t/headers"'
mv "$t/home/sa-pricing.off" "$t/home/sa-pricing.json"
look crm.essential
check "and counts for nothing" '[ "$CODE" = 429 ] && [ "$(lines)" = 0 ]'

post "$good"
check "a name and email get the prices" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"design\":{\"essential\":21,\"professional\":22,\"complete\":23}"* ]] && [[ "$BODY" == *"\"audit\":{\"professional\":11,\"complete\":12}"* ]]'
check "after the lead is kept" '[ "$(lines)" = 1 ] && grep -q "\"email\":\"pat@example.com\"" "$file"'
check "with the picks that are real" 'grep -q "\"picks\":{\"audit\":\"professional\",\"design\":\"complete\",\"hosting\":\"managed\"}" "$file"'
check "the services ticked, each once, and the one seen first" 'grep -q "\"asked\":\[\"design.complete\",\"crm.complete\"\],\"unveiled\":\"design.professional\"" "$file"'

# a price file that is wrong in any way gives no prices at all
printf '%s' '{"audit":{"professional":11,"complete":12},"design":{"essential":21,"professional":"22","complete":23},"crm":{"essential":31,"professional":32,"complete":33}}' > "$t/home/sa-pricing.json"
post "$good"
check "a malformed price file gives none, and still keeps the lead" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"prices\":null"* ]] && [ "$(lines)" = 2 ]'
rm "$t/home/sa-pricing.json"
post "$good"
check "a missing price file gives none, and still keeps the lead" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"prices\":null"* ]] && [ "$(lines)" = 3 ]'
printf '%s' "$prices" | sed 's/}$/,"extra":{"secret":99}}/' > "$t/home/sa-pricing.json"
post "$good"
check "only the expected prices are sent" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"complete\":33"* ]] && [[ "$BODY" != *"secret"* ]]'

for i in $(seq 1 6); do post "$good"; done
check "ten in the hour" '[ "$CODE" = 200 ] && [ "$(lines)" = 10 ]'
post "$good"
check "the eleventh gets no price" '[ "$CODE" = 429 ] && noprice && [ "$(lines)" = 10 ]'

echo "$((n - fails))/$n pricing checks passed"
[ "$fails" = 0 ]
