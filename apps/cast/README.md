# Rocksky Cast receiver

A custom Google Cast TV receiver built with Vite, React and Tailwind, using the Android app's Rockford Sans fonts. The Android sender uses application ID **833D8703** (override with `GOOGLE_CAST_RECEIVER_APP_ID` at build time).

## Preview

From the repository root, install dependencies with `bun install`, then:

```sh
cd apps/cast
bun run storybook
```

Open http://localhost:6008. Stories cover uploaded/local playback, pause, buffering, idle, missing/broken artwork, long metadata, empty queue, errors and 720p screens. Playback controls in stories update the mock state; they do not play audio.

For the standalone preview:

```sh
bun run dev
```

Open http://localhost:5178/?preview (or `?preview=idle`). Without the preview query the page starts the Google Cast receiver runtime and expects a Chromecast.

## Production setup

1. Run `bun run build` in this directory. Host the contents of `dist/` on an HTTPS URL accessible to your Chromecast. Keep the Google-hosted Cast framework script in `index.html`.
2. In the [Google Cast SDK Developer Console](https://cast.google.com/publish/), set application **833D8703** to use this receiver URL. Register test Chromecast devices while the application is unpublished; publish the receiver registration for general use.
3. Build a new Android native app (`expo prebuild` / EAS); Expo Go and previously installed binaries do not contain the Cast SDK or local-file server.
4. Select **This Device** in Rocksky's source picker. Only this selection exposes the Chromecast option. Connect to your receiver; the phone's current mixed local/uploaded queue transfers to Cast. Existing playback and notification controls then control that session. Stop casting returns to the phone with playback paused.

Local files are served from the phone's Wi-Fi/Ethernet IPv4 address using unguessable per-file URLs, range requests and CORS. Keep the phone and Chromecast on the same network without client isolation. A foreground service holds wake/Wi-Fi locks while local files are shared and releases them when the Cast session ends. Force-stopping the app or removing network connectivity interrupts local streaming. No directory is exposed.

Uploaded files use scoped opaque stream tokens, never the user's sign-in JWT. Deploy the accompanying API change to enable the `purpose=cast` 24-hour token lifetime (older APIs retain their one-hour lifetime). URLs for other sources must also be directly accessible from the Chromecast.

Queue startup resolves and loads only the selected track. The sender adds the next track first, then fills the remaining queue in batches of at most five, with a 250 ms pause between batches. Earlier tracks are inserted before the selected item to preserve queue order. Replacing, skipping, stopping, or disconnecting cancels stale preparation; transport controls do not wait for background metadata requests. Token and missing-MIME HTTP requests share a single request lane, spaced at least one second apart, and respect `Retry-After` or the API's `X-RateLimit-Reset` TTL on HTTP 429. Known MIME types and cached tokens need no per-track HTTP lookup.

The receiver does not transcode. Playback depends on the target device's [supported audio codecs](https://developers.google.com/cast/docs/media). Unsupported formats may need conversion. Receiver hosting/registration and playback on real Cast hardware still require verification; the repository checks cover the native server, sender queue and receiver build/state parsing.

## Web sender

In the web app, play an uploaded/library track on **This Device**, then choose **Chromecast** from the player's source picker. The option appears when the browser's Cast SDK discovers a receiver and This Device is selected. Existing miniplayer, fullscreen, keyboard, queue, and media-session controls target the selected TV. Choose **Stop casting** to return to paused local playback.

The web sender uses receiver `833D8703` by default (`VITE_GOOGLE_CAST_RECEIVER_APP_ID` overrides it). Serve the app over HTTPS, or localhost for development, in a browser supported by the [Google Cast Web Sender SDK](https://developers.google.com/cast/docs/web_sender/integrate). It loads the selected track first and fills the remaining queue in small background batches. Its token and MIME requests share the Android sender's request-pacing implementation in `apps/shared/castRequests.ts`. Uploaded stream URLs carry scoped streaming tokens; they never fall back to the account sign-in JWT.

Sender regression tests: `bun test ./src/lib/audio/cast-player.test.ts` from `apps/web`.

## Checks

```sh
bun run test
bun run build
bun run build-storybook
```

The Android module has JUnit HTTP/range tests (`:rocksky-cast:testDebugUnitTest`). The app's sender and request-pacing tests run with `bun test ./src/lib/castPlayback.test.ts ./src/lib/castRequests.test.ts` from `apps/app`.

## Preview artwork

Storybook uses real metadata and album covers from the Apple Music catalog, stored locally so previews work without external image requests. Artwork belongs to its respective rights holders; these fixtures are for UI previews, not bundled audio:

- [Daft Punk — Get Lucky](https://music.apple.com/us/album/get-lucky/617154241?i=617154366)
- [Tame Impala — Let It Happen](https://music.apple.com/us/album/let-it-happen/1440838039?i=1440838060)
- [The Weeknd — Out of Time](https://music.apple.com/us/album/out-of-time/1603171516?i=1603171870)
- [Gorillaz — On Melancholy Hill](https://music.apple.com/us/album/on-melancholy-hill/850569437?i=850569480)

No-artwork and failed-image states use a CSS gradient/vinyl illustration.
