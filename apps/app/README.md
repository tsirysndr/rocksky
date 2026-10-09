# Rocksky Mobile App

Native [Expo](https://expo.dev) app for [Rocksky](https://rocksky.app), aligned with the [`web-mobile`](../web-mobile) app's features and design (same dark theme, same API surface).

<a href="https://play.google.com/store/apps/details?id=app.rocksky">
  <img src="../landing/public/google-play-badge.png" alt="Get Rocksky on Google Play" width="200" />
</a>

## Screens

- **Home** — stories row, feed-generator genre chips, scrobble feed (infinite scroll, likes)
- **Alerts** — notifications with client-side grouping and an unread badge
- **Charts** — top tracks / top artists over a selectable time window
- **Search** — federated search across tracks, albums, artists, and users
- **Profile** — overview, library, followers/following, circles, loved tracks
- Album / artist / song detail pages, story viewer, shout editor
- **MiniPlayer** — live now-playing via the remote-control WebSocket plus Rockbox/Spotify polling
- **Library** — local files, uploaded music, and native Rust clients for Navidrome/Subsonic, Jellyfin, Plex, Kodi, and UPnP/DLNA. Remote libraries work without a Rocksky login.

Remote track menus include **Add to playlist**, targeting the connected server. The **Playlists** tab opens playlist management with pagination and cached queries. Search and tabs remain pinned; Play and Shuffle scroll with the content.

| Server | Playlist operations |
| --- | --- |
| Navidrome/Subsonic | Create, rename, delete, add/remove tracks, reorder; read-only and other users' playlists are excluded from the picker when identified by the server. |
| Jellyfin | Create, rename, delete, add/remove tracks, reorder, subject to the connected user's server permissions. |
| Plex | Create, rename, delete, add/remove tracks, reorder for regular audio playlists; smart playlists are excluded from the editor. |
| Kodi | Add, remove, reorder, and clear the current music playlist. Kodi's remote API does not save or rename playlist files. |
| UPnP/DLNA | Browse writable playlist containers; create, rename, delete, and add/remove references when the server advertises the corresponding ContentDirectory actions. Removing original media is blocked; reordering is unavailable. |

Playlist writes use the credentials stored on the device and update the server directly. Deleting a playlist requires confirmation. Track removal uses playlist-entry identifiers where available, preserving duplicate-song occurrences. Provider protocol tests use local mock servers; compatibility with individual server versions still requires device testing.

The **Search** tab also searches connected remote libraries using an on-device SQLite FTS5 index. Results include tracks, albums, artists, and playlists with their library names. Tap a track to play, use its bottom-sheet actions to queue it or add it to a server playlist, or open a matching album/artist/playlist to browse the server. The remote results list supports pagination and works without a Rocksky account. Uploaded music keeps its existing online search.

Indexing starts after connecting a server and checks for unfinished or stale indexes when the app opens or returns to the foreground. Rust uses a bounded Tokio blocking pool for the existing synchronous clients, fetches metadata in pages, and makes each completed page searchable. Successful refreshes remove stale entries; failed refreshes retain cached results. Indexes refresh after six hours or manually from Search → Remote libraries, with a five-minute retry cooldown after failures. The index is stored in Android's private no-backup directory; server credentials remain in the encrypted connection store and artwork authentication is reconstructed when reading results.

The worker runs while the app process is alive, including ordinary backgrounding. Android may terminate that process; the next foreground visit restarts the scan while retaining cached results. This is not a foreground service or a WorkManager job. Searching cached metadata works offline; streaming and browsing uncached server content still require a connection.

## Get started

1. Install dependencies

   ```bash
   bun install
   ```

2. Run on a device or simulator

   ```bash
   bun run ios
   bun run android
   ```

The `android/` and `ios/` directories are generated on demand (`expo prebuild`) and are not checked in — native config lives in `app.config.js`.

## Release builds

```bash
eas build --platform android --profile production
```

## Notes

- Sign-in uses the ATProto OAuth flow in an in-app WebView (`rocksky.pages.dev/loading?handle=…`); the resulting `did` is exchanged for a JWT via `GET /token` with the `session-did` header, stored in AsyncStorage. JWTs last 7 days.
- All data comes from `https://api.rocksky.app` (XRPC under `/xrpc/app.rocksky.*` plus a few REST endpoints). Notifications poll the unread count instead of using the web's SSE stream.
- Charts always send a `startDate`/`endDate` window: the server's all-time aggregate times out and returns empty lists.
- Uploaded-music playback (web-mobile's "My Library", rockbox-wasm) is not ported; it needs a native audio engine.
- App icons are copied from `../web-mobile/public` so native and PWA branding stay in sync.
