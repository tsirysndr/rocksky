defmodule Rocksky.Library do
  @moduledoc """
  Ergonomic wrappers for the authenticated `app.rocksky.library.*` API — the
  Subsonic/navidrome-compatible surface over a user's uploaded music.

  Every function requires a non-empty `token` (Bearer). Optional parameters go
  in an `opts` map with camelCase string keys; `base` overrides the AppView
  URL. Returns `{:ok, value}` | `{:error, message}`.
  """

  @doc "app.rocksky.library.ping — requires auth."
  def ping(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.ping", %{})

  @doc "app.rocksky.library.getLicense — requires auth."
  def get_license(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getLicense", %{})

  @doc "app.rocksky.library.getMusicFolders — requires auth."
  def get_music_folders(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getMusicFolders", %{})

  @doc "app.rocksky.library.getScanStatus — requires auth."
  def get_scan_status(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getScanStatus", %{})

  @doc "app.rocksky.library.startScan — requires auth."
  def start_scan(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.startScan", %{})

  @doc "app.rocksky.library.getUser — requires auth."
  def get_user(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getUser", %{})

  @doc "app.rocksky.library.getArtists — requires auth."
  def get_artists(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getArtists", %{})

  @doc "app.rocksky.library.getIndexes — requires auth."
  def get_indexes(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getIndexes", %{})

  @doc "app.rocksky.library.getArtist — requires auth."
  def get_artist(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getArtist", %{"id" => id})

  @doc "app.rocksky.library.getArtistInfo — requires auth."
  def get_artist_info(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getArtistInfo", %{"id" => id})

  @doc "app.rocksky.library.getAlbum — requires auth."
  def get_album(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getAlbum", %{"id" => id})

  @doc "app.rocksky.library.getAlbumList — requires auth."
  def get_album_list(token, type, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getAlbumList", Map.merge(%{"type" => type}, opts))

  @doc "app.rocksky.library.getAlbumInfo — requires auth."
  def get_album_info(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getAlbumInfo", %{"id" => id})

  @doc "app.rocksky.library.getSong — requires auth."
  def get_song(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getSong", %{"id" => id})

  @doc "app.rocksky.library.getRandomSongs — requires auth."
  def get_random_songs(token, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getRandomSongs", opts)

  @doc "app.rocksky.library.getSongsByGenre — requires auth."
  def get_songs_by_genre(token, genre, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getSongsByGenre", Map.merge(%{"genre" => genre}, opts))

  @doc "app.rocksky.library.getSimilarSongs — requires auth."
  def get_similar_songs(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getSimilarSongs", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getTopSongs — requires auth."
  def get_top_songs(token, artist, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getTopSongs", Map.merge(%{"artist" => artist}, opts))

  @doc "app.rocksky.library.getLyrics — requires auth."
  def get_lyrics(token, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getLyrics", opts)

  @doc "app.rocksky.library.getMusicDirectory — requires auth."
  def get_music_directory(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getMusicDirectory", %{"id" => id})

  @doc "app.rocksky.library.getGenres — requires auth."
  def get_genres(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getGenres", %{})

  @doc "app.rocksky.library.search — requires auth."
  def search(token, query, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.search", Map.merge(%{"query" => query}, opts))

  @doc "app.rocksky.library.getStarred — requires auth."
  def get_starred(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getStarred", %{})

  @doc "app.rocksky.library.star — requires auth."
  def star(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.star", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.unstar — requires auth."
  def unstar(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.unstar", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getPlaylists — requires auth."
  def get_playlists(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getPlaylists", %{})

  @doc "app.rocksky.library.getPlaylist — requires auth."
  def get_playlist(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getPlaylist", %{"id" => id})

  @doc "app.rocksky.library.createPlaylist — requires auth."
  def create_playlist(token, name, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.createPlaylist", %{"name" => name})

  @doc "app.rocksky.library.updatePlaylist — requires auth."
  def update_playlist(token, playlist_id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.updatePlaylist", Map.merge(%{"playlistId" => playlist_id}, opts))

  @doc "app.rocksky.library.deletePlaylist — requires auth."
  def delete_playlist(token, id, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.deletePlaylist", %{"id" => id})

  @doc "app.rocksky.library.deleteSong — requires auth."
  def delete_song(token, id, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.deleteSong", %{"id" => id})

  @doc "app.rocksky.library.deleteAlbum — requires auth."
  def delete_album(token, id, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.deleteAlbum", %{"id" => id})

  @doc "app.rocksky.library.scrobble — requires auth."
  def scrobble(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.scrobble", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.updateNowPlaying — requires auth."
  def update_now_playing(token, id, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.updateNowPlaying", %{"id" => id})

  @doc "app.rocksky.library.getNowPlaying — requires auth."
  def get_now_playing(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getNowPlaying", %{})

  @doc "app.rocksky.library.getPlayQueue — requires auth."
  def get_play_queue(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getPlayQueue", %{})

  @doc "app.rocksky.library.savePlayQueue — requires auth."
  def save_play_queue(token, opts \\ %{}, base \\ ""),
    do: :rocksky.library_post(base, token, "app.rocksky.library.savePlayQueue", opts)

  @doc "app.rocksky.library.getStreamUrl — requires auth."
  def get_stream_url(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getStreamUrl", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getDownloadUrl — requires auth."
  def get_download_url(token, id, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getDownloadUrl", %{"id" => id})

  @doc "app.rocksky.library.getCoverArtUrl — requires auth."
  def get_cover_art_url(token, id, opts \\ %{}, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getCoverArtUrl", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getInternetRadioStations — requires auth."
  def get_internet_radio_stations(token, base \\ ""),
    do: :rocksky.library_get(base, token, "app.rocksky.library.getInternetRadioStations", %{})
end
