(ns rocksky.playlist
  "app.rocksky.playlist.* — the global, AT-Proto-backed playlists.

  Distinct from `rocksky.library`, whose playlist fns drive the
  Subsonic/Navidrome library (app.rocksky.library.*).

  Writes publish records to the caller's repo, so they need a `token` and only
  appear in reads once the AppView has ingested the commit."
  (:require [rocksky.core :as core]))

(defn- prune [m] (into {} (remove (comp nil? val) m)))

;; app.rocksky.playlist.getPlaylists
(defn list-playlists
  ([] (list-playlists {}))
  ([{:keys [limit offset filter base]}]
   (core/query "app.rocksky.playlist.getPlaylists"
               (prune {:limit (or limit 50) :offset (or offset 0) :filter filter})
               base)))

;; app.rocksky.playlist.getPlaylist — `filter` is RSQL over the tracks
(defn get-playlist
  ([uri] (get-playlist uri {}))
  ([uri {:keys [filter base]}]
   (core/query "app.rocksky.playlist.getPlaylist" (prune {:uri uri :filter filter}) base)))

;; app.rocksky.playlist.createPlaylist — returns {"uri" ... "cid" ...}
(defn create-playlist
  [name {:keys [token description picture-url base]}]
  (core/procedure "app.rocksky.playlist.createPlaylist"
                  (prune {:name name :description description :pictureUrl picture-url})
                  base token))

;; app.rocksky.playlist.updatePlaylist — owner only
(defn update-playlist
  [uri {:keys [token name description picture-url base]}]
  (core/procedure "app.rocksky.playlist.updatePlaylist"
                  (prune {:uri uri :name name :description description :pictureUrl picture-url})
                  base token))

;; app.rocksky.playlist.addSongs — owner only; `songs` are app.rocksky.song AT-URIs
(defn add-songs
  [uri songs {:keys [token base]}]
  (core/procedure "app.rocksky.playlist.addSongs" {:uri uri :songs songs} base token))

;; app.rocksky.playlist.removeTrack — only the repo that added an entry can retract it
(defn remove-track
  [uri song-uri {:keys [token base]}]
  (core/procedure "app.rocksky.playlist.removeTrack" {:uri uri :songUri song-uri} base token))

;; app.rocksky.playlist.removePlaylist — owner only
(defn remove-playlist
  [uri {:keys [token base]}]
  (core/procedure "app.rocksky.playlist.removePlaylist" {:uri uri} base token))
