import gleam/option.{type Option, None, Some}
import rocksky_api/db/row
import rocksky_api/lexicon/models
import rocksky_api/schema/mirror_sources
import rocksky_api/tealfm/push_enabled

pub const providers = ["lastfm", "listenbrainz", "tealfm"]

pub fn empty(provider: String) -> models.MirrorSourceView {
  models.MirrorSourceView(provider, False, Some(True), None, False, None, None)
}

pub fn present(
  provider: String,
  source: Option(mirror_sources.MirrorSource),
  did: Option(String),
  disabled: String,
) -> models.MirrorSourceView {
  models.MirrorSourceView(
    provider: provider,
    enabled: option.map(source, fn(r) { r.enabled }) |> option.unwrap(False),
    push_enabled: Some(push_enabled.resolve(
      option.then(source, fn(r) { r.push_enabled }),
      did,
      disabled,
    )),
    external_username: option.then(source, fn(r) { r.external_username }),
    has_credentials: option.then(source, fn(r) { r.encrypted_api_key })
    |> option.unwrap("")
      != "",
    last_polled_at: option.then(source, fn(r) {
      row.optional_iso8601(r.last_polled_at)
    }),
    last_scrobble_seen_at: option.then(source, fn(r) {
      row.optional_iso8601(r.last_scrobble_seen_at)
    }),
  )
}
