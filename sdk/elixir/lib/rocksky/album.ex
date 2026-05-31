defmodule Rocksky.Album do
  @moduledoc "`app.rocksky.album.*` endpoints."

  alias Rocksky.HTTP

  @doc "Fetch an album by AT-URI (`:uri`)."
  def get_album(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.album.getAlbum", params)

  @doc "Paginated list of albums. Params: `:limit`, `:offset`, `:genre`."
  def get_albums(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.album.getAlbums", params)

  @doc "Tracks belonging to an album. Params: `:uri`."
  def get_album_tracks(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.album.getAlbumTracks", params)
end
