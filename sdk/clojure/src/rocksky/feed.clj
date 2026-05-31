(ns rocksky.feed
  "Endpoints under app.rocksky.feed.*"
  (:require [rocksky.client :as c]))

(defn search
  "Search across songs, albums, artists, playlists, and profiles.
  Required: `:query`."
  [client {:keys [query]}]
  (c/query client :app.rocksky.feed.search {:query query}))

(defn get-feed
  "Get a feed by URI.

  Required: `:feed` (AT-URI). Optional: `:limit` `:cursor`."
  [client {:keys [feed limit cursor]}]
  (c/query client :app.rocksky.feed.getFeed
           {:feed feed :limit limit :cursor cursor}))

(defn get-feed-generator
  "Get information about a feed generator. Required: `:feed`."
  [client {:keys [feed]}]
  (c/query client :app.rocksky.feed.getFeedGenerator {:feed feed}))

(defn get-feed-generators
  "Get all feed generators. Optional: `:size`."
  ([client] (get-feed-generators client nil))
  ([client {:keys [size]}]
   (c/query client :app.rocksky.feed.getFeedGenerators {:size size})))

(defn get-stories
  "Get all currently playing tracks by users. Optional: `:size`."
  ([client] (get-stories client nil))
  ([client {:keys [size]}]
   (c/query client :app.rocksky.feed.getStories {:size size})))

(defn get-recommendations
  "Get personalised track recommendations.

  Required: `:did`. Optional: `:limit`."
  [client {:keys [did limit]}]
  (c/query client :app.rocksky.feed.getRecommendations
           {:did did :limit limit}))

(defn get-artist-recommendations
  "Get personalised artist recommendations.

  Required: `:did`. Optional: `:limit`."
  [client {:keys [did limit]}]
  (c/query client :app.rocksky.feed.getArtistRecommendations
           {:did did :limit limit}))

(defn get-album-recommendations
  "Get personalised album recommendations.

  Required: `:did`. Optional: `:limit`."
  [client {:keys [did limit]}]
  (c/query client :app.rocksky.feed.getAlbumRecommendations
           {:did did :limit limit}))
