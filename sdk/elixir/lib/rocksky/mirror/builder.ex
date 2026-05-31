defmodule Rocksky.Mirror.Builder do
  @moduledoc """
  Builder for `app.rocksky.mirror.putMirrorSource`.

  ## Example

      alias Rocksky.Mirror.Builder, as: Mirror

      Mirror.new(provider: "lastfm", enabled: true)
      |> Mirror.external_username("alice")
      |> Mirror.api_key("...")
      |> Mirror.submit(client)
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.mirror.putMirrorSource",
    required: [:provider, :enabled],
    optional: [:externalUsername, :apiKey]
end
