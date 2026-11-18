#!/bin/sh
# Set or reset the household passcode. Run it in a terminal in this folder.
# Every sign-in ends at once, so each phone asks for the new passcode. The app needs no restart.
# The passcode goes to the app on standard input only: not an argument, not a file, not the log.
set -eu
umask 077
cd "$(dirname "$0")"
[ -t 0 ] || { echo "Run this in a terminal." >&2; exit 1; }
trap 'stty echo' EXIT INT TERM
stty -echo
printf 'New household passcode (10 or more characters): '; IFS= read -r first; echo
printf 'Type it again: '; IFS= read -r second; echo
[ "$first" = "$second" ] || { echo "The two entries differ. Nothing changed." >&2; exit 1; }
printf '%s' "$first" | docker compose run --rm --no-deps -T gateway node server/passcode.ts
