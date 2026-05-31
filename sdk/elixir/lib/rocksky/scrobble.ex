defmodule Rocksky.Scrobble do
  @moduledoc "`app.rocksky.scrobble.*` endpoints."

  alias Rocksky.HTTP

  @doc """
  Create a new scrobble. Requires an authenticated client.

  Required keys: `:title`, `:artist`. See the lexicon for the full set of optional
  fields (album, mbId, isrc, spotifyLink, timestamp, …).

  ## Example

      client
      |> Rocksky.Scrobble.create_scrobble(
        title: "In Bloom",
        artist: "Nirvana",
        album: "Nevermind",
        timestamp: System.system_time(:second)
      )
  """
  def create_scrobble(client, body),
    do: HTTP.procedure(client, "app.rocksky.scrobble.createScrobble", [], Map.new(body))

  @doc "Fetch a scrobble. Params: `:uri`."
  def get_scrobble(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.scrobble.getScrobble", params)

  @doc "List scrobbles. Params: `:did`, `:following`, `:limit`, `:offset`."
  def get_scrobbles(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.scrobble.getScrobbles", params)
end
