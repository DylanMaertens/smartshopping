#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
umask 077
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
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
if [ -n "${BACKUP_RECIPIENT_FILE:-}" ]; then
  test -f "$BACKUP_RECIPIENT_FILE"
  command -v gpg >/dev/null
  file="$file.gpg"
  # No plaintext dump on disk; pipefail also catches an interrupted pg_dump.
  python3 "$script_dir/pg-private.py" pg_dump --format=custom --no-owner --no-acl |
    gpg --no-options --batch --no-auto-key-retrieve --trust-model always \
      --recipient-file "$BACKUP_RECIPIENT_FILE" --encrypt --output "$file.partial"
else
  python3 "$script_dir/pg-private.py" pg_dump --format=custom --no-owner --no-acl --file="$file.partial"
fi
test -s "$file.partial"
mv -- "$file.partial" "$file"
# The manifest travels with the archive; it never embeds the original directory.
(cd "$bundle" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
complete=1
printf '%s\n' "$file"
