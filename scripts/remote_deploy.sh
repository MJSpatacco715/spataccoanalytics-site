#!/usr/bin/env bash
# Runs ON THE SERVER, fed over SSH by the Publish workflow:
#   ssh ... bash -s -- WEB_ROOT PRIVATE_DIR NEVER_TOUCH < scripts/remote_deploy.sh
# with the new files arriving beforehand as PRIVATE_DIR/incoming.tgz and their
# list as PRIVATE_DIR/incoming.txt (paths relative to the web root).
#
# What it guarantees:
#   - writes only inside WEB_ROOT, and only the listed paths;
#   - never writes under a NEVER_TOUCH directory (e.g. saratoga/, which another
#     repository deploys);
#   - backs up every file it is about to replace or remove, outside the web
#     root, and keeps the last 30 backups;
#   - removes a file only if an earlier deploy from this repository put it
#     there (deployed.txt) and it is no longer in the new list.
set -euo pipefail
web_rel="$1"; priv_rel="$2"; never="$3"
case "$web_rel" in /*) web="$web_rel" ;; *) web="$HOME/$web_rel" ;; esac
case "$priv_rel" in /*) priv="$priv_rel" ;; *) priv="$HOME/$priv_rel" ;; esac

case "$web" in
  */public_html) ;;
  *) echo "REFUSING: web root does not end in public_html: $web" >&2; exit 1 ;;
esac
[ -d "$web" ] || { echo "REFUSING: web root $web does not exist" >&2; exit 1; }
[ -f "$priv/incoming.tgz" ] && [ -f "$priv/incoming.txt" ] || { echo "nothing staged in $priv" >&2; exit 1; }

# Every listed path must be relative, stay inside the web root, and avoid the
# directories other projects own.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  case "$f" in /*|*..*) echo "REFUSING: bad path $f" >&2; exit 1 ;; esac
  for d in $never; do
    case "$f" in "$d"|"$d"/*) echo "REFUSING: $f is under $d/, which this repo never touches" >&2; exit 1 ;; esac
  done
done < "$priv/incoming.txt"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$priv/backups"
touch "$priv/deployed.txt"

# Files to remove: deployed by us before, not in the new list. Sorted into
# plain files because the host's shell has no /dev/fd for process
# substitution, and a failure here must stop the deploy, not skip removals.
sort -u "$priv/deployed.txt" > "$priv/old.txt"
sort -u "$priv/incoming.txt" > "$priv/new.txt"
comm -23 "$priv/old.txt" "$priv/new.txt" > "$priv/remove.txt"

# Back up whatever exists today at any path we will replace or remove.
( cd "$web" && cat "$priv/incoming.txt" "$priv/remove.txt" | sort -u | while IFS= read -r f; do
    [ -f "$f" ] && printf '%s\n' "$f"; done ) > "$priv/backup-list.txt"
if [ -s "$priv/backup-list.txt" ]; then
  tar -C "$web" -czf "$priv/backups/$stamp.tgz" -T "$priv/backup-list.txt"
fi
ls -1t "$priv/backups"/*.tgz 2>/dev/null | tail -n +31 | xargs -r rm -f

tar -C "$web" -xzf "$priv/incoming.tgz"
while IFS= read -r f; do
  [ -n "$f" ] && [ -f "$web/$f" ] && rm -f "$web/$f"
done < "$priv/remove.txt"

cp "$priv/incoming.txt" "$priv/deployed.txt"
rm -f "$priv/incoming.tgz" "$priv/incoming.txt" "$priv/remove.txt" "$priv/backup-list.txt" "$priv/old.txt" "$priv/new.txt"
echo "DEPLOYED $(wc -l < "$priv/deployed.txt") files to $web (backup: ${stamp}.tgz)"
