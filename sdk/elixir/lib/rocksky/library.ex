defmodule Rocksky.Library do
  @moduledoc """
  Ergonomic wrappers for the authenticated `app.rocksky.library.*` API — the
  Subsonic/navidrome-compatible surface over a user's uploaded music.

  Build a client once with `new/2` and pass it to every call — the access token
  is bound in the client, not repeated per call:

      lib = Rocksky.Library.new(token)
      {:ok, genres} = Rocksky.Library.get_genres(lib)
      {:ok, song} = Rocksky.Library.get_song(lib, song_id)

  Optional params go in an `opts` map with camelCase string keys. Returns
  `{:ok, value}` | `{:error, message}`.
  """

  @enforce_keys [:token]
  defstruct token: nil, base: ""

  @doc "Build a library client bound to a (required) access token."
  def new(token, base \\ ""), do: %__MODULE__{token: token, base: base}

  @doc "app.rocksky.library.ping — see `new/2`."
  def ping(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.ping", %{})

  @doc "app.rocksky.library.getLicense — see `new/2`."
  def get_license(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getLicense", %{})

  @doc "app.rocksky.library.getMusicFolders — see `new/2`."
  def get_music_folders(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getMusicFolders", %{})

  @doc "app.rocksky.library.getScanStatus — see `new/2`."
  def get_scan_status(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getScanStatus", %{})

  @doc "app.rocksky.library.startScan — see `new/2`."
  def start_scan(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.startScan", %{})

  @doc "app.rocksky.library.getUser — see `new/2`."
  def get_user(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getUser", %{})

  @doc "app.rocksky.library.getArtists — see `new/2`."
  def get_artists(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getArtists", %{})

  @doc "app.rocksky.library.getIndexes — see `new/2`."
  def get_indexes(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getIndexes", %{})

  @doc "app.rocksky.library.getArtist — see `new/2`."
  def get_artist(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getArtist", %{"id" => id})

  @doc "app.rocksky.library.getArtistInfo — see `new/2`."
  def get_artist_info(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getArtistInfo", %{"id" => id})

  @doc "app.rocksky.library.getAlbum — see `new/2`."
  def get_album(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getAlbum", %{"id" => id})

  @doc "app.rocksky.library.getAlbumList — see `new/2`."
  def get_album_list(%__MODULE__{} = client, type, opts \\ %{}),
    do: get(client, "app.rocksky.library.getAlbumList", Map.merge(%{"type" => type}, opts))

  @doc "app.rocksky.library.getAlbumInfo — see `new/2`."
  def get_album_info(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getAlbumInfo", %{"id" => id})

  @doc "app.rocksky.library.getSong — see `new/2`."
  def get_song(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getSong", %{"id" => id})

  @doc "app.rocksky.library.getRandomSongs — see `new/2`."
  def get_random_songs(%__MODULE__{} = client, opts \\ %{}),
    do: get(client, "app.rocksky.library.getRandomSongs", opts)

  @doc "app.rocksky.library.getSongsByGenre — see `new/2`."
  def get_songs_by_genre(%__MODULE__{} = client, genre, opts \\ %{}),
    do: get(client, "app.rocksky.library.getSongsByGenre", Map.merge(%{"genre" => genre}, opts))

  @doc "app.rocksky.library.getSimilarSongs — see `new/2`."
  def get_similar_songs(%__MODULE__{} = client, id, opts \\ %{}),
    do: get(client, "app.rocksky.library.getSimilarSongs", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getTopSongs — see `new/2`."
  def get_top_songs(%__MODULE__{} = client, artist, opts \\ %{}),
    do: get(client, "app.rocksky.library.getTopSongs", Map.merge(%{"artist" => artist}, opts))

  @doc "app.rocksky.library.getLyrics — see `new/2`."
  def get_lyrics(%__MODULE__{} = client, opts \\ %{}),
    do: get(client, "app.rocksky.library.getLyrics", opts)

  @doc "app.rocksky.library.getMusicDirectory — see `new/2`."
  def get_music_directory(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getMusicDirectory", %{"id" => id})

  @doc "app.rocksky.library.getGenres — see `new/2`."
  def get_genres(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getGenres", %{})

  @doc "app.rocksky.library.search — see `new/2`."
  def search(%__MODULE__{} = client, query, opts \\ %{}),
    do: get(client, "app.rocksky.library.search", Map.merge(%{"query" => query}, opts))

  @doc "app.rocksky.library.getStarred — see `new/2`."
  def get_starred(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getStarred", %{})

  @doc "app.rocksky.library.star — see `new/2`."
  def star(%__MODULE__{} = client, id, opts \\ %{}),
    do: post(client, "app.rocksky.library.star", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.unstar — see `new/2`."
  def unstar(%__MODULE__{} = client, id, opts \\ %{}),
    do: post(client, "app.rocksky.library.unstar", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getPlaylists — see `new/2`."
  def get_playlists(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getPlaylists", %{})

  @doc "app.rocksky.library.getPlaylist — see `new/2`."
  def get_playlist(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getPlaylist", %{"id" => id})

  @doc "app.rocksky.library.createPlaylist — see `new/2`."
  def create_playlist(%__MODULE__{} = client, name),
    do: post(client, "app.rocksky.library.createPlaylist", %{"name" => name})

  @doc "app.rocksky.library.updatePlaylist — see `new/2`."
  def update_playlist(%__MODULE__{} = client, playlist_id, opts \\ %{}),
    do: post(client, "app.rocksky.library.updatePlaylist", Map.merge(%{"playlistId" => playlist_id}, opts))

  @doc "app.rocksky.library.deletePlaylist — see `new/2`."
  def delete_playlist(%__MODULE__{} = client, id),
    do: post(client, "app.rocksky.library.deletePlaylist", %{"id" => id})

  @doc "app.rocksky.library.deleteSong — see `new/2`."
  def delete_song(%__MODULE__{} = client, id),
    do: post(client, "app.rocksky.library.deleteSong", %{"id" => id})

  @doc "app.rocksky.library.deleteAlbum — see `new/2`."
  def delete_album(%__MODULE__{} = client, id),
    do: post(client, "app.rocksky.library.deleteAlbum", %{"id" => id})

  @doc "app.rocksky.library.scrobble — see `new/2`."
  def scrobble(%__MODULE__{} = client, id, opts \\ %{}),
    do: post(client, "app.rocksky.library.scrobble", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.updateNowPlaying — see `new/2`."
  def update_now_playing(%__MODULE__{} = client, id),
    do: post(client, "app.rocksky.library.updateNowPlaying", %{"id" => id})

  @doc "app.rocksky.library.getNowPlaying — see `new/2`."
  def get_now_playing(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getNowPlaying", %{})

  @doc "app.rocksky.library.getPlayQueue — see `new/2`."
  def get_play_queue(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getPlayQueue", %{})

  @doc "app.rocksky.library.savePlayQueue — see `new/2`."
  def save_play_queue(%__MODULE__{} = client, opts \\ %{}),
    do: post(client, "app.rocksky.library.savePlayQueue", opts)

  @doc "app.rocksky.library.getStreamUrl — see `new/2`."
  def get_stream_url(%__MODULE__{} = client, id, opts \\ %{}),
    do: get(client, "app.rocksky.library.getStreamUrl", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getDownloadUrl — see `new/2`."
  def get_download_url(%__MODULE__{} = client, id),
    do: get(client, "app.rocksky.library.getDownloadUrl", %{"id" => id})

  @doc "app.rocksky.library.getCoverArtUrl — see `new/2`."
  def get_cover_art_url(%__MODULE__{} = client, id, opts \\ %{}),
    do: get(client, "app.rocksky.library.getCoverArtUrl", Map.merge(%{"id" => id}, opts))

  @doc "app.rocksky.library.getInternetRadioStations — see `new/2`."
  def get_internet_radio_stations(%__MODULE__{} = client),
    do: get(client, "app.rocksky.library.getInternetRadioStations", %{})

  defp get(%__MODULE__{token: t, base: b}, nsid, params),
    do: :rocksky.library_get(b, t, nsid, params)

  defp post(%__MODULE__{token: t, base: b}, nsid, body),
    do: :rocksky.library_post(b, t, nsid, body)
end
