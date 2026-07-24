//// Ergonomic wrappers for the authenticated `app.rocksky.library.*` API
//// (uploaded music). Every function requires a non-empty `token`; parameters
//// are passed as a pre-encoded JSON string (matching this SDK's `get`
//// convention). Each returns the raw `{ok, value} | {error, message}`
//// envelope as `Dynamic` — decode with `gleam/dynamic`.

import gleam/dynamic.{type Dynamic}

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
pub fn library_get(token: String, nsid: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, nsid, params_json)
}

/// Escape hatch — any authenticated library procedure by nsid (pre-encoded body).
pub fn library_post(token: String, nsid: String, body_json: String) -> Dynamic {
  library_post_ffi("", token, nsid, body_json)
}

/// `app.rocksky.library.ping` — requires auth.
pub fn ping(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.ping", "{}")
}

/// `app.rocksky.library.getLicense` — requires auth.
pub fn get_license(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getLicense", "{}")
}

/// `app.rocksky.library.getMusicFolders` — requires auth.
pub fn get_music_folders(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getMusicFolders", "{}")
}

/// `app.rocksky.library.getScanStatus` — requires auth.
pub fn get_scan_status(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getScanStatus", "{}")
}

/// `app.rocksky.library.startScan` — requires auth.
pub fn start_scan(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.startScan", "{}")
}

/// `app.rocksky.library.getUser` — requires auth.
pub fn get_user(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getUser", "{}")
}

/// `app.rocksky.library.getArtists` — requires auth.
pub fn get_artists(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getArtists", "{}")
}

/// `app.rocksky.library.getIndexes` — requires auth.
pub fn get_indexes(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getIndexes", "{}")
}

/// `app.rocksky.library.getArtist` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_artist(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getArtist", params_json)
}

/// `app.rocksky.library.getArtistInfo` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_artist_info(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getArtistInfo", params_json)
}

/// `app.rocksky.library.getAlbum` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_album(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getAlbum", params_json)
}

/// `app.rocksky.library.getAlbumList` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_album_list(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getAlbumList", params_json)
}

/// `app.rocksky.library.getAlbumInfo` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_album_info(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getAlbumInfo", params_json)
}

/// `app.rocksky.library.getSong` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_song(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getSong", params_json)
}

/// `app.rocksky.library.getRandomSongs` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_random_songs(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getRandomSongs", params_json)
}

/// `app.rocksky.library.getSongsByGenre` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_songs_by_genre(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getSongsByGenre", params_json)
}

/// `app.rocksky.library.getSimilarSongs` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_similar_songs(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getSimilarSongs", params_json)
}

/// `app.rocksky.library.getTopSongs` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_top_songs(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getTopSongs", params_json)
}

/// `app.rocksky.library.getLyrics` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_lyrics(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getLyrics", params_json)
}

/// `app.rocksky.library.getMusicDirectory` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_music_directory(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getMusicDirectory", params_json)
}

/// `app.rocksky.library.getGenres` — requires auth.
pub fn get_genres(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getGenres", "{}")
}

/// `app.rocksky.library.search` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn search(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.search", params_json)
}

/// `app.rocksky.library.getStarred` — requires auth.
pub fn get_starred(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getStarred", "{}")
}

/// `app.rocksky.library.star` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn star(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.star", params_json)
}

/// `app.rocksky.library.unstar` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn unstar(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.unstar", params_json)
}

/// `app.rocksky.library.getPlaylists` — requires auth.
pub fn get_playlists(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getPlaylists", "{}")
}

/// `app.rocksky.library.getPlaylist` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_playlist(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getPlaylist", params_json)
}

/// `app.rocksky.library.createPlaylist` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn create_playlist(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.createPlaylist", params_json)
}

/// `app.rocksky.library.updatePlaylist` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn update_playlist(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.updatePlaylist", params_json)
}

/// `app.rocksky.library.deletePlaylist` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn delete_playlist(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.deletePlaylist", params_json)
}

/// `app.rocksky.library.deleteSong` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn delete_song(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.deleteSong", params_json)
}

/// `app.rocksky.library.deleteAlbum` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn delete_album(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.deleteAlbum", params_json)
}

/// `app.rocksky.library.scrobble` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn scrobble(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.scrobble", params_json)
}

/// `app.rocksky.library.updateNowPlaying` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn update_now_playing(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.updateNowPlaying", params_json)
}

/// `app.rocksky.library.getNowPlaying` — requires auth.
pub fn get_now_playing(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getNowPlaying", "{}")
}

/// `app.rocksky.library.getPlayQueue` — requires auth.
pub fn get_play_queue(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getPlayQueue", "{}")
}

/// `app.rocksky.library.savePlayQueue` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn save_play_queue(token: String, params_json: String) -> Dynamic {
  library_post_ffi("", token, "app.rocksky.library.savePlayQueue", params_json)
}

/// `app.rocksky.library.getStreamUrl` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_stream_url(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getStreamUrl", params_json)
}

/// `app.rocksky.library.getDownloadUrl` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_download_url(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getDownloadUrl", params_json)
}

/// `app.rocksky.library.getCoverArtUrl` — requires auth. `params_json` is a
/// pre-encoded JSON object of the parameters.
pub fn get_cover_art_url(token: String, params_json: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getCoverArtUrl", params_json)
}

/// `app.rocksky.library.getInternetRadioStations` — requires auth.
pub fn get_internet_radio_stations(token: String) -> Dynamic {
  library_get_ffi("", token, "app.rocksky.library.getInternetRadioStations", "{}")
}
