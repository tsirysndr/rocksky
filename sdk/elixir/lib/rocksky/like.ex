defmodule Rocksky.Like do
  @moduledoc "`app.rocksky.like.*` endpoints. All require an authenticated client."

  alias Rocksky.HTTP

  @doc "Like a song. Body: `:uri`."
  def like_song(client, body),
    do: HTTP.procedure(client, "app.rocksky.like.likeSong", [], Map.new(body))

  @doc "Remove a like on a song. Body: `:uri`."
  def dislike_song(client, body),
    do: HTTP.procedure(client, "app.rocksky.like.dislikeSong", [], Map.new(body))

  @doc "Like a shout. Body: `:uri`."
  def like_shout(client, body),
    do: HTTP.procedure(client, "app.rocksky.like.likeShout", [], Map.new(body))

  @doc "Remove a like on a shout. Body: `:uri`."
  def dislike_shout(client, body),
    do: HTTP.procedure(client, "app.rocksky.like.dislikeShout", [], Map.new(body))
end
