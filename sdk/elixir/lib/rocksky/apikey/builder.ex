defmodule Rocksky.Apikey.Builder do
  @moduledoc """
  Builder for `app.rocksky.apikey.createApikey`.

  ## Example

      alias Rocksky.Apikey.Builder, as: Apikey

      Apikey.new(name: "my-bot")
      |> Apikey.description("scrobbles from my home server")
      |> Apikey.submit(client)
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.apikey.createApikey",
    required: [:name],
    optional: [:description]
end
