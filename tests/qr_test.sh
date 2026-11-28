#!/usr/bin/env bash
# The business card's QR page: what it shows, what it keeps, and what it never does.
#   site/C/index.php   counts the scan and draws the page       site/C/log.php   keeps a press
#   site/C/vcard.php   the contact card                         site/lib/qr.php  the record, off the web
# The owner's brief, 2026-11-27: the card's code reads HTTPS://SPATACCOANALYTICS.COM/C and is in print.
#   bash tests/qr_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d); pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT
mkdir -p "$t/home/public_html/C" "$t/home/public_html/lib" "$t/home/public_html/score"
cp "$here"/site/C/*.php "$here"/site/C/*.jpg "$t/home/public_html/C/"; cp "$here/site/lib/qr.php" "$t/home/public_html/lib/"; cp "$here/site/score/feed.php" "$t/home/public_html/score/"
php -S 127.0.0.1:18749 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18749
for i in $(seq 1 50); do curl -s -o /dev/null "$base/C/vcard.php" && break; sleep 0.1; done
file="$t/home/sa-leads/qr-events.jsonl"
fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
last() { tail -1 "$file" 2>/dev/null; }
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

page=$(curl -s -A "$UA" -D "$t/h1" "$base/C/")
check "the page opens and says who it is" 'grep -q "<h1>Michael J. Spatacco</h1>" <<<"$page" && grep -q "Founder &amp; CEO" <<<"$page" && grep -q "Spatacco Analytics" <<<"$page"'
check "it is never kept and never indexed" 'grep -qi "^Cache-Control: no-store, no-cache, must-revalidate" "$t/h1" && grep -q "<meta name=\"robots\" content=\"noindex\">" <<<"$page"'
check "its buttons, in order: LinkedIn first, then Text a Question, the contact, the email, the scorer, and Other Tools, which opens to the lines tracker, the resume parser and every tool" '[ "$(grep -o "data-event=\"[a-z]*\"" <<<"$page" | tr "\n" " ")" = "data-event=\"linkedin\" data-event=\"text\" data-event=\"vcard\" data-event=\"email\" data-event=\"scorer\" data-event=\"lines\" data-event=\"resume\" data-event=\"alltools\" " ] && grep -q "data-open=\"tools\" data-opens=\"tools\" aria-expanded=\"false\" aria-controls=\"tools\">Other Tools</button>" <<<"$page" && grep -q "<div class=\"more\" id=\"tools\" hidden>" <<<"$page" && grep -q "href=\"/tools/football/nfl-lines-tracker/\">NFL Lines Tracker" <<<"$page" && grep -qF "data-event=\"text\" href=\"sms:+14842781697?&amp;body=Hi%20Mike" <<<"$page" && grep -q "class=\"act first\" data-event=\"linkedin\" href=\"https://www.linkedin.com/in/mjspatacco/\"" <<<"$page"'
check "the scorer is reached at its folder address, tagged with where the scan came from" 'grep -q "href=\"/tools/website-scorer/?src=qr-card\"" <<<"$page"'
check "no email address and no plain mailto is written in the page: it is put together by script" '! grep -qi "mailto:" <<<"$page" && ! grep -q "@SpataccoAnalytics\|@spataccoanalytics" <<<"$page" && grep -q "var u = .Mike., d = .SpataccoAnalytics.com." <<<"$page"'
check "it links the privacy policy and installs no tracker of anyone else" 'grep -q "<a href=\"/privacy/\">Privacy</a>" <<<"$page" && ! grep -qi "googletagmanager\|google-analytics\|snap.licdn\|insight" <<<"$page"'
check "the scan is one line: the card, a phone, a hash and no address" '[ "$(wc -l < "$file")" = 1 ] && last | grep -q "\"source\":\"card\",\"event\":\"scan\",\"ua_type\":\"mobile\"" && last | grep -q "\"ip_hash\":\"[0-9a-f]\{64\}\"" && ! grep -q "127.0.0.1" "$file"'
curl -s -A "$UA" -o /dev/null "$base/C/?s=test-event"
check "a code printed for an event says so" 'last | grep -q "\"source\":\"test-event\",\"event\":\"scan\""'
page2=$(curl -s -A "$UA" "$base/C/?s=Bad%20Slug%3Cscript%3E")
check "a source that is not a plain slug is kept as unknown and never drawn" 'last | grep -q "\"source\":\"unknown\"" && ! grep -q "<script>Bad\|Bad Slug" <<<"$page2" && grep -q "src=qr-unknown" <<<"$page2"'
curl -s -A "Googlebot/2.1" -o /dev/null "$base/C/"
check "a crawler is told apart" 'last | grep -q "\"ua_type\":\"bot\""'
code=$(curl -s -o /dev/null -w "%{http_code}" -A "$UA" -X POST -H "Content-Type: application/json" --data "{\"event\":\"linkedin\",\"source\":\"test-event\"}" "$base/C/log.php")
check "a press is kept with its source" '[ "$code" = 204 ] && last | grep -q "\"source\":\"test-event\",\"event\":\"linkedin\""'
before=$(wc -l < "$file")
curl -s -o /dev/null -X POST -H "Content-Type: application/json" --data "{\"event\":\"delete-everything\",\"source\":\"card\"}" "$base/C/log.php"
curl -s -o /dev/null -X POST -H "Content-Type: application/json" --data "{\"event\":\"scan\",\"source\":\"card\"}" "$base/C/log.php"
check "a press of a kind not on the list is not kept, and a scan cannot be claimed by a press" '[ "$(wc -l < "$file")" = "$before" ]'
for e in text tools lines resume alltools; do curl -s -o /dev/null -A "$UA" -X POST -H "Content-Type: application/json" --data "{\"event\":\"$e\",\"source\":\"card\"}" "$base/C/log.php"; done
check "a text, opening Other Tools, and each tool chosen from it, is a line of its own" '[ "$(grep -c "\"event\":\"\(text\|tools\|lines\|resume\|alltools\)\"" "$file")" = 5 ]'
check "the recorder answers nothing to a GET" '[ "$(curl -s -o /dev/null -w "%{http_code}" "$base/C/log.php")" = 405 ]'
vc=$(curl -s -D "$t/h2" "$base/C/vcard.php")
check "the contact card is a vCard, offered as mike.vcf, with the owner's details" 'grep -qi "^Content-Type: text/vcard" "$t/h2" && grep -qi "filename=\"mike.vcf\"" "$t/h2" && grep -q "^FN:Michael J. Spatacco" <<<"$vc" && grep -q "^TEL;TYPE=WORK,VOICE:+14842781697" <<<"$vc" && grep -q "^EMAIL;TYPE=WORK:Mike@SpataccoAnalytics.com" <<<"$vc" && grep -q "^END:VCARD" <<<"$vc"'
check "the contact card carries his picture: a JPEG inside it, folded as a vCard asks, that decodes to the file" '[ "$(printf "%s" "$vc" | tr -d "\r" | awk "/^PHOTO;ENCODING=b;TYPE=JPEG:/{p=1; sub(/^PHOTO[^:]*:/,\"\"); printf \"%s\", \$0; next} p&&/^ /{printf \"%s\", substr(\$0,2); next} {p=0}" | base64 -d | sha1sum | cut -c1-40)" = "$(sha1sum "$here/site/C/contact-photo.jpg" | cut -c1-40)" ] && ! printf "%s" "$vc" | tr -d "\r" | awk "length(\$0)>75{f=1} END{exit !f}"'
check "the lower-case address goes to the page and the contact card has its printed address" 'grep -q "^RewriteRule \^c/?\$ https://spataccoanalytics.com/C/ \[R=301,QSA,L\]" "$here/site/.htaccess" && grep -q "^RewriteRule \^C/mike\\\\.vcf\$ C/vcard.php \[L\]" "$here/site/.htaccess"'
check "nobody reads the record without the CRM token: with none set the feed is not there" '[ "$(curl -s -o /dev/null -w "%{http_code}" "$base/score/feed.php")" = 404 ]'
printf '{"token":"test-token-test-token-test-token"}' > "$t/home/sa-scorer.json"
feed=$(curl -s -H "X-Scorer-Token: test-token-test-token-test-token" "$base/score/feed.php")
check "with the token the CRM is handed the scans and presses" 'grep -q "\"qr\":\[{" <<<"$feed" && grep -q "\"event\":\"linkedin\"" <<<"$feed" && [ "$(curl -s -o /dev/null -w "%{http_code}" -H "X-Scorer-Token: wrong" "$base/score/feed.php")" = 401 ]'
if [ $fails -gt 0 ]; then echo "$fails of $n card page checks failed"; exit 1; fi
echo "$n/$n card page checks passed"
