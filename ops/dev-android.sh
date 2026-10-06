#!/usr/bin/env bash
# Local Wi-Fi development only. Ctrl+C stops services; data is kept for next run.
set -euo pipefail
umask 077
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
state_dir="$repo_dir/.local-dev"
mkdir -p "$state_dir/socket"
node_binary=${SMARTSHOPPING_NODE_BINARY:-node}
for tool in cargo initdb pg_ctl psql createdb curl python3; do
  command -v "$tool" >/dev/null || { echo "Outil manquant : $tool" >&2; exit 1; }
done
"$node_binary" --version >/dev/null
[[ -d "$repo_dir/mobile/node_modules" ]] || { echo 'Installer les dépendances mobile avec pnpm install --frozen-lockfile.' >&2; exit 1; }
python3 - <<'PY'
import socket
for port in [3000, 8081]:
    with socket.socket() as sock:
        try: sock.bind(('0.0.0.0', port))
        except OSError: raise SystemExit(f'Port {port} déjà utilisé. Arrêter la session précédente avant de relancer.')
PY
lan_ip=${SMARTSHOPPING_LAN_IP:-$(python3 - <<'PY'
import json, subprocess
routes = json.loads(subprocess.check_output(['ip','-j','-4','route','get','1.1.1.1']))
print(routes[0]['prefsrc'])
PY
)}
[[ "$lan_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'SMARTSHOPPING_LAN_IP doit être une adresse IPv4 locale.' >&2; exit 1; }
pg_started=0
backend_pid=''
cleanup() {
  if [[ -n "$backend_pid" ]]; then kill "$backend_pid" 2>/dev/null || true; wait "$backend_pid" 2>/dev/null || true; fi
  if [[ "$pg_started" == 1 ]]; then pg_ctl -D "$state_dir/postgres" -m fast -w stop >/dev/null; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ ! -f "$state_dir/postgres/PG_VERSION" ]]; then
  initdb -D "$state_dir/postgres" --auth=trust --no-locale --encoding=UTF8 > "$state_dir/initdb.log"
fi
if ! pg_ctl -D "$state_dir/postgres" status >/dev/null 2>&1; then
  pg_ctl -D "$state_dir/postgres" -l "$state_dir/postgres.log" -o "-h '' -k '$state_dir/socket'" -w start >/dev/null
  pg_started=1
fi
if [[ $(psql -h "$state_dir/socket" -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='smartshopping_dev'") != 1 ]]; then
  createdb -h "$state_dir/socket" smartshopping_dev
fi
if [[ ! -s "$state_dir/device-secret-key" ]]; then
  python3 - "$state_dir/device-secret-key" <<'PY'
import base64, os, pathlib, sys
pathlib.Path(sys.argv[1]).write_text(base64.b64encode(os.urandom(32)).decode()+'\n')
PY
fi
export DATABASE_URL
DATABASE_URL=$(python3 - "$state_dir/socket" <<'PY'
from urllib.parse import quote
import sys
print('postgresql:///smartshopping_dev?host='+quote(sys.argv[1], safe=''))
PY
)
export HOST=0.0.0.0 PORT=3000 ENABLE_SYNC_ENDPOINT=true REQUIRE_DEVICE_SIGNATURES=true
export DEVICE_SECRET_KEY_FILE="$state_dir/device-secret-key"
export DEVICE_REGISTRY_PATH="$state_dir/device-registry.json"
if [[ -x "$state_dir/ocr/venv/bin/python" && -f "$state_dir/ocr/models/rec.onnx" ]]; then
  export OCR_PYTHON="$state_dir/ocr/venv/bin/python" OCR_MODELS_DIR="$state_dir/ocr/models"
fi
cargo build --locked --manifest-path "$repo_dir/backend/Cargo.toml"
backend_binary="${CARGO_TARGET_DIR:-$repo_dir/backend/target}/debug/shopping-list-backend"
"$backend_binary" > "$state_dir/backend.log" 2>&1 &
backend_pid=$!
ready=0
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null; then ready=1; break; fi
  kill -0 "$backend_pid" 2>/dev/null || break
  sleep 0.25
done
[[ "$ready" == 1 ]] || { echo "Le backend n’a pas démarré. Voir $state_dir/backend.log" >&2; exit 1; }
export EXPO_PUBLIC_API_BASE_URL="http://$lan_ip:3000/api/v1"
export __UNSAFE_EXPO_HOME_DIRECTORY="$state_dir/expo-home"
export REACT_NATIVE_PACKAGER_HOSTNAME="$lan_ip" EXPO_NO_TELEMETRY=1
printf '\nBackend prêt : http://%s:3000/health\nExpo Go : exp://%s:8081\nTéléphone et PC sur le même Wi-Fi. Ctrl+C pour arrêter.\n\n' "$lan_ip" "$lan_ip"
cd "$repo_dir/mobile"
"$node_binary" node_modules/expo/bin/cli start --go --lan --port 8081
