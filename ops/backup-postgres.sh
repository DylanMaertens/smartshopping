#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
destination="${1:-./backups}"
mkdir -p "$destination"
umask 077
file="$destination/smartshopping-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-acl --file="$file" "$DATABASE_URL"
sha256sum "$file" > "$file.sha256"
printf '%s\n' "$file"
