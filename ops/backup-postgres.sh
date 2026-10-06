#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
umask 077
destination="${1:-./backups}"
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)
# A fresh private directory prevents simultaneous backups from overwriting each other.
bundle=$(mktemp -d "$destination/smartshopping-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
complete=0
cleanup() {
  if [ "$complete" -eq 0 ]; then rm -rf -- "$bundle"; fi
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
file="$bundle/smartshopping.dump"
pg_dump --format=custom --no-owner --no-acl --file="$file.partial" "$DATABASE_URL"
test -s "$file.partial"
mv -- "$file.partial" "$file"
# The manifest travels with the archive; it never embeds the original directory.
(cd "$bundle" && sha256sum smartshopping.dump > smartshopping.dump.sha256)
complete=1
printf '%s\n' "$file"
