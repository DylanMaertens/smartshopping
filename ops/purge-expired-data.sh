#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
retention_days="${RETENTION_DAYS:-30}"
case "$retention_days" in *[!0-9]*|'') echo "RETENTION_DAYS must be an integer" >&2; exit 2;; esac
now_ms=$(( $(date -u +%s) * 1000 ))
cutoff_ms=$(( now_ms - retention_days * 86400000 ))
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v now_ms="$now_ms" -v cutoff_ms="$cutoff_ms" <<'SQL'
BEGIN;
DELETE FROM list_invitations WHERE expires_at < :now_ms OR revoked_at < :cutoff_ms;
DELETE FROM anonymous_devices d
WHERE d.last_seen_at < :cutoff_ms
  AND NOT EXISTS (SELECT 1 FROM shared_lists l WHERE l.owner_device_id = d.device_id)
  AND NOT EXISTS (SELECT 1 FROM list_members m WHERE m.device_id = d.device_id);
COMMIT;
SQL
