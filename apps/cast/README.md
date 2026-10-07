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

The receiver does not transcode. Playback depends on the target device's [supported audio codecs](https://developers.google.com/cast/docs/media). Unsupported formats may need conversion. Receiver hosting/registration and playback on real Cast hardware still require verification; the repository checks cover the native server, sender queue and receiver build/state parsing.

## Checks

```sh
bun run test
bun run build
bun run build-storybook
```

The Android module has JUnit HTTP/range tests (`:rocksky-cast:testDebugUnitTest`). The app's sender test runs with `bun test ./src/lib/castPlayback.test.ts` from `apps/app`.

## Preview artwork

Storybook uses real metadata and album covers from the Apple Music catalog, stored locally so previews work without external image requests. Artwork belongs to its respective rights holders; these fixtures are for UI previews, not bundled audio:

- [Daft Punk — Get Lucky](https://music.apple.com/us/album/get-lucky/617154241?i=617154366)
- [Tame Impala — Let It Happen](https://music.apple.com/us/album/let-it-happen/1440838039?i=1440838060)
- [The Weeknd — Out of Time](https://music.apple.com/us/album/out-of-time/1603171516?i=1603171870)
- [Gorillaz — On Melancholy Hill](https://music.apple.com/us/album/on-melancholy-hill/850569437?i=850569480)

No-artwork and failed-image states use a CSS gradient/vinyl illustration.
