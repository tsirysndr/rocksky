(ns rocksky.library
  "Ergonomic wrappers for the authenticated app.rocksky.library.* API (uploaded
  music). Every fn takes a non-empty `token` first; optional params are keyword
  args merged into the request (camelCase keyword keys become the wire keys).
  Returns the parsed JSON payload, throwing ex-info on error."
  (:require [rocksky.core :as core]))

;; app.rocksky.library.ping
(defn ping [token]
  (core/library-get token "app.rocksky.library.ping" {}))

;; app.rocksky.library.getLicense
(defn get-license [token]
  (core/library-get token "app.rocksky.library.getLicense" {}))

;; app.rocksky.library.getMusicFolders
(defn get-music-folders [token]
  (core/library-get token "app.rocksky.library.getMusicFolders" {}))

;; app.rocksky.library.getScanStatus
(defn get-scan-status [token]
  (core/library-get token "app.rocksky.library.getScanStatus" {}))

;; app.rocksky.library.startScan
(defn start-scan [token]
  (core/library-get token "app.rocksky.library.startScan" {}))

;; app.rocksky.library.getUser
(defn get-user [token]
  (core/library-get token "app.rocksky.library.getUser" {}))

;; app.rocksky.library.getArtists
(defn get-artists [token]
  (core/library-get token "app.rocksky.library.getArtists" {}))

;; app.rocksky.library.getIndexes
(defn get-indexes [token]
  (core/library-get token "app.rocksky.library.getIndexes" {}))

;; app.rocksky.library.getArtist
(defn get-artist [token id]
  (core/library-get token "app.rocksky.library.getArtist" {:id id}))

;; app.rocksky.library.getArtistInfo
(defn get-artist-info [token id]
  (core/library-get token "app.rocksky.library.getArtistInfo" {:id id}))

;; app.rocksky.library.getAlbum
(defn get-album [token id]
  (core/library-get token "app.rocksky.library.getAlbum" {:id id}))

;; app.rocksky.library.getAlbumList
(defn get-album-list [token type & {:as opts}]
  (core/library-get token "app.rocksky.library.getAlbumList" (merge {:type type} opts)))

;; app.rocksky.library.getAlbumInfo
(defn get-album-info [token id]
  (core/library-get token "app.rocksky.library.getAlbumInfo" {:id id}))

;; app.rocksky.library.getSong
(defn get-song [token id]
  (core/library-get token "app.rocksky.library.getSong" {:id id}))

;; app.rocksky.library.getRandomSongs
(defn get-random-songs [token & {:as opts}]
  (core/library-get token "app.rocksky.library.getRandomSongs" opts))

;; app.rocksky.library.getSongsByGenre
(defn get-songs-by-genre [token genre & {:as opts}]
  (core/library-get token "app.rocksky.library.getSongsByGenre" (merge {:genre genre} opts)))

;; app.rocksky.library.getSimilarSongs
(defn get-similar-songs [token id & {:as opts}]
  (core/library-get token "app.rocksky.library.getSimilarSongs" (merge {:id id} opts)))

;; app.rocksky.library.getTopSongs
(defn get-top-songs [token artist & {:as opts}]
  (core/library-get token "app.rocksky.library.getTopSongs" (merge {:artist artist} opts)))

;; app.rocksky.library.getLyrics
(defn get-lyrics [token & {:as opts}]
  (core/library-get token "app.rocksky.library.getLyrics" opts))

;; app.rocksky.library.getMusicDirectory
(defn get-music-directory [token id]
  (core/library-get token "app.rocksky.library.getMusicDirectory" {:id id}))

;; app.rocksky.library.getGenres
(defn get-genres [token]
  (core/library-get token "app.rocksky.library.getGenres" {}))

;; app.rocksky.library.search
(defn search [token query & {:as opts}]
  (core/library-get token "app.rocksky.library.search" (merge {:query query} opts)))

;; app.rocksky.library.getStarred
(defn get-starred [token]
  (core/library-get token "app.rocksky.library.getStarred" {}))

;; app.rocksky.library.star
(defn star [token id & {:as opts}]
  (core/library-post token "app.rocksky.library.star" (merge {:id id} opts)))

;; app.rocksky.library.unstar
(defn unstar [token id & {:as opts}]
  (core/library-post token "app.rocksky.library.unstar" (merge {:id id} opts)))

;; app.rocksky.library.getPlaylists
(defn get-playlists [token]
  (core/library-get token "app.rocksky.library.getPlaylists" {}))

;; app.rocksky.library.getPlaylist
(defn get-playlist [token id]
  (core/library-get token "app.rocksky.library.getPlaylist" {:id id}))

;; app.rocksky.library.createPlaylist
(defn create-playlist [token name]
  (core/library-post token "app.rocksky.library.createPlaylist" {:name name}))

;; app.rocksky.library.updatePlaylist
(defn update-playlist [token playlist-id & {:as opts}]
  (core/library-post token "app.rocksky.library.updatePlaylist" (merge {:playlistId playlist-id} opts)))

;; app.rocksky.library.deletePlaylist
(defn delete-playlist [token id]
  (core/library-post token "app.rocksky.library.deletePlaylist" {:id id}))

;; app.rocksky.library.deleteSong
(defn delete-song [token id]
  (core/library-post token "app.rocksky.library.deleteSong" {:id id}))

;; app.rocksky.library.deleteAlbum
(defn delete-album [token id]
  (core/library-post token "app.rocksky.library.deleteAlbum" {:id id}))

;; app.rocksky.library.scrobble
(defn scrobble [token id & {:as opts}]
  (core/library-post token "app.rocksky.library.scrobble" (merge {:id id} opts)))

;; app.rocksky.library.updateNowPlaying
(defn update-now-playing [token id]
  (core/library-post token "app.rocksky.library.updateNowPlaying" {:id id}))

;; app.rocksky.library.getNowPlaying
(defn get-now-playing [token]
  (core/library-get token "app.rocksky.library.getNowPlaying" {}))

;; app.rocksky.library.getPlayQueue
(defn get-play-queue [token]
  (core/library-get token "app.rocksky.library.getPlayQueue" {}))

;; app.rocksky.library.savePlayQueue
(defn save-play-queue [token & {:as opts}]
  (core/library-post token "app.rocksky.library.savePlayQueue" opts))

;; app.rocksky.library.getStreamUrl
(defn get-stream-url [token id & {:as opts}]
  (core/library-get token "app.rocksky.library.getStreamUrl" (merge {:id id} opts)))

;; app.rocksky.library.getDownloadUrl
(defn get-download-url [token id]
  (core/library-get token "app.rocksky.library.getDownloadUrl" {:id id}))

;; app.rocksky.library.getCoverArtUrl
(defn get-cover-art-url [token id & {:as opts}]
  (core/library-get token "app.rocksky.library.getCoverArtUrl" (merge {:id id} opts)))

;; app.rocksky.library.getInternetRadioStations
(defn get-internet-radio-stations [token]
  (core/library-get token "app.rocksky.library.getInternetRadioStations" {}))
