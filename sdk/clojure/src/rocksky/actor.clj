(ns rocksky.actor
  "Endpoints under app.rocksky.actor.*"
  (:require [rocksky.client :as c]))

(defn get-profile
  "Get the profile of an actor.

  Params: `:did` (DID or handle, optional)."
  [client params]
  (c/query client :app.rocksky.actor.getProfile params))

(defn get-actor-albums
  "Get albums for an actor.

  Required: `:did`. Optional: `:limit` `:offset` `:start-date` `:end-date`."
  [client {:keys [did limit offset start-date end-date]}]
  (c/query client :app.rocksky.actor.getActorAlbums
           {:did did :limit limit :offset offset
            :startDate start-date :endDate end-date}))

(defn get-actor-artists
  "Get artists for an actor.

  Required: `:did`. Optional: `:limit` `:offset` `:start-date` `:end-date`."
  [client {:keys [did limit offset start-date end-date]}]
  (c/query client :app.rocksky.actor.getActorArtists
           {:did did :limit limit :offset offset
            :startDate start-date :endDate end-date}))

(defn get-actor-songs
  "Get songs for an actor.

  Required: `:did`. Optional: `:limit` `:offset` `:start-date` `:end-date`."
  [client {:keys [did limit offset start-date end-date]}]
  (c/query client :app.rocksky.actor.getActorSongs
           {:did did :limit limit :offset offset
            :startDate start-date :endDate end-date}))

(defn get-actor-scrobbles
  "Get scrobbles for an actor.

  Required: `:did`. Optional: `:limit` `:offset`."
  [client {:keys [did limit offset]}]
  (c/query client :app.rocksky.actor.getActorScrobbles
           {:did did :limit limit :offset offset}))

(defn get-actor-loved-songs
  "Get loved songs for an actor.

  Required: `:did`. Optional: `:limit` `:offset`."
  [client {:keys [did limit offset]}]
  (c/query client :app.rocksky.actor.getActorLovedSongs
           {:did did :limit limit :offset offset}))

(defn get-actor-playlists
  "Get playlists for an actor.

  Required: `:did`. Optional: `:limit` `:offset`."
  [client {:keys [did limit offset]}]
  (c/query client :app.rocksky.actor.getActorPlaylists
           {:did did :limit limit :offset offset}))

(defn get-actor-neighbours
  "Get neighbours (musical-taste neighbours) for an actor.

  Required: `:did`."
  [client {:keys [did]}]
  (c/query client :app.rocksky.actor.getActorNeighbours {:did did}))

(defn get-actor-compatibility
  "Get compatibility for an actor.

  Required: `:did`."
  [client {:keys [did]}]
  (c/query client :app.rocksky.actor.getActorCompatibility {:did did}))
