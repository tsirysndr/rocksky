//// Tests for the JSON decoders against representative lexicon shapes.

import gleam/json
import gleam/option.{None, Some}
import gleeunit/should
import rocksky/decoders
import rocksky/generated/types as gen

pub fn profile_decoder_full_test() {
  let body =
    "{
      \"id\": \"u_1\",
      \"did\": \"did:plc:abc\",
      \"handle\": \"alice.bsky.social\",
      \"displayName\": \"Alice\",
      \"avatar\": \"https://cdn.example/a.jpg\",
      \"createdAt\": \"2025-01-01T00:00:00Z\",
      \"updatedAt\": \"2025-06-01T00:00:00Z\"
    }"
  let assert Ok(p) = json.parse(body, decoders.profile())
  p
  |> should.equal(gen.ActorProfileViewBasic(
    id: Some("u_1"),
    did: Some("did:plc:abc"),
    handle: Some("alice.bsky.social"),
    display_name: Some("Alice"),
    avatar: Some("https://cdn.example/a.jpg"),
    created_at: Some("2025-01-01T00:00:00Z"),
    updated_at: Some("2025-06-01T00:00:00Z"),
  ))
}

pub fn profile_decoder_missing_fields_test() {
  let body = "{\"did\":\"did:plc:abc\"}"
  let assert Ok(p) = json.parse(body, decoders.profile())
  p.did
  |> should.equal(Some("did:plc:abc"))
  p.handle
  |> should.equal(None)
}

pub fn song_decoder_test() {
  let body =
    "{
      \"id\": \"s_1\",
      \"title\": \"Karma Police\",
      \"artist\": \"Radiohead\",
      \"album\": \"OK Computer\",
      \"duration\": 263000,
      \"trackNumber\": 6,
      \"tags\": [\"rock\", \"alternative\"]
    }"
  let assert Ok(s) = json.parse(body, decoders.song())
  s.title |> should.equal(Some("Karma Police"))
  s.artist |> should.equal(Some("Radiohead"))
  s.duration |> should.equal(Some(263_000))
  s.tags |> should.equal(["rock", "alternative"])
}

pub fn scrobble_decoder_test() {
  let body =
    "{
      \"id\": \"sc_1\",
      \"uri\": \"at://did:plc:abc/app.rocksky.scrobble/123\",
      \"user\": \"alice.bsky.social\",
      \"title\": \"Paranoid Android\",
      \"artist\": \"Radiohead\",
      \"liked\": true,
      \"likesCount\": 3
    }"
  let assert Ok(s) = json.parse(body, decoders.scrobble())
  s.liked |> should.equal(Some(True))
  s.likes_count |> should.equal(Some(3))
  s.title |> should.equal(Some("Paranoid Android"))
}

pub fn stats_decoder_test() {
  let body =
    "{
      \"scrobbles\": 1234,
      \"artists\": 89,
      \"lovedTracks\": 12,
      \"albums\": 56,
      \"tracks\": 321
    }"
  let assert Ok(s) = json.parse(body, decoders.stats())
  s
  |> should.equal(gen.StatsView(
    scrobbles: Some(1234),
    artists: Some(89),
    loved_tracks: Some(12),
    albums: Some(56),
    tracks: Some(321),
  ))
}

pub fn unwrap_decoder_test() {
  let body =
    "{
      \"songs\": [
        {\"title\": \"A\", \"artist\": \"X\"},
        {\"title\": \"B\", \"artist\": \"Y\"}
      ]
    }"
  let assert Ok(songs) =
    json.parse(body, decoders.unwrap("songs", decoders.song()))
  case songs {
    [a, b] -> {
      a.title |> should.equal(Some("A"))
      b.title |> should.equal(Some("B"))
    }
    _ -> should.fail()
  }
}

pub fn unwrap_missing_field_yields_empty_test() {
  // The endpoint occasionally returns `{}` when the wrapper key isn't present;
  // we want callers to get [] instead of a decode error.
  let assert Ok(songs) =
    json.parse("{}", decoders.unwrap("songs", decoders.song()))
  songs |> should.equal([])
}

