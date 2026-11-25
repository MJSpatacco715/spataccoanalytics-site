#!/usr/bin/env bash
# The notice mail a lead or a contact message sends (site/lib/leads.php
# lead_notice): it goes to the firm, with the firm's own address as its
# envelope sender, the visitor as Reply-To, and nothing a visitor typed in a
# header. A stand-in for sendmail records what PHP hands it.
#   bash tests/notice_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

mkdir -p "$t/home/public_html/score" "$t/home/public_html/contact" "$t/home/public_html/lib" "$t/out"
cp "$here/site/score/lead.php" "$t/home/public_html/score/lead.php"
cp "$here/site/contact/submit.php" "$t/home/public_html/contact/submit.php"
cp "$here/site/lib/leads.php" "$t/home/public_html/lib/leads.php"

# what PHP runs in place of sendmail: one file per message, arguments then the message
cat > "$t/fake-sendmail" <<EOF
#!/usr/bin/env bash
f=\$(mktemp "$t/out/msg.XXXXXX")
{ printf 'ARGS: %s\n' "\$*"; cat; } > "\$f"
EOF
chmod +x "$t/fake-sendmail"

php -d sendmail_path="$t/fake-sendmail -t -i" -S 127.0.0.1:18744 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18744
for i in $(seq 1 50); do curl -s -o /dev/null "$base/score/lead.php" && break; sleep 0.1; done

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
msgs() { ls "$t/out" 2>/dev/null | wc -l | tr -d ' '; }
last() { ls -t "$t/out"/msg.* 2>/dev/null | head -1; }
post() { CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "$2" "$base$1"); }

post /score/lead.php '{"name":"Pat Advisor","email":"pat@example.com","firm":"Example Wealth","website":"https://example.com","scope":"website","score":52,"score_max":80,"tier":"Adequate","company":""}'
check "a scorer lead is accepted" '[ "$CODE" = 200 ]'
check "and one notice is sent" '[ "$(msgs)" = 1 ]'
m=$(last)
check "with the firm's address as the envelope sender" 'head -1 "$m" | grep -q -- "-fmike@spataccoanalytics.com"'
check "to the firm" 'grep -q "^To: mike@spataccoanalytics.com" "$m"'
check "from the firm's own address" 'grep -q "^From: Spatacco Analytics Website <mike@spataccoanalytics.com>" "$m"'
check "with the visitor as Reply-To" 'grep -q "^Reply-To: pat@example.com" "$m"'
check "naming the lead in the subject" 'grep -q "^Subject: .*Example Wealth" "$m"'
check "and the score in the body" 'grep -q "52/80" "$m"'

post /contact/submit.php '{"name":"Pat Advisor","email":"pat@example.com","firm":"Example Wealth","notes":"Looking at a rebuild.","about":"golf","company":""}'
check "a contact message is accepted" '[ "$CODE" = 200 ]'
check "and sends its own notice" '[ "$(msgs)" = 2 ]'
m=$(last)
check "with the same envelope sender" 'head -1 "$m" | grep -q -- "-fmike@spataccoanalytics.com"'
check "its subject says it is the contact form" 'grep -q "^Subject: Contact form: Example Wealth" "$m"'
check "and carries the notes and the build asked about" 'grep -q "Looking at a rebuild." "$m" && grep -q "a walkthrough (golf)" "$m"'

# nothing a visitor types reaches a header or the command line
post /contact/submit.php '{"name":"Pat\r\nBcc: x@example.com","email":"pat@example.com","firm":"A\r\nCc: y@example.com","notes":"hello\r\nBcc: z@example.com -fevil@example.com","company":""}'
m=$(last)
check "a line break in a field adds no header" '[ "$(msgs)" = 3 ] && ! grep -q -i "^Bcc:" "$m" && ! grep -q -i "^Cc:" "$m"'
check "and the envelope sender is still the firm's alone" 'head -1 "$m" | grep -q -- "-fmike@spataccoanalytics.com" && ! head -1 "$m" | grep -q "evil"'

post /contact/submit.php '{"name":"Bot","email":"bot@example.com","company":"Acme"}'
check "a bot's message sends no notice" '[ "$CODE" = 200 ] && [ "$(msgs)" = 3 ]'
post /contact/submit.php '{"name":"Pat","email":"not-an-email"}'
check "a refused message sends no notice" '[ "$CODE" = 422 ] && [ "$(msgs)" = 3 ]'

echo "$((n - fails))/$n notice checks passed"
[ "$fails" = 0 ]
