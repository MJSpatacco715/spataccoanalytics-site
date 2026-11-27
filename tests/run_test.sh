#!/usr/bin/env bash
# The owner's record of what goes into the Website Scorer, and who may read it.
#   site/score/run.php   keeps each lookup, choice and score as one line outside the web
#                        root, mails the owner when a score finishes, and keeps nothing else
#   site/score/feed.php  hands the record to the owner's CRM, and to nobody without the token
# The owner, 2026-11-27: "the scorer should also keep a record for me and only me to see
# what has gone into the mechanism. This should feed into the Taccobox CRM ... Though I
# absolutely want to maintain getting an email when someone hits the button(s)".
# A stand-in for sendmail records what PHP hands it; nothing leaves the machine.
#   bash tests/run_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$t"; }
trap cleanup EXIT

mkdir -p "$t/home/public_html/score" "$t/home/public_html/lib" "$t/out"
cp "$here/site/score/run.php" "$here/site/score/lead.php" "$here/site/score/feed.php" "$t/home/public_html/score/"
cp "$here/site/lib/leads.php" "$t/home/public_html/lib/leads.php"
cat > "$t/fake-sendmail" <<EOF
#!/usr/bin/env bash
f=\$(mktemp "$t/out/msg.XXXXXX")
{ printf 'ARGS: %s\n' "\$*"; cat; } > "\$f"
EOF
chmod +x "$t/fake-sendmail"
php -d sendmail_path="$t/fake-sendmail -t -i" -S 127.0.0.1:18748 -t "$t/home/public_html" >/dev/null 2>&1 & pid=$!
base=http://127.0.0.1:18748
url=$base/score/run.php
for i in $(seq 1 50); do curl -s -o /dev/null "$url" && break; sleep 0.1; done
file="$t/home/sa-leads/scorer-runs.jsonl"
leads="$t/home/sa-leads/scorer.jsonl"

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
post() {  # post BODY [curl args] -> sets CODE, BODY
  local b="$1"; shift
  BODY=$(curl -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' "$@" --data-binary "$b" "${URL:-$url}")
  CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}
}
lines() { [ -f "$file" ] && wc -l < "$file" | tr -d ' ' || echo 0; }
mails() { find "$t/out" -name 'msg.*' | wc -l | tr -d ' '; }
last() { tail -1 "$file"; }
forget() { rm -f "$t"/home/sa-leads/runs-*.txt "$t"/home/sa-leads/rate-*.txt "$t"/home/sa-leads/feed-*.txt; }   # the hourly counts, between parts
run=0123456789abcdef01234567

# --- what is kept
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$url")
check "GET is refused" '[ "$CODE" = 405 ]'

post '{"kind":"lookup","run":"'$run'","scope":"website","typed":"Smith Wealth","outcome":"offered","utm_source":"services","matches":[{"name":"Smith Wealth Management","website":"www.smithwealth.example","place":"Austin, TX","confidence":88},{"name":"Smith Advisors","website":"https://smithwa.example/","place":"Tampa, FL","confidence":540},{"name":"No site","website":"not a site","confidence":70},{"name":"A fourth","website":"four.example","confidence":10}]}'
check "a firm-name lookup is accepted" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"ok\":true"* ]]'
check "and kept as one line, with what was typed and how the visitor arrived" '[ "$(lines)" = 1 ] && last | grep -q "\"kind\":\"lookup\"" && last | grep -q "\"typed\":\"Smith Wealth\"" && last | grep -q "\"utm_source\":\"services\"" && last | grep -q "\"run\":\"'$run'\""'
check "with the firms offered: three at most, each with a real address, how sure bounded to 100" 'php -r '"'"'$e = json_decode(trim(file_get_contents($argv[1])), true); $m = $e["matches"]; exit(count($m) === 2 && $m[0]["website"] === "https://www.smithwealth.example" && $m[0]["confidence"] === 88 && $m[1]["confidence"] === 100 && $m[0]["place"] === "Austin, TX" && $e["outcome"] === "offered" ? 0 : 1);'"'"' "$file"'
check "it mails nobody: only a finished score does" '[ "$(mails)" = 0 ]'
check "the record is outside the web root" '[ "$(curl -s -o /dev/null -w "%{http_code}" $base/sa-leads/scorer-runs.jsonl)" = 404 ]'
check "no address of the visitor's is written down" '! grep -q "127.0.0.1" "$file"'

post '{"kind":"choose","run":"'$run'","typed":"Smith Wealth","chose":"match","website":"https://www.smithwealth.example/","name":"Smith Wealth Management","confidence":88}'
check "the firm chosen is kept" '[ "$CODE" = 200 ] && [ "$(lines)" = 2 ] && last | grep -q "\"chose\":\"match\"" && last | grep -q "\"website\":\"https://www.smithwealth.example/\"" && last | grep -q "\"confidence\":88"'
post '{"kind":"choose","run":"'$run'","typed":"Smith Wealth","chose":"none","website":"https://www.smithwealth.example/"}'
check "and so is none of them, with no site against it" '[ "$CODE" = 200 ] && [ "$(lines)" = 3 ] && last | grep -q "\"chose\":\"none\"" && last | grep -q "\"website\":\"\""'

score='{"kind":"score","run":"'$run'","scope":"website","typed":"Smith Wealth","found":"lookup","website":"https://www.smithwealth.example","firm_scored":"Smith Wealth Management","score":52,"score_max":80,"tier":"Adequate","scores":{"visual_design":9,"navigation_ux":6,"<b>":5,"big":900},"utm_source":"services","utm_medium":"qr"}'
post "$score"
check "a finished score is kept, its category scores bounded" '[ "$CODE" = 200 ] && [ "$(lines)" = 4 ] && last | grep -q "\"kind\":\"score\"" && last | grep -q "\"score\":52" && last | grep -q "\"found\":\"lookup\"" && last | grep -q "\"scores\":{\"visual_design\":9,\"navigation_ux\":6,\"big\":100}"'
check "and the owner is mailed about it, once" '[ "$(mails)" = 1 ]'
msg=$(find "$t/out" -name 'msg.*' | head -1)
check "the notice goes to the firm, from the firm, and says no name has been left yet" 'grep -q "^To: mike@spataccoanalytics.com" "$msg" && grep -q "^From: Spatacco Analytics Website <mike@spataccoanalytics.com>" "$msg" && grep -q "^Reply-To: mike@spataccoanalytics.com" "$msg" && grep -q "No name or email yet" "$msg"'
check "it says what was scored, what was typed, how it was found and the score" 'grep -q "Scored:   https://www.smithwealth.example (website)" "$msg" && grep -q "Typed:    Smith Wealth" "$msg" && grep -q "Found by: firm-name lookup" "$msg" && grep -q "Score:    52/80 Adequate" "$msg" && grep -q "Arrived:  services qr" "$msg" && grep -q "  visual_design: 9" "$msg"'
check "the envelope sender is left to the host" '! grep -q "^ARGS:.* -f" "$msg"'

post '{"kind":"score","run":"'$run'","scope":"website","typed":"example.com","found":"typed","website":"example.com","score":70,"score_max":80,"tier":"Strong","known":true}'
check "a score from a visitor already known is kept, and not mailed: the lead notice that follows says it all" '[ "$CODE" = 200 ] && [ "$(lines)" = 5 ] && last | grep -q "\"known\":true" && last | grep -q "\"website\":\"https://example.com\"" && [ "$(mails)" = 1 ]'

post '{"kind":"failed","run":"'$run'","website":"example.com","why":"You have reached today'"'"'s free limit for this tool.\r\nBcc: x@example.com"}'
check "a score that did not finish is kept with why, on one line" '[ "$CODE" = 200 ] && [ "$(lines)" = 6 ] && last | grep -q "\"kind\":\"failed\"" && last | grep -q "free limit for this tool. Bcc: x@example.com\"" && [ "$(mails)" = 1 ]'
check "every line is valid JSON with an id of its own" 'php -r '"'"'$ids = []; foreach (file($argv[1]) as $l) { $e = json_decode($l, true); if (!is_array($e) || !preg_match("/^[a-f0-9]{16}$/", $e["id"] ?? "")) exit(1); $ids[$e["id"]] = 1; } exit(count($ids) === 6 ? 0 : 1);'"'"' "$file"'

# --- what is not
post '{"kind":"unlock","run":"'$run'"}'
check "a kind it does not know is refused" '[ "$CODE" = 422 ] && [ "$(lines)" = 6 ]'
post '{"kind":"score","run":"not-a-run"}'
check "so is a run that is not one" '[ "$CODE" = 422 ] && [ "$(lines)" = 6 ]'
post "$score" -H 'Origin: https://elsewhere.example'
check "another site is refused" '[ "$CODE" = 403 ] && [ "$(lines)" = 6 ] && [ "$(mails)" = 1 ]'
post '{"kind":"score","run":"'$run'","company":"Acme"}'
check "a filled hidden field is told ok and dropped" '[ "$CODE" = 200 ] && [ "$(lines)" = 6 ] && [ "$(mails)" = 1 ]'
post 'not json'
check "a body that is not JSON is refused" '[ "$CODE" = 400 ]'
post "{\"kind\":\"score\",\"run\":\"$run\",\"typed\":\"$(head -c 9000 /dev/zero | tr '\0' x)\"}"
check "an oversized body is refused" '[ "$CODE" = 413 ] && [ "$(lines)" = 6 ]'
post '{"kind":"score","run":"'$run'","typed":"Pat\r\nBcc: x@example.com","firm_scored":"A\nB <x@example.com>","website":"javascript:alert(1)","score":"12","score_max":80,"tier":"Poor"}'
check "line breaks are flattened and a non-web address dropped" '[ "$CODE" = 200 ] && last | grep -q "\"typed\":\"Pat Bcc: x@example.com\"" && last | grep -q "\"website\":\"\""'
newest=$(ls -t "$t"/out/msg.* | head -1)
check "and nothing a visitor typed adds a header to the notice or changes who it goes to" '[ "$(mails)" = 2 ] && ! sed -n "1,/^$/p" "$newest" | grep -qiE "^(Bcc|Cc):" && [ "$(sed -n "1,/^$/p" "$newest" | grep -c "^To: ")" = 1 ] && grep -q "^To: mike@spataccoanalytics.com" "$newest" && grep -q "^Reply-To: mike@spataccoanalytics.com" "$newest"'

# --- the counts: its own, apart from the forms'
forget
for i in $(seq 1 12); do post '{"kind":"choose","run":"'$run'","chose":"none"}'; done
URL=$base/score/lead.php post '{"name":"Pat Advisor","email":"pat@example.com","firm":"Example Wealth","website":"example.com","scope":"website","score":52,"score_max":80,"tier":"Adequate","run":"'$run'"}'
check "looking firms up and scoring does not use up the leads a visitor may leave" '[ "$CODE" = 200 ] && [ -f "$leads" ] && [ "$(wc -l < "$leads" | tr -d " ")" = 1 ]'
check "the lead carries the run it belongs to, and an id" 'grep -q "\"run\":\"'$run'\"" "$leads" && grep -Eq "\"id\":\"[a-f0-9]{16}\"" "$leads"'
for i in $(seq 1 28); do post '{"kind":"choose","run":"'$run'","chose":"none"}'; done
check "forty in the hour are kept" '[ "$CODE" = 200 ]'
before=$(lines)
post '{"kind":"choose","run":"'$run'","chose":"none"}'
check "the forty-first is refused" '[ "$CODE" = 429 ] && [ "$(lines)" = "$before" ]'

# --- the day's count of notices: the record is still kept
forget
printf '60' > "$t/home/sa-leads/run-mails-$(date -u +%Y%m%d).txt"
sent=$(mails); before=$(lines)
post "$score"
check "past sixty score notices in a day the score is still kept, and no more mail goes" '[ "$CODE" = 200 ] && [ "$(lines)" = $((before + 1)) ] && [ "$(mails)" = "$sent" ]'

# --- the record cannot fill the disk
forget
cp "$file" "$t/keep.jsonl"; truncate -s 21M "$file"; big=$(wc -c < "$file" | tr -d ' '); sent=$(mails)
post "$score"
check "a record past twenty megabytes keeps no more and mails nothing, and the visitor is told all is well" '[ "$CODE" = 200 ] && [ "$(wc -c < "$file" | tr -d " ")" = "$big" ] && [ "$(mails)" = "$sent" ]'
cp "$t/keep.jsonl" "$file"

# --- who may read it
forget
feed=$base/score/feed.php
get() { BODY=$(curl -s -o - -w '\n%{http_code}' "$@"); CODE=${BODY##*$'\n'}; BODY=${BODY%$'\n'*}; }
get "$feed" -H 'X-Scorer-Token: anything-at-all-that-is-long-enough'
check "with no token set on the host the feed is not there at all" '[ "$CODE" = 404 ] && [[ "$BODY" != *"runs"* ]]'
tok=test-token-0123456789-abcdefghij
printf '{"token":"%s"}' "$tok" > "$t/home/sa-scorer.json"
get "$feed"
check "with one set, no token is turned away" '[ "$CODE" = 401 ] && [[ "$BODY" != *"runs"* ]]'
get "$feed" -H 'X-Scorer-Token: wrong-token-0123456789-abcdefgh'
check "and so is the wrong one" '[ "$CODE" = 401 ] && [[ "$BODY" != *"Smith"* ]]'
get "$feed?token=$tok"
check "the token is read from its header only, never the address" '[ "$CODE" = 401 ]'
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "X-Scorer-Token: $tok" "$feed")
check "it is read, never written to" '[ "$CODE" = 405 ]'
H=$(curl -s -D - -o "$t/feed.json" -H "X-Scorer-Token: $tok" "$feed")
check "the right token gets the record as JSON, not kept by anything and not for search engines" '[[ "$H" == *"200 OK"* ]] && [[ "${H,,}" == *"content-type: application/json"* ]] && [[ "${H,,}" == *"cache-control: no-store"* ]] && [[ "${H,,}" == *"x-robots-tag: noindex"* ]]'
check "every run and every lead, oldest first, each with an id, and where to ask from next" 'php -r '"'"'$d = json_decode(file_get_contents($argv[1]), true); $r = $d["runs"]; $l = $d["leads"]; $ok = $d["ok"] === true && count($r) === (int)$argv[2] && count($l) === 1 && $r[0]["kind"] === "lookup" && $l[0]["email"] === "pat@example.com" && $l[0]["run"] === $argv[3] && $d["more"] === false && $d["next"] !== ""; foreach (array_merge($r, $l) as $e) { $ok = $ok && preg_match("/^[a-f0-9]{16}$/", $e["id"]); } for ($i = 1; $i < count($r); $i++) { $ok = $ok && strcmp($r[$i - 1]["at"], $r[$i]["at"]) <= 0; } exit($ok ? 0 : 1);'"'"' "$t/feed.json" "$(lines)" "$run"'
get "$feed?since=2999-01-01T00:00:00Z" -H "X-Scorer-Token: $tok"
check "asked from a later time it hands over only what is newer" '[ "$CODE" = 200 ] && [[ "$BODY" == *"\"runs\":[]"* ]] && [[ "$BODY" == *"\"leads\":[]"* ]]'
get "$feed?since=not-a-time" -H "X-Scorer-Token: $tok"
check "a time it cannot read is refused" '[ "$CODE" = 422 ]'
# a lead kept before leads had ids: the same id every time it is read
printf '%s\n' '{"at":"2026-11-01T10:00:00+00:00","name":"Old Lead","email":"old@example.com","firm":"","website":"https://old.example"}' >> "$leads"
get "$feed" -H "X-Scorer-Token: $tok"; a=$(printf '%s' "$BODY" | php -r '$d = json_decode(stream_get_contents(STDIN), true); foreach ($d["leads"] as $l) if ($l["email"] === "old@example.com") echo $l["id"];')
get "$feed" -H "X-Scorer-Token: $tok"; b=$(printf '%s' "$BODY" | php -r '$d = json_decode(stream_get_contents(STDIN), true); foreach ($d["leads"] as $l) if ($l["email"] === "old@example.com") echo $l["id"];')
check "a lead kept before leads had ids is given one, the same each time" '[[ "$a" =~ ^[a-f0-9]{16}$ ]] && [ "$a" = "$b" ]'
check "the feed changes nothing in the record" '[ "$(wc -l < "$leads" | tr -d " ")" = 2 ]'
for i in $(seq 1 10); do get "$feed" -H 'X-Scorer-Token: wrong-token-0123456789-abcdefgh'; done
get "$feed" -H "X-Scorer-Token: $tok"
check "ten wrong tokens in the hour and that address is turned away, even with the right one" '[ "$CODE" = 429 ] && [[ "$BODY" != *"runs"* ]]'
check "the token is in none of the pages or scripts of the site" '! grep -rqs "sa-scorer.json" "$here/site" --include=*.html --include=*.js && ! grep -rqsE "X-Scorer-Token" "$here/site" --include=*.html --include=*.js'

check "the token reaches the host from a secret, written beside the web root by the publish, and is nowhere in this repository" 'grep -q "SCORER_FEED_TOKEN: \${{ secrets.SCORER_FEED_TOKEN }}" "$here/.github/workflows/publish.yml" && grep -q "cfg=\"\$(dirname \"\$web\")/sa-scorer.json\"" "$here/.github/workflows/publish.yml" && [ ! -e "$here/site/sa-scorer.json" ] && [ ! -e "$here/sa-scorer.json" ]'

echo "$((n - fails))/$n run checks passed"
[ "$fails" = 0 ]
