//// Infer current playback from timestamped submissions, never offline history.

import gleam/json
import gleam/option.{None, Some}
import rocksky_api/lib/track.{type Track}

pub fn event(did: String, track: Track, now: Int) {
  case track.timestamp {
    Some(timestamp)
      if timestamp > 0
      && track.duration > 0
      && timestamp * 1000 <= now
      && timestamp * 1000 + track.duration > now
    ->
      Some(
        json.object([
          #("did", json.string(did)),
          #(
            "track",
            json.object([
              #("name", json.string(track.title)),
              #("artist", json.string(track.artist)),
              #("album", json.string(track.album)),
              #("albumCoverUrl", json.nullable(track.album_art, json.string)),
              #("duration_ms", json.int(track.duration)),
              #("started_at", json.int(timestamp * 1000)),
              #("source", json.string("scrobble")),
            ]),
          ),
        ]),
      )
    _ -> None
  }
}
