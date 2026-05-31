defmodule Rocksky.Song do
  @moduledoc "`app.rocksky.song.*` endpoints."

  alias Rocksky.HTTP

  @doc "Fetch a song by `:uri`, `:mbid`, `:isrc`, or `:spotifyId`."
  def get_song(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.song.getSong", params)

  @doc """
  List songs. Params: `:limit`, `:offset`, `:genre`, `:mbid`, `:isrc`, `:spotifyId`.
  """
  def get_songs(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.song.getSongs", params)

  @doc "Recent listeners for a song. Params: `:uri`, `:limit`, `:offset`."
  def get_song_recent_listeners(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.song.getSongRecentListeners", params)

  @doc "Find an existing song by metadata. Params: `:title`, `:artist`, `:mbId`, `:isrc`."
  def match_song(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.song.matchSong", params)

  @doc "Create a song. Body contains title, artist, album, etc."
  def create_song(client, body),
    do: HTTP.procedure(client, "app.rocksky.song.createSong", [], Map.new(body))
end
