# Changelog

## 0.10.0

- Remote-player protocol: now-playing records accept optional audio info —
  `codec` (audio codec/container, e.g. "mp3", "flac") and `sampleRate` (sample
  rate in Hz, e.g. 44100). A player includes them in the `track` payload when
  set (`codec` / `sample_rate` on the wire, omitted otherwise); a controller's
  `:now_playing` event exposes them on the `:track` hash.

## 0.9.1

- Fix a segfault when tearing down a `RemotePlayer` / `RemoteController`.
  `#close` freed the native handle while the `#listen` background thread was
  still blocked inside `#next_command` / `#next_event` (a use-after-free). It now
  stops the background task and **joins** the listen thread — so the poll has
  returned — before freeing. `#next_command` / `#next_event` also no-op once the
  handle is released.

## 0.3.0

- `feed.get_stories` now accepts optional `feed:` (at-uri) and `following:`
  (boolean) kwargs. `feed:` narrows results to scrobbles in that feed
  generator; `following: true` restricts to users the viewer follows and
  requires an authenticated client. Filters intersect when both are supplied.

## 0.2.0

- Added lexicon-derived `Struct`s under `Rocksky::Generated::*` covering every
  lex `*View*` / `*Record` / `*Input` / `*Output` / `*Params` shape. Generated
  from `apps/api/lexicons/` via `bun run lexgen:types` at the repo root.

## 0.1.0

- Initial release. Coverage for all `app.rocksky.*` XRPC endpoints across the
  actor, album, apikey, artist, charts, feed, graph, like, mirror, player,
  playlist, scrobble, shout, song, spotify, and stats namespaces.
- `rocksky-console` and `bin/console` IRB entrypoints.
