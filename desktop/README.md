# Rocksky Desktop

A Tauri desktop player for [Rocksky](https://rocksky.app), built on the
official Rust SDK ([`rocksky-sdk`](https://crates.io/crates/rocksky-sdk)) and
the [`rockbox-playback`](https://crates.io/crates/rockbox-playback) engine
(Rockbox codecs + DSP: gapless, crossfade, ReplayGain, 10-band EQ).

## What it does

- **Remote control** — registers as a remotely controllable Rocksky player
  (shown as *“\<name\> (Desktop)”* in the miniplayer device picker; the name is
  configurable in Settings). Controllers can play/pause/seek, jump the queue,
  and enqueue uploaded tracks, which stream through the uploads endpoint.
- **Media cache** — remote tracks are cached on disk (same scheme as the
  rocksky CLI: keyed by upload id, oldest-evicted past the cap). Enable/disable,
  size limit, usage, and clearing are all in the Settings panel.
- **AppView reads** — the sidebar shows the live global scrobble feed via
  `rocksky-sdk`'s `AppView` client.

## Development

```sh
bun install        # from the repo root (workspace) or this directory
bun run tauri dev  # run the app with hot reload
bun run tauri build  # produce installers/bundles
```

The Rust crate lives in `src-tauri/` as a **standalone cargo workspace** (the
Tauri dependency tree conflicts with the repo root workspace's pgrx pins) and
depends on `crates/rocksky-sdk` by path (same version as crates.io).

The frontend mirrors the web app's stack: React + TanStack react-query, jotai,
Base Web (baseui + styletron), and Emotion styled components.

## Remote registration

Paste a Rocksky access token (Settings → Access tokens on rocksky.app) into
the Settings panel and hit *Register as remote player*. The player name
defaults to “Rocksky” and always registers with a “(Desktop)” suffix.
