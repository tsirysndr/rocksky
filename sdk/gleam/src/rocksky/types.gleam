//// Public types returned by Rocksky endpoint functions.
////
//// Most types are lex-derived aliases — see `rocksky/generated/types`. A
//// handful (`ApiKey`, `Shout`) carry SDK-specific shapes that the lexicon
//// does not yet model and stay hand-written.

import gleam/option.{type Option}
import rocksky/generated/types as gen

pub type Profile =
  gen.ActorProfileViewBasic

pub type Artist =
  gen.ArtistViewBasic

pub type Album =
  gen.AlbumViewBasic

pub type Song =
  gen.SongViewBasic

pub type Scrobble =
  gen.ScrobbleViewBasic

pub type Listener =
  gen.SongRecentListenerView

pub type Stats =
  gen.StatsView

pub type ApiKey {
  ApiKey(
    id: Option(String),
    name: Option(String),
    description: Option(String),
    key: Option(String),
    created_at: Option(String),
  )
}

pub type Shout {
  Shout(
    id: Option(String),
    uri: Option(String),
    author_did: Option(String),
    author_handle: Option(String),
    author_avatar: Option(String),
    message: Option(String),
    created_at: Option(String),
    likes_count: Option(Int),
    replies_count: Option(Int),
    liked: Option(Bool),
  )
}
