#!/usr/bin/env sh
set -eu
umask 077
directory="${1:-./observability/secrets}"
mkdir -p "$directory"
current="$directory/device_secret_key"
previous="$directory/device_secret_previous_key"
test ! -f "$current" || cp "$current" "$previous"
openssl rand -base64 32 > "$current"
printf 'Nouvelle clé écrite dans %s. Conserver la précédente pendant la migration paresseuse.\n' "$current"
