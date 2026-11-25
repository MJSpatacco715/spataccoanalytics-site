#!/usr/bin/env bash
# site/contact/submit.php: keeps a real message from the contact form as one
# line outside the web root, and keeps nothing else (wrong method, another
# site, a bot, a bad email, an oversized or malformed body).
#   bash tests/contact_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

mkdir -p "$t/home/public_html/contact" "$t/home/public_html/lib"
cp "$here/site/contact/submit.php" "$t/home/public_html/contact/submit.php"
cp "$here/site/lib/leads.php" "$t/home/public_html/lib/leads.php"
SA_LEADS_NO_MAIL=1 php -S 127.0.0.1:18743 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
url=http://127.0.0.1:18743/contact/submit.php
for i in $(seq 1 50); do curl -s -o /dev/null "$url" && break; sleep 0.1; done
file="$t/home/sa-leads/contact.jsonl"

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
post() {  # post BODY [curl args] -> sets CODE, BODY
  local b="$1"; shift
  BODY=$(curl -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' "$@" --data-binary "$b" "$url")
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
lines() { [ -f "$file" ] && wc -l < "$file" | tr -d ' ' || echo 0; }

good='{"role":"Owner","dataLocation":"Spreadsheets; CRM","crm":"Salesforce","painPoints":"Duplicates","firmSize":"2-5","name":"Pat Advisor","firm":"Example Wealth","email":"pat@example.com","phone":"555-0100","notes":"Looking at a rebuild.","about":"crm","utm_source":"linkedin","utm_medium":"post","company":""}'

CODE=$(curl -s -o /dev/null -w '%{http_code}' "$url")
check "GET is refused" '[ "$CODE" = 405 ]'

post "$good"
check "a real message is accepted" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"ok\":true"* ]]'
check "and kept as one line" '[ "$(lines)" = 1 ]'
check "with its answers" 'grep -q "\"email\":\"pat@example.com\"" "$file" && grep -q "\"crm\":\"Salesforce\"" "$file" && grep -q "\"firm_size\":\"2-5\"" "$file" && grep -q "\"notes\":\"Looking at a rebuild.\"" "$file"'
check "which build it is about, and how they arrived" 'grep -q "\"about\":\"crm\"" "$file" && grep -q "\"utm_source\":\"linkedin\"" "$file"'
check "outside the web root" '[ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18743/sa-leads/contact.jsonl)" = 404 ]'

post "$good" -H 'Origin: http://127.0.0.1:18743'
check "same-site Origin passes" '[ "$CODE" = 200 ] && [ "$(lines)" = 2 ]'
post "$good" -H 'Origin: https://elsewhere.example'
check "another site is refused" '[ "$CODE" = 403 ] && [ "$(lines)" = 2 ]'

post '{"name":"Bot","email":"bot@example.com","notes":"buy now","company":"Acme"}'
check "a filled hidden field is told ok and dropped" '[ "$CODE" = 200 ] && [ "$(lines)" = 2 ]'

post '{"name":"Pat","email":"not-an-email"}'
check "a bad email is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 2 ]'
post '{"name":"","email":"pat@example.com"}'
check "a missing name is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 2 ]'
post 'not json'
check "a body that is not JSON is refused" '[ "$CODE" = 400 ]'
post "{\"name\":\"Pat\",\"email\":\"pat@example.com\",\"notes\":\"$(head -c 9000 /dev/zero | tr '\0' x)\"}"
check "an oversized body is refused" '[ "$CODE" = 413 ] && [ "$(lines)" = 2 ]'

# nothing a visitor types can leave its field, reach a header or name a build that does not exist
post '{"name":"Pat\r\nBcc: x@example.com","email":"pat@example.com","notes":"line one\nline two\r\nBcc: y@example.com","about":"<script>","phone":"555\n0100"}'
check "line breaks are flattened" '[ "$CODE" = 200 ] && [ "$(lines)" = 3 ] && tail -1 "$file" | grep -q "\"name\":\"Pat Bcc: x@example.com\"" && tail -1 "$file" | grep -q "\"notes\":\"line one line two Bcc: y@example.com\""'
check "an unknown build is dropped" 'tail -1 "$file" | grep -q "\"about\":\"\""'
check "every line is valid JSON" 'php -r '"'"'foreach (file($argv[1]) as $l) { if (!is_array(json_decode($l, true))) exit(1); }'"'"' "$file"'

echo "$((n - fails))/$n contact checks passed"
[ "$fails" = 0 ]
