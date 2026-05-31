//// `app.rocksky.like.*` — like / dislike songs and shouts.

import gleam/json
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Shout, type Song}

fn uri_body(uri: String) -> json.Json {
  json.object([#("uri", json.string(uri))])
}

/// `app.rocksky.like.likeSong` — like the song at `uri`.
pub fn like_song(uri uri: String) -> Request(Song) {
  rocksky.procedure("app.rocksky.like.likeSong", decoders.song())
  |> rocksky.body(uri_body(uri))
}

/// `app.rocksky.like.dislikeSong` — remove a like from the song at `uri`.
pub fn dislike_song(uri uri: String) -> Request(Song) {
  rocksky.procedure("app.rocksky.like.dislikeSong", decoders.song())
  |> rocksky.body(uri_body(uri))
}

/// `app.rocksky.like.likeShout` — like the shout at `uri`.
pub fn like_shout(uri uri: String) -> Request(Shout) {
  rocksky.procedure("app.rocksky.like.likeShout", decoders.shout())
  |> rocksky.body(uri_body(uri))
}

/// `app.rocksky.like.dislikeShout` — remove a like from the shout at `uri`.
pub fn dislike_shout(uri uri: String) -> Request(Shout) {
  rocksky.procedure("app.rocksky.like.dislikeShout", decoders.shout())
  |> rocksky.body(uri_body(uri))
}
