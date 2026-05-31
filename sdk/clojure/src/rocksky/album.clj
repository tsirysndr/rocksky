(ns rocksky.album
  "Endpoints under app.rocksky.album.*"
  (:require [rocksky.client :as c]))

(defn get-album
  "Get detailed album view.

  Required: `:uri` (AT-URI)."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.album.getAlbum {:uri uri}))

(defn get-albums
  "Get albums.

  Optional: `:limit` `:offset` `:genre`."
  [client {:keys [limit offset genre]}]
  (c/query client :app.rocksky.album.getAlbums
           {:limit limit :offset offset :genre genre}))

(defn get-album-tracks
  "Get tracks for an album.

  Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.album.getAlbumTracks {:uri uri}))
