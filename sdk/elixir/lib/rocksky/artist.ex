defmodule Rocksky.Artist do
  @moduledoc "`app.rocksky.artist.*` endpoints."

  alias Rocksky.HTTP

  @doc "Fetch an artist by AT-URI (`:uri`)."
  def get_artist(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtist", params)

  @doc "List artists. Params: `:limit`, `:offset`, `:names` (list/CSV), `:genre`."
  def get_artists(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtists", params)

  @doc "Albums by an artist. Params: `:uri`."
  def get_artist_albums(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtistAlbums", params)

  @doc "Tracks by an artist. Params: `:uri`, `:limit`, `:offset`."
  def get_artist_tracks(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtistTracks", params)

  @doc "All-time listeners for an artist. Params: `:uri`, `:limit`, `:offset`."
  def get_artist_listeners(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtistListeners", params)

  @doc "Recent listeners for an artist. Params: `:uri`, `:limit`, `:offset`."
  def get_artist_recent_listeners(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.artist.getArtistRecentListeners", params)
end
