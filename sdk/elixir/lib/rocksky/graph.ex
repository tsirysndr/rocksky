defmodule Rocksky.Graph do
  @moduledoc "`app.rocksky.graph.*` endpoints."

  alias Rocksky.HTTP

  @doc "Follow an account. Params: `:account` (DID or handle)."
  def follow_account(client, params),
    do: HTTP.procedure(client, "app.rocksky.graph.followAccount", params)

  @doc "Unfollow an account. Params: `:account`."
  def unfollow_account(client, params),
    do: HTTP.procedure(client, "app.rocksky.graph.unfollowAccount", params)

  @doc "Followers of an actor. Params: `:actor`, `:limit`, `:dids`, `:cursor`."
  def get_followers(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.graph.getFollowers", params)

  @doc "Accounts an actor follows. Params: `:actor`, `:limit`, `:dids`, `:cursor`."
  def get_follows(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.graph.getFollows", params)

  @doc "Followers of an actor that the viewer also knows. Params: `:actor`, `:limit`, `:cursor`."
  def get_known_followers(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.graph.getKnownFollowers", params)
end
