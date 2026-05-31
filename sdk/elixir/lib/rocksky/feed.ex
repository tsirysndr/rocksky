defmodule Rocksky.Feed do
  @moduledoc "`app.rocksky.feed.*` endpoints."

  alias Rocksky.HTTP

  @doc "Free-text search across the catalogue. Params: `:query`."
  def search(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.search", params)

  @doc "List feed generators. Params: `:size`."
  def get_feed_generators(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getFeedGenerators", params)

  @doc "Fetch a feed generator by `:feed` URI."
  def get_feed_generator(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getFeedGenerator", params)

  @doc "Fetch feed contents. Params: `:feed`, `:limit`, `:cursor`."
  def get_feed(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getFeed", params)

  @doc "Stories (recent highlights). Params: `:size`."
  def get_stories(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getStories", params)

  @doc "Track recommendations for an actor. Params: `:did`, `:limit`."
  def get_recommendations(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getRecommendations", params)

  @doc "Artist recommendations for an actor. Params: `:did`, `:limit`."
  def get_artist_recommendations(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getArtistRecommendations", params)

  @doc "Album recommendations for an actor. Params: `:did`, `:limit`."
  def get_album_recommendations(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.feed.getAlbumRecommendations", params)
end
