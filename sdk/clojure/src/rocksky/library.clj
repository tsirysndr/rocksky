(ns rocksky.library
  "Ergonomic wrappers for the authenticated app.rocksky.library.* API (uploaded
  music). Build a client once with `client` and pass it to every call — the
  access token is bound in the client, not repeated:

    (def lib (library/client token))
    (library/get-genres lib)
    (library/get-song lib song-id)

  Optional params are keyword args merged into the request (camelCase keyword
  keys become the wire keys). Returns the parsed JSON payload."
  (:require [rocksky.core :as core]))

(defn client
  "Bind a (required, non-empty) access token; base overrides the AppView URL."
  ([token] (client token nil))
  ([token base] {::token token ::base base}))

(defn- lget [{::keys [token base]} nsid params]
  (core/library-get token nsid params base))

(defn- lpost [{::keys [token base]} nsid body]
  (core/library-post token nsid body base))

;; app.rocksky.library.ping
(defn ping [client]
  (lget client "app.rocksky.library.ping" {}))

;; app.rocksky.library.getLicense
(defn get-license [client]
  (lget client "app.rocksky.library.getLicense" {}))

;; app.rocksky.library.getMusicFolders
(defn get-music-folders [client]
  (lget client "app.rocksky.library.getMusicFolders" {}))

;; app.rocksky.library.getScanStatus
(defn get-scan-status [client]
  (lget client "app.rocksky.library.getScanStatus" {}))

;; app.rocksky.library.startScan
(defn start-scan [client]
  (lget client "app.rocksky.library.startScan" {}))

;; app.rocksky.library.getUser
(defn get-user [client]
  (lget client "app.rocksky.library.getUser" {}))

;; app.rocksky.library.getArtists
(defn get-artists [client]
  (lget client "app.rocksky.library.getArtists" {}))

;; app.rocksky.library.getIndexes
(defn get-indexes [client]
  (lget client "app.rocksky.library.getIndexes" {}))

;; app.rocksky.library.getArtist
(defn get-artist [client id]
  (lget client "app.rocksky.library.getArtist" {:id id}))

;; app.rocksky.library.getArtistInfo
(defn get-artist-info [client id]
  (lget client "app.rocksky.library.getArtistInfo" {:id id}))

;; app.rocksky.library.getAlbum
(defn get-album [client id]
  (lget client "app.rocksky.library.getAlbum" {:id id}))

;; app.rocksky.library.getAlbumList
(defn get-album-list [client type & {:as opts}]
  (lget client "app.rocksky.library.getAlbumList" (merge {:type type} opts)))

;; app.rocksky.library.getAlbumInfo
(defn get-album-info [client id]
  (lget client "app.rocksky.library.getAlbumInfo" {:id id}))

;; app.rocksky.library.getSong
(defn get-song [client id]
  (lget client "app.rocksky.library.getSong" {:id id}))

;; app.rocksky.library.getRandomSongs
(defn get-random-songs [client & {:as opts}]
  (lget client "app.rocksky.library.getRandomSongs" opts))

;; app.rocksky.library.getSongsByGenre
(defn get-songs-by-genre [client genre & {:as opts}]
  (lget client "app.rocksky.library.getSongsByGenre" (merge {:genre genre} opts)))

;; app.rocksky.library.getSimilarSongs
(defn get-similar-songs [client id & {:as opts}]
  (lget client "app.rocksky.library.getSimilarSongs" (merge {:id id} opts)))

;; app.rocksky.library.getTopSongs
(defn get-top-songs [client artist & {:as opts}]
  (lget client "app.rocksky.library.getTopSongs" (merge {:artist artist} opts)))

;; app.rocksky.library.getLyrics
(defn get-lyrics [client & {:as opts}]
  (lget client "app.rocksky.library.getLyrics" opts))

;; app.rocksky.library.getMusicDirectory
(defn get-music-directory [client id]
  (lget client "app.rocksky.library.getMusicDirectory" {:id id}))

;; app.rocksky.library.getGenres
(defn get-genres [client]
  (lget client "app.rocksky.library.getGenres" {}))

;; app.rocksky.library.search
(defn search [client query & {:as opts}]
  (lget client "app.rocksky.library.search" (merge {:query query} opts)))

;; app.rocksky.library.getStarred
(defn get-starred [client]
  (lget client "app.rocksky.library.getStarred" {}))

;; app.rocksky.library.star
(defn star [client id & {:as opts}]
  (lpost client "app.rocksky.library.star" (merge {:id id} opts)))

;; app.rocksky.library.unstar
(defn unstar [client id & {:as opts}]
  (lpost client "app.rocksky.library.unstar" (merge {:id id} opts)))

;; app.rocksky.library.getPlaylists
(defn get-playlists [client]
  (lget client "app.rocksky.library.getPlaylists" {}))

;; app.rocksky.library.getPlaylist
(defn get-playlist [client id]
  (lget client "app.rocksky.library.getPlaylist" {:id id}))

;; app.rocksky.library.createPlaylist
(defn create-playlist [client name]
  (lpost client "app.rocksky.library.createPlaylist" {:name name}))

;; app.rocksky.library.updatePlaylist
(defn update-playlist [client playlist-id & {:as opts}]
  (lpost client "app.rocksky.library.updatePlaylist" (merge {:playlistId playlist-id} opts)))

;; app.rocksky.library.deletePlaylist
(defn delete-playlist [client id]
  (lpost client "app.rocksky.library.deletePlaylist" {:id id}))

;; app.rocksky.library.deleteSong
(defn delete-song [client id]
  (lpost client "app.rocksky.library.deleteSong" {:id id}))

;; app.rocksky.library.deleteAlbum
(defn delete-album [client id]
  (lpost client "app.rocksky.library.deleteAlbum" {:id id}))

;; app.rocksky.library.scrobble
(defn scrobble [client id & {:as opts}]
  (lpost client "app.rocksky.library.scrobble" (merge {:id id} opts)))

;; app.rocksky.library.updateNowPlaying
(defn update-now-playing [client id]
  (lpost client "app.rocksky.library.updateNowPlaying" {:id id}))

;; app.rocksky.library.getNowPlaying
(defn get-now-playing [client]
  (lget client "app.rocksky.library.getNowPlaying" {}))

;; app.rocksky.library.getPlayQueue
(defn get-play-queue [client]
  (lget client "app.rocksky.library.getPlayQueue" {}))

;; app.rocksky.library.savePlayQueue
(defn save-play-queue [client & {:as opts}]
  (lpost client "app.rocksky.library.savePlayQueue" opts))

;; app.rocksky.library.getStreamUrl
(defn get-stream-url [client id & {:as opts}]
  (lget client "app.rocksky.library.getStreamUrl" (merge {:id id} opts)))

;; app.rocksky.library.getDownloadUrl
(defn get-download-url [client id]
  (lget client "app.rocksky.library.getDownloadUrl" {:id id}))

;; app.rocksky.library.getCoverArtUrl
(defn get-cover-art-url [client id & {:as opts}]
  (lget client "app.rocksky.library.getCoverArtUrl" (merge {:id id} opts)))

;; app.rocksky.library.getInternetRadioStations
(defn get-internet-radio-stations [client]
  (lget client "app.rocksky.library.getInternetRadioStations" {}))
