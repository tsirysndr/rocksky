# Changelog

All notable changes to the Rocksky Clojure SDK are documented here. This
project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added
- Remote-player protocol: now-playing maps accept optional audio info —
  `:codec` (audio codec/container, e.g. "mp3", "flac") and `:sampleRate`
  (sample rate in Hz, e.g. 44100). A player includes them in the `track`
  payload when set (`codec` / `sample_rate` on the wire, omitted otherwise); a
  controller's `:now-playing` event exposes them on the `"track"` map.

## [0.3.0] - 2026-06-07

### Added
- `feed/get-stories` now accepts optional `:feed` (at-uri) and `:following`
  (boolean) keys. `:feed` narrows results to scrobbles in that feed generator;
  `:following true` restricts to users the viewer follows and requires the
  client to be authenticated. Filters intersect when both are supplied.

## [0.2.0] - 2026-06-02

### Added
- Lexicon-derived malli schemas exposed as `rocksky.generated.types/schemas`.
  Every lex `*View*` / `*Record` / `*Input` / `*Output` / `*Params` shape is
  available as a keyword-keyed entry, regenerated from `apps/api/lexicons/` via
  `bun run lexgen:types` at the repo root.

## [0.1.0] - 2026-05-31

### Added
- Initial release.
- Core `rocksky.client` with `client`, `with-token`, `with-base-url`,
  `with-headers`, plus low-level `query` (GET) and `procedure` (POST).
- Resource namespaces wrapping every endpoint exposed by `apps/api`:
  `actor`, `album`, `apikey`, `artist`, `charts`, `dropbox`, `feed`,
  `googledrive`, `graph`, `like`, `mirror`, `player`, `playlist`,
  `scrobble`, `shout`, `song`, `spotify`, `stats`.
- `rocksky.core` facade re-exporting the most common ops.
- Seven runnable example scripts under `examples/`.
- 60-test / 143-assertion suite mocking the HTTP layer via `:http-fn`.
