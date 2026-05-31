(ns rocksky.spotify
  "Endpoints under app.rocksky.spotify.* — Spotify-backed remote control."
  (:require [rocksky.client :as c]))

(defn get-currently-playing
  "Get the currently playing track. Optional: `:actor`."
  ([client] (get-currently-playing client nil))
  ([client {:keys [actor]}]
   (c/query client :app.rocksky.spotify.getCurrentlyPlaying {:actor actor})))

(defn play
  "Resume playback."
  [client]
  (c/procedure client :app.rocksky.spotify.play))

(defn pause
  "Pause playback."
  [client]
  (c/procedure client :app.rocksky.spotify.pause))

(defn next-track
  "Skip to the next track."
  [client]
  (c/procedure client :app.rocksky.spotify.next))

(defn previous-track
  "Skip to the previous track."
  [client]
  (c/procedure client :app.rocksky.spotify.previous))

(defn seek
  "Seek to `:position` (in seconds). Required: `:position`."
  [client {:keys [position]}]
  (c/procedure client :app.rocksky.spotify.seek nil {:position position}))
