#!/usr/bin/env bash
# scripts/stat_card.cjs: a card is drawn only for a number that names its
# source, at the two sizes LinkedIn takes. The drawing needs a browser
# (Playwright); where there is none, only the refusals are checked.
#   bash tests/card_test.sh
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
card() { node "$here/scripts/stat_card.cjs" "$@" 2>&1; }

fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }

out=$(card --value "35%" --label "of advisors plan to retire" --out "$t/x"); code=$?
check "a number with no source is refused" '[ $code -ne 0 ] && [[ "$out" == *"source"* ]]'
out=$(card --value "35%" --label "of advisors plan to retire" --source "Cerulli"); code=$?
check "no place to write is refused" '[ $code -ne 0 ]'
out=$(card --value "35%" --label $'a label \xe2\x80\x94 with a long dash' --source "Cerulli" --out "$t/x"); code=$?
check "an em dash is refused" '[ $code -ne 0 ] && [[ "$out" == *"em dash"* ]]'
out=$(card --value "a value far too long" --label "x" --source "Cerulli" --out "$t/x"); code=$?
check "a value too long for a card is refused" '[ $code -ne 0 ]'
out=$(card --value "35%" --label "x" --source "Cerulli" --style neon --out "$t/x"); code=$?
check "an unknown style is refused" '[ $code -ne 0 ]'
printf '{"title":"t","date":"2026-01-05","category":"practice","summary":"s","blocks":[{"type":"p","text":"no number here"}]}' > "$t/nostat.json"
out=$(card --post "$t/nostat.json" --out "$t/x"); code=$?
check "a post with no stat block is refused" '[ $code -ne 0 ] && [[ "$out" == *"no stat block"* ]]'
check "nothing was written by a refusal" '[ -z "$(ls "$t" | grep -v nostat.json)" ]'

if node -e "require('playwright')" 2>/dev/null; then
  out=$(card --post "$here/tests/fixtures/posts/2026-01-05-sample-practice.json" --out "$t/card"); code=$?
  check "a post's stat is drawn" '[ $code -eq 0 ] && [ -s "$t/card-square.png" ] && [ -s "$t/card-portrait.png" ]'
  dims() { python3 -c "import struct,sys; b=open(sys.argv[1],'rb').read(24); print(*struct.unpack('>II', b[16:24]))" "$1"; }
  check "the square is 1200 x 1200 at twice the size" '[ "$(dims "$t/card-square.png")" = "2400 2400" ]'
  check "the portrait is 1080 x 1350 at twice the size" '[ "$(dims "$t/card-portrait.png")" = "2160 2700" ]'
  for st in light split; do
    out=$(card --value "322" --label "RIA deals announced" --source "DeVoe" --year 2025 --style $st --size square --out "$t/$st"); code=$?
    check "the $st style draws" '[ $code -eq 0 ] && [ -s "$t/$st-square.png" ]'
  done
else
  echo "no browser here: the drawing itself was not checked"
fi

echo "$((n - fails))/$n card checks passed"
[ "$fails" = 0 ]
