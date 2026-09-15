#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
device_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
list_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
old_ms=$(( $(date -u +%s) * 1000 - 100 * 86400000 ))
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v device_id="$device_id" -v list_id="$list_id" -v old_ms="$old_ms" <<'SQL'
INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at)
VALUES (:'device_id', :old_ms, :old_ms);
INSERT INTO deleted_lists (id, owner_device_id, deleted_at) VALUES (:'list_id', :'device_id', :old_ms);
SQL
DATABASE_URL="$DATABASE_URL" RETENTION_DAYS=90 ops/purge-expired-data.sh
remaining=$(psql "$DATABASE_URL" -Atv ON_ERROR_STOP=1 -v device_id="$device_id" -v list_id="$list_id" -c "SELECT (SELECT count(*) FROM anonymous_devices WHERE device_id = :'device_id') + (SELECT count(*) FROM deleted_lists WHERE id = :'list_id')")
test "$remaining" = "0"
echo "Retention purge verified on restored data"
