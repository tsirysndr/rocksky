# Android release builds

Run EAS from `apps/app` within the full Rocksky repository. The app also needs
the source of its `../../sdk/typescript` dependency in the upload archive.

```sh
bunx eas-cli login
bunx eas-cli build --platform android --profile production
```

The production profile creates a signed Android App Bundle (`.aab`) for Play
Console and increments the remote Android version code. Use the existing app's
upload key when EAS configures signing. To download an installable APK for device
testing instead, use `--profile preview`.

EAS installs Rust 1.98.0 and cargo-ndk 4.1.2 through the pre-install hook. Gradle
then builds the Rust engine from source with `cargo build --release --locked`
through cargo-ndk, using NDK 27.1.12297006. ARM64 and x86_64 libraries are checked
for matching CPU architecture and 16 KB ELF segment alignment before packaging.
Missing Rust tools fail the build. Compiled libraries do not need to be uploaded.

The post-install hook bundles the sibling SDK's TypeScript runtime entries into
`.generated/rocksky-sdk`; Metro uses those generated entries for the release.

For a local native-engine check with the Android SDK/NDK installed:

```sh
bash scripts/eas-pre-install.sh
bun run build:engine:android
```

Set `ANDROID_NDK_HOME` if the NDK is installed in a nonstandard location. The
Rust module requires a native app build; it cannot run inside Expo Go.
