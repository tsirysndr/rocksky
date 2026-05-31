(ns rocksky.playlist
  "Endpoints under app.rocksky.playlist.*"
  (:require [rocksky.client :as c]))

(defn get-playlist
  "Get a playlist by URI. Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.playlist.getPlaylist {:uri uri}))

(defn get-playlists
  "List playlists. Optional: `:limit` `:offset`."
  ([client] (get-playlists client nil))
  ([client {:keys [limit offset]}]
   (c/query client :app.rocksky.playlist.getPlaylists
            {:limit limit :offset offset})))

(defn create-playlist
  "Create a new playlist.

  Required: `:name`. Optional: `:description`."
  [client {:keys [name description]}]
  (c/procedure client :app.rocksky.playlist.createPlaylist nil
               {:name name :description description}))

(defn remove-playlist
  "Remove a playlist by URI. Required: `:uri`."
  [client {:keys [uri]}]
  (c/procedure client :app.rocksky.playlist.removePlaylist nil
               {:uri uri}))

(defn start-playlist
  "Start playing a playlist.

  Required: `:uri`. Optional: `:shuffle` `:position`."
  [client {:keys [uri shuffle position]}]
  (c/procedure client :app.rocksky.playlist.startPlaylist nil
               {:uri uri :shuffle shuffle :position position}))

(defn insert-directory
  "Insert a directory into a playlist.

  Required: `:uri` `:directory`. Optional: `:position`."
  [client {:keys [uri directory position]}]
  (c/procedure client :app.rocksky.playlist.insertDirectory nil
               {:uri uri :directory directory :position position}))

(defn insert-files
  "Insert files into a playlist.

  Required: `:uri` `:files` (collection of file IDs).
  Optional: `:position`."
  [client {:keys [uri files position]}]
  (c/procedure client :app.rocksky.playlist.insertFiles nil
               {:uri uri :files files :position position}))
