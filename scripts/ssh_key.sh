#!/usr/bin/env bash
# Sets up the deploy key for a workflow step: writes DEPLOY_SSH_KEY to
# ~/.ssh/deploy_key with its passphrase removed, then trusts the host named in
# config/hosting.json. Used by Publish and Import live site.
#
# The host requires a passphrase on its keys and a workflow cannot type one,
# so the passphrase comes off this short-lived copy only.
#
# A secret pasted into GitHub's form can arrive altered: line breaks folded
# into spaces, Windows line endings, a stray space or newline around the
# passphrase. ssh-keygen reports most of those as a wrong passphrase, so the
# key is tried as stored and in its standard layout, and the passphrase as
# stored and trimmed. Nothing secret is ever printed.
#
# SSH_KEY_SKIP_KEYSCAN=1 stops after the key (for tests).
set -euo pipefail

[ -n "${DEPLOY_SSH_KEY:-}" ] || { echo "::error::The DEPLOY_SSH_KEY secret is not set."; exit 1; }
pass_raw="${DEPLOY_SSH_PASSPHRASE:-}"

dir="$HOME/.ssh"
mkdir -p "$dir" && chmod 700 "$dir"
umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

printf '%s\n' "$DEPLOY_SSH_KEY" > "$work/as_stored"

# Rebuild the key from its BEGIN/END lines, PEM headers and base64 body, so a
# paste that lost its line breaks or gained carriage returns still reads.
python3 - "$work/standard" <<'PY'
import os, re, sys
raw = os.environ["DEPLOY_SSH_KEY"].replace("\r", "")
m = re.search(r"-----BEGIN ([A-Z0-9 ]+)-----(.*?)-----END \1-----", raw, re.S)
if not m:
    print("::error::DEPLOY_SSH_KEY has no BEGIN and END lines, so it is not a private key file.")
    sys.exit(1)
kind, inner = m.group(1), m.group(2)
headers = []
for name in ("Proc-Type", "DEK-Info"):
    h = re.search(name + r":\s*(\S+)", inner)
    if h:
        headers.append(f"{name}: {h.group(1)}")
        inner = inner.replace(h.group(0), " ")
body = re.sub(r"[^A-Za-z0-9+/=]", "", inner)
width = 70 if kind == "OPENSSH PRIVATE KEY" else 64
lines = [f"-----BEGIN {kind}-----"] + (headers + [""] if headers else [])
lines += [body[i:i + width] for i in range(0, len(body), width)]
lines.append(f"-----END {kind}-----")
with open(sys.argv[1], "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"Key type: {kind}" + (" (passphrase-protected PEM)" if headers else ""))
PY

pass_trim=$(printf '%s' "$pass_raw" | tr -d '\r\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')

found=""
for k in as_stored standard; do
  for p in "$pass_raw" "$pass_trim"; do
    if ssh-keygen -y -P "$p" -f "$work/$k" > /dev/null 2>&1; then
      cp "$work/$k" "$dir/deploy_key" && chmod 600 "$dir/deploy_key"
      ssh-keygen -p -P "$p" -N "" -f "$dir/deploy_key" > /dev/null
      found="$k"
      [ "$p" = "$pass_raw" ] || echo "::warning::DEPLOY_SSH_PASSPHRASE has spaces or line breaks around it; it worked trimmed. Re-saving the secret without them is tidier."
      break 2
    fi
  done
done

if [ -z "$found" ]; then
  layout="the same"; cmp -s "$work/as_stored" "$work/standard" || layout="different"
  trimmed="no"; [ "$pass_trim" = "$pass_raw" ] || trimmed="yes"
  echo "::error::DEPLOY_SSH_PASSPHRASE does not open DEPLOY_SSH_KEY. Tried the key as stored and rebuilt in its standard layout (which came out $layout), with the passphrase as stored and trimmed (trimming changed it: $trimmed). The two secrets do not belong together: re-enter the passphrase for this key, or the key this passphrase belongs to."
  exit 1
fi
[ "$found" = "as_stored" ] || echo "::warning::DEPLOY_SSH_KEY lost its line breaks when it was saved; it worked rebuilt. Re-pasting the key file whole is tidier."
echo "Deploy key ready."

[ "${SSH_KEY_SKIP_KEYSCAN:-}" = "1" ] && exit 0
cfg="${GITHUB_WORKSPACE:-.}/config/hosting.json"
host=$(jq -r .ssh.host "$cfg")
port=$(jq -r .ssh.port "$cfg")
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  ssh-keyscan -p "$port" "$host" >> "$dir/known_hosts" 2>/dev/null && exit 0
  echo "keyscan attempt $attempt failed; retrying in 30s"; sleep 30
done
echo "::error::Cannot reach the host after 10 tries."; exit 1
