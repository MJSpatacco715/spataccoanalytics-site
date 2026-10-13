#!/usr/bin/env bash
# Runs scripts/remote_deploy.sh against a throwaway HOME laid out like the
# hosting account, and checks what it may and may not touch.
#   bash tests/remote_deploy_test.sh
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
fails=0; n=0
check() { n=$((n+1)); if eval "$2"; then :; else fails=$((fails+1)); echo "FAIL $1"; fi; }

home=$(mktemp -d); trap 'rm -rf "$home"' EXIT
web="$home/www/example.com/public_html"; priv="$home/private/spa-site"
mkdir -p "$web/tools/gc-demo" "$web/saratoga" "$priv"
echo "old tools page" > "$web/tools/index.html"
echo "someone else's" > "$web/saratoga/index.php"
echo "unmanaged" > "$web/notes.txt"
echo "kept off the repo" > "$web/tools/gc-demo/index.html"

stage() {  # stage <dir> : tar the dir's files as the incoming set
  ( cd "$1" && find . -type f | sed 's#^\./##' | sort > "$priv/incoming.txt" && tar -czf "$priv/incoming.tgz" -T "$priv/incoming.txt" )
}
run() { HOME="$home" bash "$here/scripts/remote_deploy.sh" "www/example.com/public_html" "private/spa-site" "saratoga .well-known tools/gc-demo" >/dev/null 2>&1; }

# 1. First deploy: replaces the tools page, adds a new page, backs up the old one.
src=$(mktemp -d); mkdir -p "$src/tools/football"
echo "new tools page" > "$src/tools/index.html"
echo "lines" > "$src/tools/football/nfl-lines-tracker.html"
stage "$src"; run; rc=$?
check "first deploy succeeds" '[ $rc -eq 0 ]'
check "tools page replaced" 'grep -q "new tools page" "$web/tools/index.html"'
check "new page added" '[ -f "$web/tools/football/nfl-lines-tracker.html" ]'
check "old tools page backed up" 'tar -tzf "$(ls "$priv"/backups/*.tgz | head -1)" | grep -qx "tools/index.html"'
check "other project untouched" 'grep -q "someone else" "$web/saratoga/index.php"'
check "unmanaged file untouched" '[ -f "$web/notes.txt" ]'

# 2. A page dropped from the repo is removed, but only because we deployed it.
rm "$src/tools/football/nfl-lines-tracker.html"
stage "$src"; sleep 1; run; rc=$?
check "second deploy succeeds" '[ $rc -eq 0 ]'
check "dropped page removed" '[ ! -f "$web/tools/football/nfl-lines-tracker.html" ]'
check "unmanaged file still untouched" '[ -f "$web/notes.txt" ]'

# 3. Refuses to write under a directory another project owns.
mkdir -p "$src/saratoga"; echo "x" > "$src/saratoga/index.php"
stage "$src"; run; rc=$?
check "refuses saratoga/" '[ $rc -ne 0 ]'
check "saratoga still intact" 'grep -q "someone else" "$web/saratoga/index.php"'
rm -rf "$src/saratoga"

# 3b. The same for a nested directory kept out of the repo.
mkdir -p "$src/tools/gc-demo"; echo "x" > "$src/tools/gc-demo/index.html"
stage "$src"; run; rc=$?
check "refuses tools/gc-demo/" '[ $rc -ne 0 ]'
check "tools/gc-demo still intact" 'grep -q "kept off the repo" "$web/tools/gc-demo/index.html"'
rm -rf "$src/tools/gc-demo"
check "a deploy beside it leaves it alone" 'stage "$src"; run && grep -q "kept off the repo" "$web/tools/gc-demo/index.html"'

# 4. Refuses a path that climbs out of the web root.
printf '../escape.txt\n' > "$priv/incoming.txt"; tar -czf "$priv/incoming.tgz" -T /dev/null
run; rc=$?
check "refuses ../ paths" '[ $rc -ne 0 ]'

# 5. Refuses a web root that is not a public_html.
stage "$src"
HOME="$home" bash "$here/scripts/remote_deploy.sh" "www/example.com" "private/spa-site" "saratoga" >/dev/null 2>&1; rc=$?
check "refuses a non-public_html root" '[ $rc -ne 0 ]'

# 6. The host's shell has no /dev/fd, so process substitution fails there
#    even though it works here (found on the first live deploy).
check "no process substitution in the deploy script" '! grep -q "<(" "$here/scripts/remote_deploy.sh"'

rm -rf "$src"
[ $fails -eq 0 ] && echo "all $n checks passed" || echo "$fails of $n checks failed"
exit $fails
