import gleam/javascript/promise
import gleam/option.{None, Some}
import rocksky_api/lib/durable_submission as ds
import rocksky_api/lib/track.{type Track, Track}

fn track() -> Track {
  Track(
    title: "September",
    artist: "Earth, Wind & Fire",
    artists: None,
    album: "The Best",
    album_artist: "Earth, Wind & Fire",
    duration: 215_000,
    mb_id: None,
    isrc: None,
    album_art: None,
    track_number: None,
    release_date: Some("1978-11-18"),
    year: None,
    disc_number: None,
    lyrics: None,
    composer: None,
    copyright_message: None,
    label: None,
    artist_picture: None,
    spotify_link: None,
    lastfm_link: None,
    youtube_link: None,
    tidal_link: None,
    apple_music_link: None,
    deezer_link: None,
    timestamp: Some(1_780_000_000),
    genres: None,
  )
}

pub fn idempotency_key_is_stable_and_scoped_test() {
  let t = track()
  let a = ds.idempotency_key("did:plc:a", t, None)
  assert a == ds.idempotency_key("did:plc:a", t, None)
  assert a != ds.idempotency_key("did:plc:b", t, None)
  assert a
    != ds.idempotency_key(
      "did:plc:a",
      Track(..t, timestamp: Some(1_780_000_300)),
      None,
    )
}

pub fn explicit_key_wins_test() {
  assert ds.idempotency_key(
      "did:plc:a",
      Track(..track(), timestamp: None),
      Some("client-key"),
    )
    == "client-key"
}

pub fn record_key_test() {
  assert ds.record_key("3mv234567abcd") == Ok("3mv234567abcd")
  assert ds.record_key("../../untrusted") |> is_error
}

fn is_error(r: Result(a, b)) -> Bool {
  case r {
    Ok(_) -> False
    Error(_) -> True
  }
}

pub fn valid_secret_test() {
  let secret = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  assert ds.valid_secret(Some(secret), secret)
  assert ds.valid_secret(Some(""), "") == False
  assert ds.valid_secret(None, secret) == False
  assert ds.valid_secret(Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), secret)
    == False
}

pub fn unconfigured_queue_rejects_test() {
  use result <- promise.map(ds.enqueue(
    ds.Config("", ""),
    "did:plc:a",
    track(),
    None,
    False,
  ))
  assert is_error(result)
}
