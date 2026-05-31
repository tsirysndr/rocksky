defmodule Rocksky.Stats do
  @moduledoc "`app.rocksky.stats.*` endpoints."

  alias Rocksky.HTTP

  @doc "Per-user stats. Params: `:did`."
  def get_stats(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.stats.getStats", params)

  @doc "Year-in-review (\"Wrapped\") data. Params: `:did`, `:year`."
  def get_wrapped(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.stats.getWrapped", params)
end
