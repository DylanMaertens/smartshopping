#!/usr/bin/env bash
# Autonomous, signed local APK. Android SDK license must already be accepted.
set -euo pipefail
umask 077
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build_dir="$repo_dir/.local-dev/android-build"
export JAVA_HOME=${JAVA_HOME:-$build_dir/java-home}
export ANDROID_HOME=${ANDROID_HOME:-$build_dir/sdk}
export ANDROID_USER_HOME="$build_dir/android-user"
export GRADLE_USER_HOME="$build_dir/gradle"
export PATH="$JAVA_HOME/bin:$PATH"
node_binary=${SMARTSHOPPING_NODE_BINARY:-node}
export SMARTSHOPPING_CHANNEL=preview SMARTSHOPPING_TEST_SERVER=true EXPO_NO_TELEMETRY=1
export __UNSAFE_EXPO_HOME_DIRECTORY="$repo_dir/.local-dev/expo-home"
unset EAS_BUILD_PROFILE EXPO_PUBLIC_API_BASE_URL
for command in java keytool python3; do command -v "$command" >/dev/null || { echo "Outil manquant : $command" >&2; exit 1; }; done
[[ -d "$ANDROID_HOME/platforms/android-36" ]] || { echo 'Installer le SDK Android 36 avant de compiler.' >&2; exit 1; }
mkdir -p "$ANDROID_USER_HOME" "$GRADLE_USER_HOME" "$build_dir/signing" "$repo_dir/artifacts/android"
signing_dir="$build_dir/signing"
if [[ ! -e "$signing_dir/release.jks" ]]; then
  python3 - "$signing_dir/password" <<'PY'
import pathlib,secrets,sys
p=pathlib.Path(sys.argv[1]);p.write_text(secrets.token_urlsafe(32));p.chmod(0o600)
PY
  keytool -genkeypair -keystore "$signing_dir/release.jks" -storetype JKS \
    -alias smartshopping -keyalg RSA -keysize 3072 -validity 10000 \
    -dname 'CN=SmartShopping Local Test' \
    -storepass:file "$signing_dir/password" -keypass:file "$signing_dir/password"
fi
[[ -s "$signing_dir/password" ]] || { echo 'Mot de passe de la clé manquant : restaurer la sauvegarde de signature.' >&2; exit 1; }
cd "$repo_dir/mobile"
"$node_binary" node_modules/expo/bin/cli prebuild --platform android --no-install
python3 - "$repo_dir" "$ANDROID_HOME" <<'PY'
from pathlib import Path
import sys
repo=Path(sys.argv[1]);android=repo/'mobile/android'
(android/'local.properties').write_text('sdk.dir='+sys.argv[2]+'\n')
p=android/'app/build.gradle';s=p.read_text()
if 'signingConfigs.smartshopping' not in s:
 s=s.replace('    signingConfigs {', '''    signingConfigs {
        smartshopping {
            storeFile file(System.getenv('SMARTSHOPPING_SIGNING_FILE'))
            storePassword System.getenv('SMARTSHOPPING_SIGNING_PASSWORD')
            keyAlias 'smartshopping'
            keyPassword System.getenv('SMARTSHOPPING_SIGNING_PASSWORD')
        }''',1)
 pos=s.index('        release {')
 assert 'signingConfig signingConfigs.debug' in s[pos:], 'Unexpected release signing template'
 s=s[:pos]+s[pos:].replace('signingConfig signingConfigs.debug','signingConfig signingConfigs.smartshopping',1)
 p.write_text(s)
PY
export SMARTSHOPPING_SIGNING_FILE="$signing_dir/release.jks"
export SMARTSHOPPING_SIGNING_PASSWORD
SMARTSHOPPING_SIGNING_PASSWORD=$(cat "$signing_dir/password")
cd android
./gradlew --no-daemon --console=plain --max-workers=2 \
  '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m' \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a :app:assembleRelease
app_version=$("$node_binary" -p 'require("../app.json").expo.version')
output="$repo_dir/artifacts/android/smartshopping-$app_version-preview.apk"
cp app/build/outputs/apk/release/app-release.apk "$output"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "$output"
sha256sum "$output" > "$output.sha256"
printf '\nAPK prêt : %s\n' "$output"
