# Rocksky Mobile App

Native [Expo](https://expo.dev) app for [Rocksky](https://rocksky.app), aligned with the [`web-mobile`](../web-mobile) app's features and design (same dark theme, same API surface).

## Screens

- **Home** — stories row, feed-generator genre chips, scrobble feed (infinite scroll, likes)
- **Alerts** — notifications with client-side grouping and an unread badge
- **Charts** — top tracks / top artists over a selectable time window
- **Search** — federated search across tracks, albums, artists, and users
- **Profile** — overview, library, followers/following, circles, loved tracks
- Album / artist / song detail pages, story viewer, shout editor
- **MiniPlayer** — live now-playing via the remote-control WebSocket plus Rockbox/Spotify polling

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
