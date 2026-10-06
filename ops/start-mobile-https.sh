#!/usr/bin/env bash
# Start Expo Go against the endpoint managed by local-https.py.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ -s "$repo_dir/mobile/.local-api.json" ]] || { echo 'Démarrer d’abord : python3 ops/local-https.py' >&2; exit 1; }
node_binary=${SMARTSHOPPING_NODE_BINARY:-node}
export __UNSAFE_EXPO_HOME_DIRECTORY="$repo_dir/.local-dev/expo-home"
export EXPO_NO_TELEMETRY=1 SMARTSHOPPING_CHANNEL=development
unset EAS_BUILD_PROFILE
cd "$repo_dir/mobile"
exec "$node_binary" node_modules/expo/bin/cli start --go --lan --port "${SMARTSHOPPING_EXPO_PORT:-8081}"
