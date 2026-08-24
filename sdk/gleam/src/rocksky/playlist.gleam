//// `app.rocksky.playlist.*` — the global, AT-Proto-backed playlists.
////
//// Distinct from `rocksky/library`, whose playlist functions drive the
//// Subsonic/Navidrome library (`app.rocksky.library.*`).
////
//// Writes publish records to the caller's repo, so they take a token and only
//// appear in reads once the AppView has ingested the commit. Pass `""` to omit
//// an optional argument.

import gleam/dynamic.{type Dynamic}

@external(erlang, "rocksky", "playlists")
fn playlists_ffi(base: String, limit: Int, offset: Int) -> Dynamic

/// The playlist catalog.
pub fn list(limit: Int, offset: Int) -> Dynamic {
  playlists_ffi("", limit, offset)
}

/// [list](#list) against a custom AppView endpoint.
pub fn list_at(base: String, limit: Int, offset: Int) -> Dynamic {
  playlists_ffi(base, limit, offset)
}

@external(erlang, "rocksky", "playlist")
fn playlist_ffi(base: String, uri: String) -> Dynamic

/// A single playlist with its tracks.
pub fn get(uri: String) -> Dynamic {
  playlist_ffi("", uri)
}

/// [get](#get) against a custom AppView endpoint.
pub fn get_at(base: String, uri: String) -> Dynamic {
  playlist_ffi(base, uri)
}

@external(erlang, "rocksky", "create_playlist")
fn create_playlist_ffi(
  base: String,
  token: String,
  name: String,
  description: String,
  picture_url: String,
) -> Dynamic

/// Create a playlist. Returns the new record's `uri` and `cid`.
pub fn create(token: String, name: String) -> Dynamic {
  create_playlist_ffi("", token, name, "", "")
}

/// [create](#create) with a description, cover image and custom endpoint.
pub fn create_full(
  base: String,
  token: String,
  name: String,
  description: String,
  picture_url: String,
) -> Dynamic {
  create_playlist_ffi(base, token, name, description, picture_url)
}

@external(erlang, "rocksky", "update_playlist")
fn update_playlist_ffi(
  base: String,
  token: String,
  uri: String,
  name: String,
  description: String,
  picture_url: String,
) -> Dynamic

/// Rename or re-describe a playlist. Owner only; the AT-URI is unchanged.
pub fn update(
  base: String,
  token: String,
  uri: String,
  name: String,
  description: String,
  picture_url: String,
) -> Dynamic {
  update_playlist_ffi(base, token, uri, name, description, picture_url)
}

@external(erlang, "rocksky", "add_songs_to_playlist")
fn add_songs_ffi(
  base: String,
  token: String,
  uri: String,
  songs: List(String),
) -> Dynamic

/// Add songs by their `app.rocksky.song` AT-URIs. Owner only.
pub fn add_songs(token: String, uri: String, songs: List(String)) -> Dynamic {
  add_songs_ffi("", token, uri, songs)
}

/// [add_songs](#add_songs) against a custom AppView endpoint.
pub fn add_songs_at(
  base: String,
  token: String,
  uri: String,
  songs: List(String),
) -> Dynamic {
  add_songs_ffi(base, token, uri, songs)
}

@external(erlang, "rocksky", "remove_playlist_track")
fn remove_track_ffi(
  base: String,
  token: String,
  uri: String,
  song_uri: String,
) -> Dynamic

/// Remove a song. Only the repo that added an entry can retract it.
pub fn remove_track(token: String, uri: String, song_uri: String) -> Dynamic {
  remove_track_ffi("", token, uri, song_uri)
}

@external(erlang, "rocksky", "remove_playlist")
fn remove_playlist_ffi(base: String, token: String, uri: String) -> Dynamic

/// Delete a playlist and the caller's own entries. Owner only.
pub fn remove(token: String, uri: String) -> Dynamic {
  remove_playlist_ffi("", token, uri)
}

@external(erlang, "rocksky", "post_raw")
fn post_raw_ffi(
  base: String,
  nsid: String,
  params_json: String,
  token: String,
) -> Dynamic

/// Escape hatch — any `app.rocksky.*` procedure whose arguments ride the query
/// string. `params_json` is a pre-encoded JSON object.
pub fn post(nsid: String, params_json: String, token: String) -> Dynamic {
  post_raw_ffi("", nsid, params_json, token)
}
