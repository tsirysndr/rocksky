defmodule Rocksky.Mirror do
  @moduledoc "`app.rocksky.mirror.*` endpoints. Require an authenticated client."

  alias Rocksky.HTTP

  @doc "List configured mirror sources for the authenticated user."
  def get_mirror_sources(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.mirror.getMirrorSources", params)

  @doc """
  Configure a mirror source. Body: `:provider`, `:enabled`, `:externalUsername`,
  `:apiKey`.
  """
  def put_mirror_source(client, body),
    do: HTTP.procedure(client, "app.rocksky.mirror.putMirrorSource", [], Map.new(body))
end
