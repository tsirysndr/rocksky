//// Reusable `gleam/dynamic/decode` decoders for the public types in
//// `rocksky/types`. These are exposed so callers can also decode raw
//// `Dynamic` payloads themselves (e.g. embedded in custom responses).

import gleam/dynamic/decode.{type Decoder}
import gleam/option.{None, Some}
import rocksky/generated/types as gen
import rocksky/types.{type ApiKey, type Shout, ApiKey, Shout}

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

// ----- helpers --------------------------------------------------------------

fn opt_string(name: String) -> Decoder(option.Option(String)) {
  decode.optional_field(
    name,
    None,
    decode.map(decode.string, Some),
    decode.success,
  )
}

fn opt_int(name: String) -> Decoder(option.Option(Int)) {
  decode.optional_field(
    name,
    None,
    decode.map(decode.int, Some),
    decode.success,
  )
}

fn opt_bool(name: String) -> Decoder(option.Option(Bool)) {
  decode.optional_field(
    name,
    None,
    decode.map(decode.bool, Some),
    decode.success,
  )
}

fn string_list(name: String) -> Decoder(List(String)) {
  decode.optional_field(name, [], decode.list(decode.string), decode.success)
}

// ----- decoders -------------------------------------------------------------

pub fn profile() -> Decoder(Profile) {
  use id <- decode.then(opt_string("id"))
  use did <- decode.then(opt_string("did"))
  use handle <- decode.then(opt_string("handle"))
  use display_name <- decode.then(opt_string("displayName"))
  use avatar <- decode.then(opt_string("avatar"))
  use created_at <- decode.then(opt_string("createdAt"))
  use updated_at <- decode.then(opt_string("updatedAt"))
  decode.success(gen.ActorProfileViewBasic(
    id: id,
    did: did,
    handle: handle,
    display_name: display_name,
    avatar: avatar,
    created_at: created_at,
    updated_at: updated_at,
  ))
}

pub fn artist() -> Decoder(Artist) {
  use id <- decode.then(opt_string("id"))
  use uri <- decode.then(opt_string("uri"))
  use name <- decode.then(opt_string("name"))
  use picture <- decode.then(opt_string("picture"))
  use sha256 <- decode.then(opt_string("sha256"))
  use play_count <- decode.then(opt_int("playCount"))
  use unique_listeners <- decode.then(opt_int("uniqueListeners"))
  use tags <- decode.then(string_list("tags"))
  decode.success(gen.ArtistViewBasic(
    id: id,
    uri: uri,
    name: name,
    picture: picture,
    sha256: sha256,
    play_count: play_count,
    unique_listeners: unique_listeners,
    tags: tags,
  ))
}

pub fn album() -> Decoder(Album) {
  use id <- decode.then(opt_string("id"))
  use uri <- decode.then(opt_string("uri"))
  use title <- decode.then(opt_string("title"))
  use art_name <- decode.then(opt_string("artist"))
  use artist_uri <- decode.then(opt_string("artistUri"))
  use year <- decode.then(opt_int("year"))
  use album_art <- decode.then(opt_string("albumArt"))
  use release_date <- decode.then(opt_string("releaseDate"))
  use sha256 <- decode.then(opt_string("sha256"))
  use play_count <- decode.then(opt_int("playCount"))
  use unique_listeners <- decode.then(opt_int("uniqueListeners"))
  decode.success(gen.AlbumViewBasic(
    id: id,
    uri: uri,
    title: title,
    artist: art_name,
    artist_uri: artist_uri,
    year: year,
    album_art: album_art,
    release_date: release_date,
    sha256: sha256,
    play_count: play_count,
    unique_listeners: unique_listeners,
  ))
}

pub fn song() -> Decoder(Song) {
  use id <- decode.then(opt_string("id"))
  use uri <- decode.then(opt_string("uri"))
  use title <- decode.then(opt_string("title"))
  use art_name <- decode.then(opt_string("artist"))
  use album_artist <- decode.then(opt_string("albumArtist"))
  use album <- decode.then(opt_string("album"))
  use album_art <- decode.then(opt_string("albumArt"))
  use album_uri <- decode.then(opt_string("albumUri"))
  use artist_uri <- decode.then(opt_string("artistUri"))
  use duration <- decode.then(opt_int("duration"))
  use track_number <- decode.then(opt_int("trackNumber"))
  use disc_number <- decode.then(opt_int("discNumber"))
  use play_count <- decode.then(opt_int("playCount"))
  use unique_listeners <- decode.then(opt_int("uniqueListeners"))
  use sha256 <- decode.then(opt_string("sha256"))
  use mbid <- decode.then(opt_string("mbid"))
  use isrc <- decode.then(opt_string("isrc"))
  use tags <- decode.then(string_list("tags"))
  use created_at <- decode.then(opt_string("createdAt"))
  decode.success(gen.SongViewBasic(
    id: id,
    uri: uri,
    title: title,
    artist: art_name,
    album_artist: album_artist,
    album: album,
    album_art: album_art,
    album_uri: album_uri,
    artist_uri: artist_uri,
    duration: duration,
    track_number: track_number,
    disc_number: disc_number,
    play_count: play_count,
    unique_listeners: unique_listeners,
    sha256: sha256,
    mbid: mbid,
    isrc: isrc,
    tags: tags,
    created_at: created_at,
  ))
}

pub fn scrobble() -> Decoder(Scrobble) {
  use id <- decode.then(opt_string("id"))
  use uri <- decode.then(opt_string("uri"))
  use user <- decode.then(opt_string("user"))
  use user_display_name <- decode.then(opt_string("userDisplayName"))
  use user_avatar <- decode.then(opt_string("userAvatar"))
  use title <- decode.then(opt_string("title"))
  use art_name <- decode.then(opt_string("artist"))
  use artist_uri <- decode.then(opt_string("artistUri"))
  use album <- decode.then(opt_string("album"))
  use album_uri <- decode.then(opt_string("albumUri"))
  use cover <- decode.then(opt_string("cover"))
  use date <- decode.then(opt_string("date"))
  use sha256 <- decode.then(opt_string("sha256"))
  use liked <- decode.then(opt_bool("liked"))
  use likes_count <- decode.then(opt_int("likesCount"))
  decode.success(gen.ScrobbleViewBasic(
    id: id,
    uri: uri,
    user: user,
    user_display_name: user_display_name,
    user_avatar: user_avatar,
    title: title,
    artist: art_name,
    artist_uri: artist_uri,
    album: album,
    album_uri: album_uri,
    cover: cover,
    date: date,
    sha256: sha256,
    liked: liked,
    likes_count: likes_count,
  ))
}

pub fn listener() -> Decoder(Listener) {
  use id <- decode.then(opt_string("id"))
  use did <- decode.then(opt_string("did"))
  use handle <- decode.then(opt_string("handle"))
  use display_name <- decode.then(opt_string("displayName"))
  use avatar <- decode.then(opt_string("avatar"))
  use timestamp <- decode.then(opt_string("timestamp"))
  use scrobble_uri <- decode.then(opt_string("scrobbleUri"))
  decode.success(gen.SongRecentListenerView(
    id: id,
    did: did,
    handle: handle,
    display_name: display_name,
    avatar: avatar,
    timestamp: timestamp,
    scrobble_uri: scrobble_uri,
  ))
}

pub fn stats() -> Decoder(Stats) {
  use scrobbles <- decode.then(opt_int("scrobbles"))
  use artists <- decode.then(opt_int("artists"))
  use loved_tracks <- decode.then(opt_int("lovedTracks"))
  use albums <- decode.then(opt_int("albums"))
  use tracks <- decode.then(opt_int("tracks"))
  decode.success(gen.StatsView(
    scrobbles: scrobbles,
    artists: artists,
    loved_tracks: loved_tracks,
    albums: albums,
    tracks: tracks,
  ))
}

pub fn api_key() -> Decoder(ApiKey) {
  use id <- decode.then(opt_string("id"))
  use name <- decode.then(opt_string("name"))
  use description <- decode.then(opt_string("description"))
  use key <- decode.then(opt_string("key"))
  use created_at <- decode.then(opt_string("createdAt"))
  decode.success(ApiKey(
    id: id,
    name: name,
    description: description,
    key: key,
    created_at: created_at,
  ))
}

pub fn shout() -> Decoder(Shout) {
  use id <- decode.then(opt_string("id"))
  use uri <- decode.then(opt_string("uri"))
  use author_did <- decode.then(opt_string("authorDid"))
  use author_handle <- decode.then(opt_string("authorHandle"))
  use author_avatar <- decode.then(opt_string("authorAvatar"))
  use message <- decode.then(opt_string("message"))
  use created_at <- decode.then(opt_string("createdAt"))
  use likes_count <- decode.then(opt_int("likesCount"))
  use replies_count <- decode.then(opt_int("repliesCount"))
  use liked <- decode.then(opt_bool("liked"))
  decode.success(Shout(
    id: id,
    uri: uri,
    author_did: author_did,
    author_handle: author_handle,
    author_avatar: author_avatar,
    message: message,
    created_at: created_at,
    likes_count: likes_count,
    replies_count: replies_count,
    liked: liked,
  ))
}

/// Convenience: decode an object whose `key` field is a list of `inner`.
pub fn list_in_field(
  key: String,
  inner: Decoder(a),
) -> Decoder(List(a)) {
  decode.optional_field(key, [], decode.list(inner), decode.success)
}

/// Decode `{ items: [...] }`-shaped responses into a list of items.
/// Many Rocksky list endpoints wrap their array in a single object field
/// (e.g. `{ "scrobbles": [...] }`, `{ "songs": [...] }`). This helper hides
/// that detail from callers that just want the list.
pub fn unwrap(
  field_name: String,
  inner: Decoder(a),
) -> Decoder(List(a)) {
  decode.optional_field(field_name, [], decode.list(inner), decode.success)
}
