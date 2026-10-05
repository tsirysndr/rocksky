# Rocksky Test release

Use `ROCKSKY_VARIANT=test` to generate the separate application ID
`app.rocksky.test`, display name **Rocksky Test**, and `rocksky-test` URL scheme.
Omitting the variable retains the production identity `app.rocksky`.

```sh
bash scripts/build-android-test-release.sh
cd android
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell am start -n app.rocksky.test/.MainActivity
```

The existing Rust Gradle task always invokes `cargo ndk ... build --release
--locked` for both supported engine ABIs. Do not replace it with a debug Cargo
build. The APK includes its JavaScript bundle and works without Metro.
The identity plugin invalidates stale React Native autolinking metadata when
switching package names, so the generated entry point uses the right BuildConfig.

This local release uses the project's existing local signing configuration,
not the Play Store signing key. The separate package can coexist with production;
it has separate login, notification access, and application data.

To return generated Android files to the production identity, rerun prebuild
without `ROCKSKY_VARIANT`. Never install the test APK over the production package.
