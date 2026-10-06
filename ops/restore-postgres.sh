#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${1:?usage: restore-postgres.sh backup.dump}"
test "${CONFIRM_RESTORE:-}" = "RESTORE" || { echo "Set CONFIRM_RESTORE=RESTORE" >&2; exit 2; }
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 "$script_dir/verify-backup.py" "$1"
# All DDL and data changes roll back together on a restore error.
pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" -- "$1"
