# Android remote libraries

Rust clients for Navidrome/Subsonic, Jellyfin, Plex, Kodi and UPnP/DLNA.
The Expo `rocksky-engine` module exposes connection, discovery, browsing and
stream resolution through `remoteLibrary`. MPD is intentionally excluded.

Local music is the default library. Uploaded music remains available in the
library selector. Saved servers can be selected, edited or disconnected there.

## Connections

- Navidrome/Subsonic: server URL, username and password; salted Subsonic authentication.
- Jellyfin: server URL, username and password; authentication exchanges the password for a token.
- Plex: server URL and Plex token; supports selecting among music sections.
- Kodi: scan for advertised HTTP servers via Zeroconf/mDNS, or enter the HTTP URL and configured username/password. Enable HTTP remote control and service announcements in Kodi. Discovery uses the advertised port and does not guess credentials.
- UPnP/DLNA: discover media servers on the local network, or supply a device-description XML URL.

Credentials are encrypted with Android Keystore and stored in the app's
no-backup directory. JavaScript receives public connection details and temporary
media URLs. Persisted playback queues retain server/track IDs rather than these
URLs. Disconnecting a source removes its connection, not any server content.

UPnP search filters loaded entries; Plex search operates inside a music section.
Pagination loads more entries as needed. Play queues the currently loaded tracks.

## Validation

Always use release builds:

```sh
cargo test --release --locked --manifest-path native/libraries/Cargo.toml
bash scripts/build-android-test-release.sh
```

Run these commands from `apps/app`. The Android build script uses
`assembleRelease`, and its native build uses `cargo ndk build --release --locked`.
Protocol tests use local HTTP fixtures; actual server/device connectivity still
requires testing against the user's servers on their network.

Client implementations were informed by the sibling `music-player` and
`rockbox-zig` clients.
