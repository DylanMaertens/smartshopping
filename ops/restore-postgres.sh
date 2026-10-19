#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?usage: restore-postgres.sh backup.dump}"
test "${CONFIRM_RESTORE:-}" = "RESTORE" || { echo "Set CONFIRM_RESTORE=RESTORE" >&2; exit 2; }
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 "$script_dir/verify-backup.py" "$1"
archive="$1"
decrypted=""
cleanup() {
  if [ -n "$decrypted" ]; then rm -f -- "$decrypted/restore.dump"; rmdir -- "$decrypted"; fi
}
trap cleanup 0
trap 'exit 1' HUP INT TERM
case "$archive" in
  *.gpg)
    umask 077
    decrypted=$(mktemp -d "${TMPDIR:-/tmp}/poduna-restore-XXXXXXXX")
    # Uses the operator's private key/keyring, never a key stored with the backup.
    gpg --no-options --batch --no-auto-key-retrieve --decrypt --output "$decrypted/restore.dump" "$archive"
    test -s "$decrypted/restore.dump"
    archive="$decrypted/restore.dump"
    ;;
esac
# All DDL and data changes roll back together on a restore error.
python3 "$script_dir/pg-private.py" pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner --no-acl --dbname="" -- "$archive"
