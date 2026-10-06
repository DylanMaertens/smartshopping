#!/usr/bin/env bash
# Isolated disposable database; never starts SmartShopping, Expo or HTTPS.
set -euo pipefail
umask 077
cargo test --locked --offline --manifest-path backend/Cargo.toml
test_dir=$(mktemp -d /tmp/smartshopping-community-pg.XXXXXX)
mkdir "$test_dir/socket"
initdb -D "$test_dir/data" --auth=trust --no-locale --encoding=UTF8 > "$test_dir/initdb.log"
trap 'pg_ctl -D "$test_dir/data" -m fast -w stop >/dev/null' EXIT
pg_ctl -D "$test_dir/data" -l "$test_dir/postgres.log" -o "-h '' -k '$test_dir/socket'" -w start >/dev/null
createdb -h "$test_dir/socket" community_test
export TEST_DATABASE_URL="postgresql:///community_test?host=$test_dir/socket"
cargo test --locked --offline --manifest-path backend/Cargo.toml --test community_catalog --test postgres_sync -- --ignored
