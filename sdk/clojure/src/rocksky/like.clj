(ns rocksky.like
  "Endpoints under app.rocksky.like.*"
  (:require [rocksky.client :as c]))

(defn like-song
  "Like a song. Required: `:uri`."
  [client {:keys [uri] :as body}]
  (c/procedure client :app.rocksky.like.likeSong body))

(defn dislike-song
  "Dislike a song. Required: `:uri`."
  [client {:keys [uri] :as body}]
  (c/procedure client :app.rocksky.like.dislikeSong body))

(defn like-shout
  "Like a shout. Required: `:uri`."
  [client {:keys [uri] :as body}]
  (c/procedure client :app.rocksky.like.likeShout body))

(defn dislike-shout
  "Dislike a shout. Required: `:uri`."
  [client {:keys [uri] :as body}]
  (c/procedure client :app.rocksky.like.dislikeShout body))
