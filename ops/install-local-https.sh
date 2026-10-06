#!/usr/bin/env bash
# Pinned official binary, checksum verified before installation; no root needed.
set -euo pipefail
umask 077
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Cet installateur cible Linux x86_64.' >&2; exit 1; }
install_dir="$repo_dir/.local-dev/bin"
mkdir -p "$install_dir"
temp_file=$(mktemp "$install_dir/cloudflared.XXXXXX")
trap 'rm -f "$temp_file"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 --max-time 180 \
  https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-linux-amd64 -o "$temp_file"
python3 - "$temp_file" <<'PY'
import hashlib, pathlib, sys
assert hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest() == '77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2', 'Checksum cloudflared incorrect'
PY
chmod 700 "$temp_file"
mv "$temp_file" "$install_dir/cloudflared"
"$install_dir/cloudflared" --version
