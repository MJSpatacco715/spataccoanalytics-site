#!/usr/bin/env bash
# live/feed.php: passes on only its four calls, keeps answers for their time,
# serves the last good answer when the source fails, never more than that, and
# never a league member's name or id.
# A local PHP server stands in for the source.
#   bash tests/feed_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d)
pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null; done; rm -rf "$t"; }
trap cleanup EXIT

# the source: answers per a mode file, and counts the requests it gets
mkdir -p "$t/source"
cat > "$t/source/api.php" <<'PHP'
<?php
$mode = trim((string)@file_get_contents(__DIR__ . '/mode'));
file_put_contents(__DIR__ . '/hits', ((int)@file_get_contents(__DIR__ . '/hits') + 1) . "");
file_put_contents(__DIR__ . '/last', $_SERVER['QUERY_STRING'] . ' ' . ($_SERVER['HTTP_USER_AGENT'] ?? ''));
if ($mode === 'down') { http_response_code(500); exit; }
if ($mode === 'blocked') { http_response_code(403); header('Content-Type: text/html'); echo '<html>forbidden</html>'; exit; }
if ($mode === 'notok') { header('Content-Type: application/json'); echo '{"ok":false}'; exit; }
header('Content-Type: application/json');
$a = ['ok' => true, 'action' => $_GET['action'] ?? null, 'week' => $_GET['week'] ?? null, 'n' => (int)@file_get_contents(__DIR__ . '/hits'),
  // a game a member refreshed, as the source names him; and an empty map
  'weeks' => ['6' => [['home' => 'PHI', 'fetched_by' => 100001, 'fetched_by_name' => 'Some Member', 'read_by' => 'manager']]],
  'ticks' => new stdClass()];
if ($mode === 'secret') { $a['note'] = 'brought to you by Secretword'; }
echo json_encode($a);
PHP
echo ok > "$t/source/mode"
php -S 127.0.0.1:18731 -t "$t/source" >/dev/null 2>&1 & pids+=($!)

# this site: the relay in a web root, its config one level up
mkdir -p "$t/home/public_html"
cp "$here/live/feed.php" "$t/home/public_html/feed.php"
printf '{"base":"http://127.0.0.1:18731/","deny":["\\\\bsecretword\\\\b","\\\\b15\\\\d{4}\\\\b"]}' > "$t/home/sa-feed.json"
php -S 127.0.0.1:18732 -t "$t/home/public_html" >/dev/null 2>&1 & pids+=($!)
for i in $(seq 1 50); do curl -s -o /dev/null http://127.0.0.1:18732/feed.php && curl -s -o /dev/null http://127.0.0.1:18731/mode && break; sleep 0.1; done

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }
get() {  # get QUERY -> sets CODE, BODY, FEED
  local h; h=$(mktemp)
  BODY=$(curl -s -D "$h" "http://127.0.0.1:18732/feed.php?$1")
  CODE=$(awk 'NR==1{print $2}' "$h"); FEED=$(grep -i '^x-feed:' "$h" | tr -d '\r' | awk '{print $2}'); rm -f "$h"
}
hits() { cat "$t/source/hits" 2>/dev/null || echo 0; }

get "a=league_rosters";            check "an unlisted call is refused" '[ "$CODE" = 404 ]'
get "a=odds_get&week=99";           check "a week outside 1-17 is refused" '[ "$CODE" = 400 ]'
get "a=odds_get&week=6x";           check "a week that is not a number is refused" '[ "$CODE" = 400 ]'
get "a=injuries&player=1;drop";     check "a bad player is refused" '[ "$CODE" = 400 ]'
check "nothing refused reached the source" '[ "$(hits)" = 0 ]'

get "a=odds_get&week=6"
check "a first read is fresh" '[ "$CODE" = 200 ] && [ "$FEED" = fresh ]'
check "the answer is the source's" 'echo "$BODY" | grep -q "\"action\":\"odds_get\"" && echo "$BODY" | grep -q "\"week\":\"6\""'
check "the source was asked as a browser" 'grep -q "Chrome/" "$t/source/last"'
get "a=odds_get&week=6"
check "a second read inside the minute is the kept copy" '[ "$FEED" = cached ] && [ "$(hits)" = 1 ]'
get "a=odds_get&week=7"
check "another week is its own read" '[ "$FEED" = fresh ] && [ "$(hits)" = 2 ]'
check "a member who refreshed is not named" '! echo "$BODY" | grep -q "fetched_by\|Some Member\|100001" && echo "$BODY" | grep -q "\"read_by\":\"auto\""'
check "an empty map stays a map" 'echo "$BODY" | grep -q "\"ticks\":{}"'
check "the cache holds only the cleaned answer" '! grep -rq "Some Member" "$t/home/sa-feed-cache"'

# the source fails after the kept copy has aged out
touch -d '10 minutes ago' "$t/home/sa-feed-cache/"*odds_get*week_6*.json
echo blocked > "$t/source/mode"
get "a=odds_get&week=6"
check "a refusal page is never passed on: the last good copy is" '[ "$CODE" = 200 ] && [ "$FEED" = stale ] && echo "$BODY" | grep -q "\"ok\":true"'
echo notok > "$t/source/mode"
get "a=odds_get&week=6"
check "an answer that is not ok is not stored over a good one" '[ "$FEED" = stale ]'
get "a=referees"
check "with nothing kept, a failed read says so" '[ "$CODE" = 502 ] && echo "$BODY" | grep -q "\"ok\":false"'
echo secret > "$t/source/mode"
touch -d '10 minutes ago' "$t/home/sa-feed-cache/"*odds_get*week_6*.json
get "a=odds_get&week=6"
check "an answer carrying a denylisted word is refused like a failed read" '[ "$FEED" = stale ] && ! echo "$BODY" | grep -qi secretword'
get "a=injuries"
check "and never served when nothing is kept" '[ "$CODE" = 502 ]'

echo ok > "$t/source/mode"
get "a=odds_get&week=6"
check "a good read replaces the old copy" '[ "$FEED" = fresh ]'

check "the cache sits outside the web root" '[ -d "$t/home/sa-feed-cache" ] && [ ! -e "$t/home/public_html/sa-feed-cache" ]'
check "the relay never prints the source's address" '! grep -rq "127.0.0.1:18731" <(curl -s "http://127.0.0.1:18732/feed.php?a=nope"; curl -s "http://127.0.0.1:18732/feed.php?a=odds_get&week=6")'

rm -f "$t/home/sa-feed.json"; rm -rf "$t/home/sa-feed-cache"
get "a=odds_get&week=3"
check "with no address set up, the relay says so and asks nobody" '[ "$CODE" = 503 ]'

[ $fails -eq 0 ] && echo "all $n feed checks passed" || { echo "$fails of $n feed checks failed"; exit 1; }
