//// Public types returned by Rocksky endpoint functions.
////
//// These mirror the lexicon `*ViewBasic` / `*ViewDetailed` shapes. Optional
//// lexicon properties (anything not marked `required`) are `Option(t)` here.

import gleam/option.{type Option}

pub type Profile {
  Profile(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    created_at: Option(String),
    updated_at: Option(String),
  )
}

pub type Artist {
  Artist(
    id: Option(String),
    uri: Option(String),
    name: Option(String),
    picture: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    tags: List(String),
  )
}

pub type Album {
  Album(
    id: Option(String),
    uri: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    year: Option(Int),
    album_art: Option(String),
    release_date: Option(String),
    sha256: Option(String),
    play_count: Option(Int),
    unique_listeners: Option(Int),
  )
}

pub type Song {
  Song(
    id: Option(String),
    uri: Option(String),
    title: Option(String),
    artist: Option(String),
    album_artist: Option(String),
    album: Option(String),
    album_art: Option(String),
    album_uri: Option(String),
    artist_uri: Option(String),
    duration: Option(Int),
    track_number: Option(Int),
    disc_number: Option(Int),
    play_count: Option(Int),
    unique_listeners: Option(Int),
    sha256: Option(String),
    mbid: Option(String),
    isrc: Option(String),
    tags: List(String),
    created_at: Option(String),
  )
}

pub type Scrobble {
  Scrobble(
    id: Option(String),
    uri: Option(String),
    user: Option(String),
    user_display_name: Option(String),
    user_avatar: Option(String),
    title: Option(String),
    artist: Option(String),
    artist_uri: Option(String),
    album: Option(String),
    album_uri: Option(String),
    cover: Option(String),
    date: Option(String),
    sha256: Option(String),
    liked: Option(Bool),
    likes_count: Option(Int),
  )
}

pub type Listener {
  Listener(
    id: Option(String),
    did: Option(String),
    handle: Option(String),
    display_name: Option(String),
    avatar: Option(String),
    timestamp: Option(String),
    scrobble_uri: Option(String),
  )
}

pub type Stats {
  Stats(
    scrobbles: Option(Int),
    artists: Option(Int),
    loved_tracks: Option(Int),
    albums: Option(Int),
    tracks: Option(Int),
  )
}

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
