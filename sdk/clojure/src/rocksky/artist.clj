(ns rocksky.artist
  "Endpoints under app.rocksky.artist.*"
  (:require [rocksky.client :as c]))

(defn get-artist
  "Get artist details. Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.artist.getArtist {:uri uri}))

(defn get-artists
  "List artists.

  Optional: `:limit` `:offset` `:names` `:genre`."
  ([client] (get-artists client nil))
  ([client {:keys [limit offset names genre]}]
   (c/query client :app.rocksky.artist.getArtists
            {:limit limit :offset offset :names names :genre genre})))

(defn get-artist-albums
  "Get artist's albums. Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.artist.getArtistAlbums {:uri uri}))

(defn get-artist-tracks
  "Get artist's tracks.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.artist.getArtistTracks
           {:uri uri :limit limit :offset offset}))

(defn get-artist-listeners
  "Get artist listeners.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.artist.getArtistListeners
           {:uri uri :limit limit :offset offset}))

(defn get-artist-recent-listeners
  "Get artist recent listeners (ordered by most recent scrobble).

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.artist.getArtistRecentListeners
           {:uri uri :limit limit :offset offset}))
