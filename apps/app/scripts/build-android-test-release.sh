#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$app_dir"
export ROCKSKY_VARIANT=test
node node_modules/expo/bin/cli prebuild --platform android --no-install
cd android
# buildRustEngine remains a preBuild dependency and uses --release --locked.
./gradlew :app:assembleRelease -PreactNativeArchitectures="${ROCKSKY_TEST_ABIS:-arm64-v8a}" "$@"
echo "Rocksky Test APK: $app_dir/android/app/build/outputs/apk/release/app-release.apk"
