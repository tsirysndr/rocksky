//// Typed decoders for the JSON payload inside native write result envelopes.

import gleam/dynamic/decode
import gleam/option.{type Option}

/// Server-reported record-write points. Reset time is Unix epoch seconds.
pub type PdsWriteRateLimit {
  PdsWriteRateLimit(limit: Int, remaining: Int, reset_at: Int, policy: String)
}

pub type RecordWriteResult {
  RecordWriteResult(
    uri: String,
    pds_write_rate_limit: Option(PdsWriteRateLimit),
    written: Bool,
  )
}

pub type ScrobbleResult {
  ScrobbleResult(
    artist_uri: String,
    album_uri: String,
    song_uri: String,
    scrobble_uri: String,
    pds_write_rate_limit: Option(PdsWriteRateLimit),
    written: Bool,
  )
}

pub fn pds_write_rate_limit_decoder() -> decode.Decoder(PdsWriteRateLimit) {
  use limit <- decode.field("limit", decode.int)
  use remaining <- decode.field("remaining", decode.int)
  use reset_at <- decode.field("resetAt", decode.int)
  use policy <- decode.field("policy", decode.string)
  decode.success(PdsWriteRateLimit(limit:, remaining:, reset_at:, policy:))
}

pub fn record_write_result_decoder() -> decode.Decoder(RecordWriteResult) {
  use uri <- decode.field("uri", decode.string)
  use pds_write_rate_limit <- decode.field(
    "pdsWriteRateLimit",
    decode.optional(pds_write_rate_limit_decoder()),
  )
  use written <- decode.field("written", decode.bool)
  decode.success(RecordWriteResult(uri:, pds_write_rate_limit:, written:))
}

pub fn scrobble_result_decoder() -> decode.Decoder(ScrobbleResult) {
  use artist_uri <- decode.field("artistUri", decode.string)
  use album_uri <- decode.field("albumUri", decode.string)
  use song_uri <- decode.field("songUri", decode.string)
  use scrobble_uri <- decode.field("scrobbleUri", decode.string)
  use pds_write_rate_limit <- decode.field(
    "pdsWriteRateLimit",
    decode.optional(pds_write_rate_limit_decoder()),
  )
  use written <- decode.field("written", decode.bool)
  decode.success(ScrobbleResult(
    artist_uri:,
    album_uri:,
    song_uri:,
    scrobble_uri:,
    pds_write_rate_limit:,
    written:,
  ))
}
