#!/usr/bin/env bash
# The deploy key setup opens a key whichever way the secrets were pasted, and
# says so plainly (without printing a secret) when they do not belong together.
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
pass='correct horse $battery'
ssh-keygen -q -t ed25519 -N "$pass" -C test -f "$t/ed" > /dev/null
ssh-keygen -q -t rsa -b 2048 -m PEM -N "$pass" -C test -f "$t/rsa" > /dev/null
grep -q 'Proc-Type: 4,ENCRYPTED' "$t/rsa" || { echo "setup: expected an encrypted PEM key"; exit 1; }

fails=0
run() {  # name, expect (ok|fail), key text, passphrase
  local name=$1 expect=$2 out status
  rm -rf "$t/home"; mkdir "$t/home"
  out=$(HOME="$t/home" SSH_KEY_SKIP_KEYSCAN=1 DEPLOY_SSH_KEY="$3" DEPLOY_SSH_PASSPHRASE="$4" \
        bash "$here/scripts/ssh_key.sh" 2>&1); status=$?
  if [ "$expect" = ok ]; then
    if [ $status -ne 0 ] || ! ssh-keygen -y -P "" -f "$t/home/.ssh/deploy_key" > /dev/null 2>&1; then
      echo "FAIL $name: expected a usable key without a passphrase"; echo "$out" | sed 's/^/    /'; fails=$((fails+1)); return
    fi
  else
    if [ $status -eq 0 ]; then echo "FAIL $name: expected a refusal"; fails=$((fails+1)); return; fi
  fi
  case "$out" in *"$pass"*|*battery*) echo "FAIL $name: printed the passphrase"; fails=$((fails+1)); return;; esac
  echo "ok   $name"
}

ed=$(cat "$t/ed"); rsa=$(cat "$t/rsa")
run "OpenSSH key as generated"            ok   "$ed"  "$pass"
run "PEM key as generated"                ok   "$rsa" "$pass"
run "passphrase with a trailing newline"  ok   "$ed"  "$pass"$'\n'
run "passphrase with spaces around it"    ok   "$ed"  "  $pass "
run "OpenSSH key folded onto one line"    ok   "$(tr '\n' ' ' < "$t/ed")"  "$pass"
run "PEM key folded onto one line"        ok   "$(tr '\n' ' ' < "$t/rsa")" "$pass"
run "PEM key with Windows line endings"   ok   "$(sed 's/$/\r/' "$t/rsa")" "$pass"
run "PEM key missing its blank line"      ok   "$(grep -v '^$' "$t/rsa")" "$pass"
run "folded key and padded passphrase"    ok   "$(tr '\n' ' ' < "$t/rsa")" " $pass"$'\r\n'
run "wrong passphrase"                    fail "$ed"  "not the passphrase"
run "passphrase one character off"        fail "$rsa" "${pass}x"
run "not a key at all"                    fail "$pass" "$pass"

[ $fails -eq 0 ] && echo "all key setup checks passed" || { echo "$fails failed"; exit 1; }
