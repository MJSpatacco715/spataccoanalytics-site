#!/usr/bin/env bash
# The stat bank (site/bank/api.php, site/lib/bank.php): private to the owner
# and the weekly routine. Nothing is read or changed without a sign-in, an
# upload is kept only if its bytes are a picture, a PDF or text, everything
# is stored outside the web root, and a change from the page must come from
# the page.
#   bash tests/bank_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

web="$t/home/public_html"
mkdir -p "$web/bank" "$web/lib" "$t/up"
cp "$here/site/bank/api.php" "$web/bank/api.php"
cp "$here/site/bank/index.html" "$web/bank/index.html"
cp "$here/site/lib/bank.php" "$web/lib/bank.php"
php -S 127.0.0.1:18745 -t "$web" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18745
api="$base/bank/api.php?a="
for i in $(seq 1 50); do curl -s -o /dev/null "$base/bank/index.html" && break; sleep 0.1; done
jar="$t/jar"

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1 (code=$CODE body=${BODY:0:160})"; fi; }
# req ACTION [curl args] -> CODE, BODY
req() { local a="$1"; shift; BODY=$(curl -s -o - -w '\n%{http_code}' "$@" "$api$a"); CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}; }
page() { req "$1" -b "$jar" -c "$jar" -H 'X-Bank: 1' "${@:2}"; }                # as the signed-in page
jpost() { local a="$1" d="$2"; shift 2; page "$a" -X POST -H 'Content-Type: application/json' --data-binary "$d" "$@"; }
field() { printf '%s' "$BODY" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $p=explode(".",$argv[1]); foreach($p as $k){ $d=is_array($d)&&array_key_exists($k,$d)?$d[$k]:null; } echo is_bool($d)?($d?"true":"false"):(is_scalar($d)?$d:json_encode($d));' "$1"; }

PW='correct horse battery'
TOKEN='0123456789abcdef0123456789abcdef'

# --- not set up: closed to everyone
CODE=; BODY=
req status
check "with no secrets the bank says it is not set up" '[ "$CODE" = 200 ] && [ "$(field setup)" = false ]'
req list
check "and gives nothing" '[ "$CODE" = 503 ]'
req login -X POST -H 'X-Bank: 1' -H 'Content-Type: application/json' --data-binary '{"password":""}'
check "and takes no sign-in" '[ "$CODE" = 503 ]'

printf '{"password":"%s","token":"%s"}' "$PW" "$TOKEN" > "$t/home/sa-bank.json"

# --- nobody
req status
check "set up, and a stranger is not signed in" '[ "$CODE" = 200 ] && [ "$(field setup)" = true ] && [ "$(field signed_in)" = false ]'
req list
check "a stranger cannot list" '[ "$CODE" = 401 ]'
req add -X POST -H 'X-Bank: 1' -F 'text=hello'
check "a stranger cannot add" '[ "$CODE" = 401 ]'
req file\&id=000000000000000000000000
check "a stranger cannot fetch a file" '[ "$CODE" = 401 ]'
req list -H 'X-Bank-Token: wrong-token-wrong-token-wrong-token'
check "a wrong token is nobody" '[ "$CODE" = 401 ]'

# --- signing in
req login -X POST -H 'Content-Type: application/json' --data-binary "{\"password\":\"$PW\"}"
check "a sign-in without the page's header is refused" '[ "$CODE" = 403 ]'
req login -X POST -H 'X-Bank: 1' -H 'Origin: https://elsewhere.example' -H 'Content-Type: application/json' --data-binary "{\"password\":\"$PW\"}"
check "a sign-in from another site is refused" '[ "$CODE" = 403 ]'
jpost login '{"password":"not it"}'
check "a wrong password is refused" '[ "$CODE" = 401 ] && [ "$(field error)" = "wrong password" ]'
req status -b "$jar"
check "and signs nobody in" '[ "$(field signed_in)" = false ]'
jpost login "{\"password\":\"$PW\"}"
check "the right password signs in" '[ "$CODE" = 200 ] && [ "$(field ok)" = true ]'
check "with a cookie the page's scripts cannot read, for /bank/ only" 'grep -q "#HttpOnly_" "$jar" && grep -q "/bank/" "$jar"'
page status
check "the owner is signed in" '[ "$(field signed_in)" = true ]'
page list
check "the bank starts empty" '[ "$CODE" = 200 ] && [ "$(field count)" = 0 ]'

# --- adding
page add -X POST -F 'text=35% of advisors plan to retire within 10 years' -F 'topic=transitions'
check "the owner adds words" '[ "$CODE" = 200 ] && [ "$(field item.status)" = new ] && [ "$(field item.by)" = page ] && [ "$(field item.topic)" = transitions ]'
ID1=$(field item.id)
page add -X POST -F 'text=https://example.com/a-study'
check "a link pasted alone is kept as the link" '[ "$CODE" = 200 ] && [ "$(field item.url)" = "https://example.com/a-study" ] && [ -z "$(field item.text)" ]'
page add -X POST -F 'text=' -F 'topic='
check "nothing at all is refused" '[ "$CODE" = 422 ]'
req add -b "$jar" -X POST -F 'text=no header'
check "an add without the page's header is refused" '[ "$CODE" = 403 ]'
page add -X POST -H 'Origin: https://elsewhere.example' -F 'text=other site'
check "an add from another site is refused" '[ "$CODE" = 403 ]'

# a real picture (the smallest PNG), a PDF, and things that only claim to be
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$t/up/shot.png"
printf '%%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%%%EOF\n' > "$t/up/report.pdf"
printf '<?php echo "ran"; ?>' > "$t/up/evil.png"
printf 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00' > "$t/up/tool.exe"
printf '<html><script>alert(1)</script></html>' > "$t/up/page.html"

page add -X POST -F 'text=a screenshot' -F "files[]=@$t/up/shot.png;type=image/png" -F "files[]=@$t/up/report.pdf;type=application/pdf"
check "a picture and a PDF are kept" '[ "$CODE" = 200 ] && [ "$(field item.files.0.type)" = image/png ] && [ "$(field item.files.1.type)" = application/pdf ]'
ID3=$(field item.id); F1=$(field item.files.0.id); F2=$(field item.files.1.id)
check "under names made here, outside the web root" '[ -f "$t/home/sa-bank/files/$F1.png" ] && [ -f "$t/home/sa-bank/files/$F2.pdf" ] && [ -z "$(find "$web" -name "*.png" -o -name "*.pdf")" ]'
page add -X POST -F "files[]=@$t/up/tool.exe;type=image/png"
check "a program that says it is a picture is refused" '[ "$CODE" = 415 ]'
page add -X POST -F "files[]=@$t/up/evil.png;type=image/png;filename=evil.php"
check "PHP named as a picture is kept only as text, never as .php" '[ "$CODE" = 200 ] && [ "$(field item.files.0.type)" = text/plain ] && [ "$(field item.files.0.ext)" = txt ] && [ -z "$(find "$t/home/sa-bank/files" -name "*.php")" ]'
EV=$(field item.files.0.id)
page add -X POST -F "files[]=@$t/up/shot.png" -F "files[]=@$t/up/shot.png" -F "files[]=@$t/up/shot.png" -F "files[]=@$t/up/shot.png" -F "files[]=@$t/up/shot.png" -F "files[]=@$t/up/shot.png"
check "six files at once are refused" '[ "$CODE" = 413 ]'
check "and nothing of a refused add is left behind" '[ "$(ls "$t/home/sa-bank/files" | wc -l | tr -d " ")" = 3 ]'

# --- reading files back
req file\&id=$F1
check "a stranger cannot read an upload" '[ "$CODE" = 401 ]'
HDR=$(curl -s -D - -o "$t/back.png" -b "$jar" "${api}file&id=$F1")
check "the owner gets the picture back, byte for byte" 'cmp -s "$t/back.png" "$t/up/shot.png" && printf "%s" "$HDR" | grep -qi "^content-type: image/png"'
check "marked so a browser will not guess or run it" 'printf "%s" "$HDR" | grep -qi "^x-content-type-options: nosniff" && printf "%s" "$HDR" | grep -qi "^content-security-policy: .*sandbox"'
HDR=$(curl -s -D - -o /dev/null -b "$jar" "${api}file&id=$EV")
check "the would-be PHP comes back as plain text" 'printf "%s" "$HDR" | grep -qi "^content-type: text/plain"'
page file\&id=../../sa-bank.json
check "a made-up file id finds nothing" '[ "$CODE" = 404 ]'
for p in sa-bank/items.json sa-bank.json "sa-bank/files/$F1.png" ../sa-bank.json; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$base/$p")
  check "the web cannot read $p" '[ "$c" = 404 ] || [ "$c" = 400 ]'
done

# --- the routine (token)
req list -H "X-Bank-Token: $TOKEN"
check "the routine lists with its token" '[ "$CODE" = 200 ] && [ "$(field count)" = 4 ]'
req add -X POST -H "X-Bank-Token: $TOKEN" -H 'Content-Type: application/json' --data-binary '{"text":"From an email: 322 RIA deals in 2025","by":"email","ref":"<msg-1@example.com>"}'
check "the routine files an emailed item" '[ "$CODE" = 200 ] && [ "$(field item.by)" = email ]'
IDE=$(field item.id)
req add -X POST -H "X-Bank-Token: $TOKEN" -H 'Content-Type: application/json' --data-binary '{"text":"again","by":"email","ref":"<msg-1@example.com>"}'
check "the same email is banked once" '[ "$CODE" = 200 ] && [ "$(field already)" = true ] && [ "$(field item.id)" = "$IDE" ]'
req update -X POST -H "X-Bank-Token: $TOKEN" -H 'Content-Type: application/json' --data-binary "{\"id\":\"$ID1\",\"status\":\"checked\",\"found\":{\"value\":\"35%\",\"label\":\"of advisors plan to retire within 10 years\",\"source\":{\"name\":\"Cerulli\",\"year\":\"2026\",\"finding\":\"About 35% plan to retire.\",\"sample\":\"8,000 advisors\",\"url\":\"https://example.com/cerulli\"}},\"post\":\"advisors-retiring\",\"scheduled_for\":\"2026-12-01\"}"
check "the routine records what it found" '[ "$CODE" = 200 ] && [ "$(field item.status)" = checked ] && [ "$(field item.found.source.name)" = Cerulli ] && [ "$(field item.post)" = advisors-retiring ] && [ "$(field item.scheduled_for)" = 2026-12-01 ]'
req update -X POST -H "X-Bank-Token: $TOKEN" -H 'Content-Type: application/json' --data-binary "{\"id\":\"$ID1\",\"found\":{\"source\":{\"url\":\"javascript:alert(1)\"}},\"post\":\"../../etc\"}"
check "a link that is not a web address, and a slug that is not one, are dropped" '[ "$CODE" = 200 ] && [ -z "$(field item.found.source.url)" ] && [ -z "$(field item.post)" ]'
req delete -X POST -H "X-Bank-Token: $TOKEN" -H 'Content-Type: application/json' --data-binary "{\"id\":\"$ID1\"}"
check "the routine cannot delete" '[ "$CODE" = 403 ]'

# --- the owner steers
jpost update "{\"id\":\"$ID3\",\"next\":true}"
check "the owner marks one item next" '[ "$CODE" = 200 ] && [ "$(field item.next)" = true ]'
jpost update "{\"id\":\"$IDE\",\"next\":true}"
page list
check "and only one item is ever next" '[ "$(printf "%s" "$BODY" | grep -o "\"next\":true" | wc -l | tr -d " ")" = 1 ]'
jpost update "{\"id\":\"$ID3\",\"status\":\"posted\",\"found\":{\"value\":\"99%\"},\"post\":\"mine\"}"
check "the owner cannot mark an item posted or write what was found" '[ "$CODE" = 422 ]'
jpost update "{\"id\":\"$ID3\",\"status\":\"skipped\"}"
check "the owner can skip" '[ "$CODE" = 200 ] && [ "$(field item.status)" = skipped ]'
jpost update '{"id":"not-an-id","status":"skipped"}'
check "a bad id is refused" '[ "$CODE" = 422 ]'
req delete -b "$jar" -X POST -H 'Content-Type: application/json' --data-binary "{\"id\":\"$ID3\"}"
check "a delete without the page's header is refused" '[ "$CODE" = 403 ]'
jpost delete "{\"id\":\"$ID3\"}"
check "the owner deletes an item" '[ "$CODE" = 200 ]'
check "and its files go with it" '[ ! -e "$t/home/sa-bank/files/$F1.png" ] && [ ! -e "$t/home/sa-bank/files/$F2.pdf" ]'
check "items.json is valid JSON readable by the account alone" 'php -r "exit(is_array(json_decode(file_get_contents(\$argv[1]), true)) ? 0 : 1);" "$t/home/sa-bank/items.json"'

# --- signing out, and the door holds against guessing
jpost logout '{}'
page list
check "after signing out the cookie opens nothing" '[ "$CODE" = 401 ]'
for i in $(seq 1 9); do jpost login '{"password":"guess"}'; done
check "a run of wrong passwords is slowed" '[ "$CODE" = 429 ]'
jpost login "{\"password\":\"$PW\"}"
check "and then even the right one waits" '[ "$CODE" = 429 ]'
req list -H "X-Bank-Token: $TOKEN"
check "while the routine's token still works" '[ "$CODE" = 200 ]'

check "the page is marked not to be indexed" 'grep -q "noindex" "$here/site/bank/index.html"'
check "and writes no data into the page as markup" '! grep -q "innerHTML" "$here/site/bank/index.html"'

echo "$((n - fails))/$n bank checks passed"
[ "$fails" = 0 ]
