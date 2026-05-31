defmodule Rocksky.Charts do
  @moduledoc "`app.rocksky.charts.*` endpoints."

  alias Rocksky.HTTP

  @doc """
  Scrobble chart data. Params: `:did`, `:artisturi`, `:albumuri`, `:songuri`,
  `:genre`, `:from`, `:to`.
  """
  def get_scrobbles_chart(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.charts.getScrobblesChart", params)

  @doc "Top artists. Params: `:limit`, `:offset`, `:startDate`, `:endDate`."
  def get_top_artists(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.charts.getTopArtists", params)

  @doc "Top tracks. Params: `:limit`, `:offset`, `:startDate`, `:endDate`."
  def get_top_tracks(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.charts.getTopTracks", params)
end
