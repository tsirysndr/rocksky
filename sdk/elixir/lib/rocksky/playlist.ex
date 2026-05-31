defmodule Rocksky.Playlist do
  @moduledoc "`app.rocksky.playlist.*` endpoints."

  alias Rocksky.HTTP

  @doc "Fetch a playlist. Params: `:uri`."
  def get_playlist(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.playlist.getPlaylist", params)

  @doc "List playlists. Params: `:limit`, `:offset`."
  def get_playlists(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.playlist.getPlaylists", params)

  @doc "Create a playlist. Params: `:name`, `:description`."
  def create_playlist(client, params),
    do: HTTP.procedure(client, "app.rocksky.playlist.createPlaylist", params)

  @doc "Remove a playlist. Params: `:uri`."
  def remove_playlist(client, params),
    do: HTTP.procedure(client, "app.rocksky.playlist.removePlaylist", params)

  @doc "Start a playlist. Params: `:uri`, `:shuffle`, `:position`."
  def start_playlist(client, params),
    do: HTTP.procedure(client, "app.rocksky.playlist.startPlaylist", params)

  @doc "Insert files into a playlist. Params: `:uri`, `:files`, `:position`."
  def insert_files(client, params),
    do: HTTP.procedure(client, "app.rocksky.playlist.insertFiles", params)

  @doc "Insert a directory into a playlist. Params: `:uri`, `:directory`, `:position`."
  def insert_directory(client, params),
    do: HTTP.procedure(client, "app.rocksky.playlist.insertDirectory", params)
end
