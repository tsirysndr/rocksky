//// Ergonomic wrappers for the authenticated `app.rocksky.library.*` API
//// (uploaded music). Build a client once with `new` (or `with_base`) and pass
//// it to every call — the access token is bound in the client, not repeated:
////
////   let lib = library.new(token)
////   library.get_genres(lib)
////   library.get_song(lib, "{\"id\":\"<song-id>\"}")
////
//// Parameters are a pre-encoded JSON string (matching this SDK's `get`
//// convention). Each call returns the raw `{ok, value} | {error, message}`
//// envelope as `Dynamic` — decode with `gleam/dynamic`.

import gleam/dynamic.{type Dynamic}

/// An authenticated library client. Build it with [new](#new).
pub opaque type Library {
  Library(base: String, token: String)
}

/// Bind a (required, non-empty) access token; uses the default AppView URL.
pub fn new(token: String) -> Library {
  Library(base: "", token: token)
}

/// Bind a token and override the AppView base URL.
pub fn with_base(token: String, base: String) -> Library {
  Library(base: base, token: token)
}

@external(erlang, "rocksky", "library_get_raw")
fn library_get_ffi(
  base: String,
  token: String,
  nsid: String,
  params_json: String,
) -> Dynamic

@external(erlang, "rocksky", "library_post_raw")
fn library_post_ffi(
  base: String,
  token: String,
  nsid: String,
  body_json: String,
) -> Dynamic

/// Escape hatch — any authenticated library query by nsid (pre-encoded params).
pub fn library_get(client: Library, nsid: String, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, nsid, params_json)
}

/// Escape hatch — any authenticated library procedure by nsid (pre-encoded body).
pub fn library_post(client: Library, nsid: String, body_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, nsid, body_json)
}

/// `app.rocksky.library.ping`.
pub fn ping(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.ping", "{}")
}

/// `app.rocksky.library.getLicense`.
pub fn get_license(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getLicense", "{}")
}

/// `app.rocksky.library.getMusicFolders`.
pub fn get_music_folders(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getMusicFolders", "{}")
}

/// `app.rocksky.library.getScanStatus`.
pub fn get_scan_status(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getScanStatus", "{}")
}

/// `app.rocksky.library.startScan`.
pub fn start_scan(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.startScan", "{}")
}

/// `app.rocksky.library.getUser`.
pub fn get_user(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getUser", "{}")
}

/// `app.rocksky.library.getArtists`.
pub fn get_artists(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getArtists", "{}")
}

/// `app.rocksky.library.getIndexes`.
pub fn get_indexes(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getIndexes", "{}")
}

/// `app.rocksky.library.getArtist`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_artist(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getArtist", params_json)
}

/// `app.rocksky.library.getArtistInfo`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_artist_info(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getArtistInfo", params_json)
}

/// `app.rocksky.library.getAlbum`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_album(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getAlbum", params_json)
}

/// `app.rocksky.library.getAlbumList`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_album_list(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getAlbumList", params_json)
}

/// `app.rocksky.library.getAlbumInfo`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_album_info(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getAlbumInfo", params_json)
}

/// `app.rocksky.library.getSong`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_song(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getSong", params_json)
}

/// `app.rocksky.library.getRandomSongs`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_random_songs(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getRandomSongs", params_json)
}

/// `app.rocksky.library.getSongsByGenre`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_songs_by_genre(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getSongsByGenre", params_json)
}

/// `app.rocksky.library.getSimilarSongs`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_similar_songs(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getSimilarSongs", params_json)
}

/// `app.rocksky.library.getTopSongs`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_top_songs(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getTopSongs", params_json)
}

/// `app.rocksky.library.getLyrics`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_lyrics(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getLyrics", params_json)
}

/// `app.rocksky.library.getMusicDirectory`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_music_directory(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getMusicDirectory", params_json)
}

/// `app.rocksky.library.getGenres`.
pub fn get_genres(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getGenres", "{}")
}

/// `app.rocksky.library.search`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn search(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.search", params_json)
}

/// `app.rocksky.library.getStarred`.
pub fn get_starred(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getStarred", "{}")
}

/// `app.rocksky.library.star`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn star(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.star", params_json)
}

/// `app.rocksky.library.unstar`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn unstar(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.unstar", params_json)
}

/// `app.rocksky.library.getPlaylists`.
pub fn get_playlists(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getPlaylists", "{}")
}

/// `app.rocksky.library.getPlaylist`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_playlist(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getPlaylist", params_json)
}

/// `app.rocksky.library.createPlaylist`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn create_playlist(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.createPlaylist", params_json)
}

/// `app.rocksky.library.updatePlaylist`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn update_playlist(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.updatePlaylist", params_json)
}

/// `app.rocksky.library.deletePlaylist`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn delete_playlist(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.deletePlaylist", params_json)
}

/// `app.rocksky.library.deleteSong`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn delete_song(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.deleteSong", params_json)
}

/// `app.rocksky.library.deleteAlbum`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn delete_album(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.deleteAlbum", params_json)
}

/// `app.rocksky.library.scrobble`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn scrobble(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.scrobble", params_json)
}

/// `app.rocksky.library.updateNowPlaying`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn update_now_playing(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.updateNowPlaying", params_json)
}

/// `app.rocksky.library.getNowPlaying`.
pub fn get_now_playing(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getNowPlaying", "{}")
}

/// `app.rocksky.library.getPlayQueue`.
pub fn get_play_queue(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getPlayQueue", "{}")
}

/// `app.rocksky.library.savePlayQueue`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn save_play_queue(client: Library, params_json: String) -> Dynamic {
  library_post_ffi(client.base, client.token, "app.rocksky.library.savePlayQueue", params_json)
}

/// `app.rocksky.library.getStreamUrl`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_stream_url(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getStreamUrl", params_json)
}

/// `app.rocksky.library.getDownloadUrl`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_download_url(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getDownloadUrl", params_json)
}

/// `app.rocksky.library.getCoverArtUrl`. `params_json` is a pre-encoded JSON object
/// of the parameters.
pub fn get_cover_art_url(client: Library, params_json: String) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getCoverArtUrl", params_json)
}

/// `app.rocksky.library.getInternetRadioStations`.
pub fn get_internet_radio_stations(client: Library) -> Dynamic {
  library_get_ffi(client.base, client.token, "app.rocksky.library.getInternetRadioStations", "{}")
}
