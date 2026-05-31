defmodule Rocksky do
  @moduledoc """
  Pipe-friendly Elixir client for the [Rocksky](https://rocksky.app) XRPC API.

  ## Quick start

      client = Rocksky.new(token: System.get_env("ROCKSKY_TOKEN"))

      {:ok, profile} = client |> Rocksky.Actor.get_profile(did: "alice.bsky.social")

      {:ok, scrobbles} =
        client
        |> Rocksky.Actor.get_actor_scrobbles(did: "alice.bsky.social", limit: 25)

  Every namespace module mirrors the XRPC NSID (e.g. `app.rocksky.actor.getProfile` is
  exposed as `Rocksky.Actor.get_profile/2`). The client is always the first argument so
  calls compose naturally with the pipe operator.

  ## Auth

  Procedures that require authentication accept an OAuth Bearer token. Pass it via
  `:token` when constructing the client:

      client = Rocksky.new(token: "...", base_url: "https://api.rocksky.app")

  ## Errors

  All functions return `{:ok, body}` on 2xx responses and `{:error, %Rocksky.Error{}}`
  otherwise. Each function has a bang variant (e.g. `get_profile!/2`) that raises
  `Rocksky.Error` on failure.
  """

  alias Rocksky.Client

  @doc """
  Build a new client. Options:

    * `:base_url` — base URL of the Rocksky API. Defaults to the value in
      `config :rocksky, :base_url`, falling back to `https://api.rocksky.app`.
    * `:token` — Bearer token used for authenticated endpoints.
    * `:headers` — extra request headers (list of `{name, value}` tuples).
    * `:req_options` — additional options forwarded to `Req.new/1` (useful in tests,
      e.g. `plug: {Req.Test, MyStub}`).
  """
  @spec new(keyword()) :: Client.t()
  defdelegate new(opts \\ []), to: Client
end
