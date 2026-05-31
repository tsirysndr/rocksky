(ns rocksky.scrobble
  "Endpoints under app.rocksky.scrobble.*"
  (:require [rocksky.client :as c]))

(defn get-scrobble
  "Get a scrobble by URI. Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.scrobble.getScrobble {:uri uri}))

(defn get-scrobbles
  "List scrobbles.

  Optional: `:did` `:following` `:limit` `:offset`."
  ([client] (get-scrobbles client nil))
  ([client {:keys [did following limit offset]}]
   (c/query client :app.rocksky.scrobble.getScrobbles
            {:did did :following following :limit limit :offset offset})))

(defn create-scrobble
  "Create a new scrobble.

  Required: `:title` `:artist`.
  Optional: `:album` `:duration` `:mb-id` `:isrc` `:album-art`
  `:track-number` `:release-date` `:year` `:disc-number` `:lyrics`
  `:composer` `:copyright-message` `:label` `:artist-picture`
  `:spotify-link` `:lastfm-link` `:tidal-link` `:apple-music-link`
  `:youtube-link` `:deezer-link` `:timestamp`."
  [client {:keys [title artist album duration mb-id isrc album-art
                  track-number release-date year disc-number lyrics
                  composer copyright-message label artist-picture
                  spotify-link lastfm-link tidal-link apple-music-link
                  youtube-link deezer-link timestamp]}]
  (c/procedure client :app.rocksky.scrobble.createScrobble
               (cond-> {:title  title
                        :artist artist}
                 album             (assoc :album album)
                 duration          (assoc :duration duration)
                 mb-id             (assoc :mbId mb-id)
                 isrc              (assoc :isrc isrc)
                 album-art         (assoc :albumArt album-art)
                 track-number      (assoc :trackNumber track-number)
                 release-date      (assoc :releaseDate release-date)
                 year              (assoc :year year)
                 disc-number       (assoc :discNumber disc-number)
                 lyrics            (assoc :lyrics lyrics)
                 composer          (assoc :composer composer)
                 copyright-message (assoc :copyrightMessage copyright-message)
                 label             (assoc :label label)
                 artist-picture    (assoc :artistPicture artist-picture)
                 spotify-link      (assoc :spotifyLink spotify-link)
                 lastfm-link       (assoc :lastfmLink lastfm-link)
                 tidal-link        (assoc :tidalLink tidal-link)
                 apple-music-link  (assoc :appleMusicLink apple-music-link)
                 youtube-link      (assoc :youtubeLink youtube-link)
                 deezer-link       (assoc :deezerLink deezer-link)
                 timestamp         (assoc :timestamp timestamp))))
