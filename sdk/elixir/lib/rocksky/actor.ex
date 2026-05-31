defmodule Rocksky.Actor do
  @moduledoc """
  `app.rocksky.actor.*` endpoints.

  All functions take the client as the first argument and a keyword list of
  parameters. They return `{:ok, body}` or `{:error, %Rocksky.Error{}}`.
  """

  alias Rocksky.{Client, HTTP}

  @doc "Fetch a profile by DID or handle (`:did`)."
  @spec get_profile(Client.t(), keyword()) :: {:ok, map()} | {:error, Rocksky.Error.t()}
  def get_profile(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getProfile", params)

  @doc "Albums an actor has scrobbled. Params: `:did`, `:limit`, `:offset`, `:startDate`, `:endDate`."
  def get_actor_albums(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorAlbums", params)

  @doc "Artists an actor has scrobbled. Params: `:did`, `:limit`, `:offset`, `:startDate`, `:endDate`."
  def get_actor_artists(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorArtists", params)

  @doc "Songs an actor has scrobbled. Params: `:did`, `:limit`, `:offset`, `:startDate`, `:endDate`."
  def get_actor_songs(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorSongs", params)

  @doc "Songs an actor has loved. Params: `:did`, `:limit`, `:offset`."
  def get_actor_loved_songs(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorLovedSongs", params)

  @doc "Scrobbles for an actor. Params: `:did`, `:limit`, `:offset`."
  def get_actor_scrobbles(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorScrobbles", params)

  @doc "Playlists for an actor. Params: `:did`, `:limit`, `:offset`."
  def get_actor_playlists(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorPlaylists", params)

  @doc "Musical neighbours of an actor. Params: `:did`."
  def get_actor_neighbours(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorNeighbours", params)

  @doc "Compatibility score between the authenticated user and another actor. Params: `:did`."
  def get_actor_compatibility(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.actor.getActorCompatibility", params)
end
