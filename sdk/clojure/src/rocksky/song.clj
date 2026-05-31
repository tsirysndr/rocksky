(ns rocksky.song
  "Endpoints under app.rocksky.song.*"
  (:require [rocksky.client :as c]))

(defn get-song
  "Get a song by URI, MusicBrainz ID, ISRC, or Spotify track ID.

  Optional: `:uri` `:mbid` `:isrc` `:spotify-id`."
  ([client] (get-song client nil))
  ([client {:keys [uri mbid isrc spotify-id]}]
   (c/query client :app.rocksky.song.getSong
            {:uri uri :mbid mbid :isrc isrc :spotifyId spotify-id})))

(defn get-songs
  "List songs.

  Optional: `:limit` `:offset` `:genre` `:mbid` `:isrc` `:spotify-id`."
  ([client] (get-songs client nil))
  ([client {:keys [limit offset genre mbid isrc spotify-id]}]
   (c/query client :app.rocksky.song.getSongs
            {:limit limit :offset offset :genre genre
             :mbid mbid :isrc isrc :spotifyId spotify-id})))

(defn get-song-recent-listeners
  "Get a song's recent listeners.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.song.getSongRecentListeners
           {:uri uri :limit limit :offset offset}))

(defn match-song
  "Match a song against Rocksky and external providers to resolve a canonical
  track/artist/album.

  Required: `:title` `:artist`. Optional: `:mb-id` `:isrc`."
  [client {:keys [title artist mb-id isrc]}]
  (c/query client :app.rocksky.song.matchSong
           {:title title :artist artist :mbId mb-id :isrc isrc}))

(defn create-song
  "Create a new song.

  Required: `:title` `:artist` `:album` `:album-artist`.
  Optional: `:duration` `:mb-id` `:isrc` `:album-art` `:track-number`
  `:release-date` `:year` `:disc-number` `:lyrics`."
  [client {:keys [title artist album-artist album duration mb-id isrc
                  album-art track-number release-date year disc-number lyrics]}]
  (c/procedure client :app.rocksky.song.createSong
               (cond-> {:title       title
                        :artist      artist
                        :albumArtist album-artist
                        :album       album}
                 duration     (assoc :duration duration)
                 mb-id        (assoc :mbId mb-id)
                 isrc         (assoc :isrc isrc)
                 album-art    (assoc :albumArt album-art)
                 track-number (assoc :trackNumber track-number)
                 release-date (assoc :releaseDate release-date)
                 year         (assoc :year year)
                 disc-number  (assoc :discNumber disc-number)
                 lyrics       (assoc :lyrics lyrics))))
