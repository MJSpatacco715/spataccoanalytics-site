#!/usr/bin/env bash
# site/score/lead.php: keeps a real lead as one line outside the web root,
# and keeps nothing else (wrong method, another site, a bot, a bad email,
# an oversized or malformed body, an eleventh lead in the hour).
#   bash tests/lead_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

mkdir -p "$t/home/public_html/score"
cp "$here/site/score/lead.php" "$t/home/public_html/score/lead.php"
SA_LEADS_NO_MAIL=1 php -S 127.0.0.1:18741 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
url=http://127.0.0.1:18741/score/lead.php
for i in $(seq 1 50); do curl -s -o /dev/null "$url" && break; sleep 0.1; done
file="$t/home/sa-leads/scorer.jsonl"

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
post() {  # post BODY [curl args] -> sets CODE, BODY
  local b="$1"; shift
  BODY=$(curl -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' "$@" --data-binary "$b" "$url")
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
lines() { [ -f "$file" ] && wc -l < "$file" | tr -d ' ' || echo 0; }

good='{"name":"Pat Advisor","email":"pat@example.com","firm":"Example Wealth","website":"https://example.com","scope":"website","score":52,"score_max":80,"tier":"Adequate","scores":{"visual_design":9,"navigation_ux":6},"utm_source":"leave-behind","utm_medium":"qr","company":""}'

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$url")
check "GET is refused" '[ "$CODE" = 405 ]'

post "$good"
check "a real lead is accepted" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"ok\":true"* ]]'
check "and kept as one line" '[ "$(lines)" = 1 ]'
check "with its fields" 'grep -q "\"email\":\"pat@example.com\"" "$file" && grep -q "\"utm_medium\":\"qr\"" "$file" && grep -q "\"score\":52" "$file" && grep -q "\"visual_design\":9" "$file"'
check "outside the web root" '[ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18741/sa-leads/scorer.jsonl)" = 404 ]'

post "$good" -H 'Origin: http://127.0.0.1:18741'
check "same-site Origin passes" '[ "$CODE" = 200 ] && [ "$(lines)" = 2 ]'
post "$good" -H 'Origin: https://elsewhere.example'
check "another site is refused" '[ "$CODE" = 403 ] && [ "$(lines)" = 2 ]'

post '{"name":"Bot","email":"bot@example.com","company":"Acme"}'
check "a filled hidden field is told ok and dropped" '[ "$CODE" = 200 ] && [ "$(lines)" = 2 ]'

post '{"name":"Pat","email":"not-an-email"}'
check "a bad email is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 2 ]'
post '{"name":"","email":"pat@example.com"}'
check "a missing name is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 2 ]'
post 'not json'
check "a body that is not JSON is refused" '[ "$CODE" = 400 ]'
post "{\"name\":\"Pat\",\"email\":\"pat@example.com\",\"firm\":\"$(head -c 9000 /dev/zero | tr '\0' x)\"}"
check "an oversized body is refused" '[ "$CODE" = 413 ] && [ "$(lines)" = 2 ]'

# line breaks and markup cannot leave their field or reach a header
post '{"name":"Pat\r\nBcc: x@example.com","email":"pat@example.com\r\nBcc: y@example.com","firm":"A\nB"}'
check "an email carrying a line break is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 2 ]'
post '{"name":"Pat\r\nBcc: x@example.com","email":"pat@example.com","firm":"A\nB","website":"javascript:alert(1)","scores":{"<b>":5,"ok_key":"7","big":900}}'
check "line breaks in other fields are flattened" '[ "$CODE" = 200 ] && [ "$(lines)" = 3 ] && tail -1 "$file" | grep -q "\"name\":\"Pat Bcc: x@example.com\""'
check "a non-web address is dropped" 'tail -1 "$file" | grep -q "\"website\":\"\""'
check "score keys and values are bounded" 'tail -1 "$file" | grep -q "\"scores\":{\"ok_key\":7,\"big\":100}"'
check "every line is valid JSON" 'php -r '"'"'foreach (file($argv[1]) as $l) { if (!is_array(json_decode($l, true))) exit(1); }'"'"' "$file"'

for i in $(seq 1 7); do post "$good"; done
check "ten in the hour are kept" '[ "$CODE" = 200 ] && [ "$(lines)" = 10 ]'
post "$good"
check "the eleventh is refused" '[ "$CODE" = 429 ] && [ "$(lines)" = 10 ]'

echo "$((n - fails))/$n lead checks passed"
[ "$fails" = 0 ]
