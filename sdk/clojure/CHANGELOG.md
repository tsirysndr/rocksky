# Changelog

All notable changes to the Rocksky Clojure SDK are documented here. This
project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

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
