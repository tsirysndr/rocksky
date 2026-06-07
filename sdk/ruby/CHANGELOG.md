# Changelog

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
