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

# 7. Everything a page loads is in place before any page is. The host and
#    Cloudflare keep a stylesheet for a year under its full address: a page
#    naming a new address must never be there before the file is (on
#    2026-11-26 an old stylesheet was kept under a new address for hours).
#    Unpacked in one pass in the list's order, about/index.html would land
#    before css/site.css. A stand-in for tar notes what each unpacking was
#    given and what the stylesheet on the host said at that moment.
rm -rf "$src"; src=$(mktemp -d); mkdir -p "$src/about" "$src/css" "$src/img" "$src/js" "$src/tools"
mkdir -p "$web/css" "$web/about"; echo "old css" > "$web/css/site.css"; echo "old about page" > "$web/about/index.html"
echo "new about page" > "$src/about/index.html"; echo "new css" > "$src/css/site.css"; echo "pic" > "$src/img/logo.png"
echo "new home page" > "$src/index.html"; echo "new js" > "$src/js/app.js"; echo "new tools page" > "$src/tools/index.html"
echo "an endpoint" > "$src/tools/feed.php"
real_tar=$(command -v tar); mkdir -p "$home/bin"; : > "$home/tar.log"
cat > "$home/bin/tar" <<SHIM
#!/usr/bin/env bash
list=; prev=; unpack=
for a in "\$@"; do [ "\$prev" = "-T" ] && list="\$a"; case "\$a" in -x*) unpack=1 ;; esac; prev="\$a"; done
if [ -n "\$unpack" ]; then
  if [ -n "\$list" ]; then kinds=\$(awk '{ print (/\\.html\$/ ? "pages" : "other") }' "\$list" | sort -u | tr '\\n' ' ')
  else kinds="everything at once "; fi
  echo "\${kinds}| the stylesheet says: \$(cat "$web/css/site.css" 2>/dev/null)" >> "$home/tar.log"
fi
exec "$real_tar" "\$@"
SHIM
chmod +x "$home/bin/tar"
stage "$src"
PATH="$home/bin:$PATH" HOME="$home" bash "$here/scripts/remote_deploy.sh" "www/example.com/public_html" "private/spa-site" "saratoga .well-known tools/gc-demo" >/dev/null 2>&1; rc=$?
check "a deploy of pages, styles, scripts and pictures succeeds" '[ $rc -eq 0 ]'
check "it unpacks twice: what pages load, then the pages" '[ "$(wc -l < "$home/tar.log")" = 2 ] && sed -n 1p "$home/tar.log" | grep -q "^other |" && sed -n 2p "$home/tar.log" | grep -q "^pages |"'
check "when the first page goes in, the stylesheet it names is already the new one" 'sed -n 2p "$home/tar.log" | grep -q "the stylesheet says: new css$"'
check "and everything arrived: pages, the stylesheet, the script, the picture, the endpoint" 'grep -q "new about page" "$web/about/index.html" && grep -q "new home page" "$web/index.html" && grep -q "new tools page" "$web/tools/index.html" && grep -q "new css" "$web/css/site.css" && grep -q "new js" "$web/js/app.js" && [ -f "$web/img/logo.png" ] && [ -f "$web/tools/feed.php" ]'
check "the earlier pages were backed up first" 'tar -tzf "$(ls -1t "$priv"/backups/*.tgz | head -1)" | grep -qx "about/index.html"'
check "nothing is left behind in the private folder" '[ ! -e "$priv/first.txt" ] && [ ! -e "$priv/pages.txt" ] && [ ! -e "$priv/incoming.tgz" ]'

# 7b. A deploy with only pages, and one with no page at all, both work.
only=$(mktemp -d); mkdir -p "$only/about"; echo "newer about page" > "$only/about/index.html"
check "a deploy of pages alone works" 'stage "$only"; run && grep -q "newer about page" "$web/about/index.html"'
rm -rf "$only"; only=$(mktemp -d); mkdir -p "$only/css"; echo "newest css" > "$only/css/site.css"
# (This one also has a new file last in its list, which once stopped a deploy without a word.)
check "a deploy with no page works, and so does one whose last file is new" 'stage "$only"; run && grep -q "newest css" "$web/css/site.css"'
rm -rf "$only"

# 8. Refuses a path tar would read as an option.
printf -- '-x.html\n' > "$priv/incoming.txt"; tar -czf "$priv/incoming.tgz" -T /dev/null
run; rc=$?
check "refuses a path that starts with a dash" '[ $rc -ne 0 ]'

rm -rf "$src"
[ $fails -eq 0 ] && echo "all $n checks passed" || echo "$fails of $n checks failed"
exit $fails
