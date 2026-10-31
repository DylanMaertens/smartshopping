#!/usr/bin/env bash
# Inspect the optimized artifact: JavaScript mocks cannot catch stripped
# constructors used by ML Kit's manifest-based component discovery.
set -euo pipefail
apk_path=${1:?Usage: bash ops/check-apk-mlkit.sh path/to/app.apk}
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
android_sdk=${ANDROID_HOME:-$repo_dir/.local-dev/android-build/sdk}
export JAVA_HOME=${JAVA_HOME:-$repo_dir/.local-dev/android-build/java-home}
export PATH="$JAVA_HOME/bin:$PATH"
analyzer="$android_sdk/cmdline-tools/latest/bin/apkanalyzer"
[[ -f "$apk_path" && -x "$analyzer" ]] || { echo 'APK ou apkanalyzer introuvable.' >&2; exit 1; }
for registrar in \
  com.google.mlkit.vision.barcode.internal.BarcodeRegistrar \
  com.google.mlkit.vision.common.internal.VisionCommonRegistrar \
  com.google.mlkit.common.internal.CommonComponentRegistrar; do
  dex_code=$("$analyzer" dex code --class "$registrar" "$apk_path")
  if [[ "$dex_code" != *'.method public constructor <init>()V'* ]]; then
    echo "Constructeur ML Kit absent de l'APK : $registrar" >&2
    exit 1
  fi
  echo "Constructeur ML Kit présent : $registrar"
done
