(ns rocksky.player
  "Endpoints under app.rocksky.player.* — controls Rocksky's web player."
  (:require [rocksky.client :as c]))

(defn get-currently-playing
  "Get the currently playing track.

  Optional: `:player-id` `:actor`."
  ([client] (get-currently-playing client nil))
  ([client {:keys [player-id actor]}]
   (c/query client :app.rocksky.player.getCurrentlyPlaying
            {:playerId player-id :actor actor})))

(defn get-playback-queue
  "Get the playback queue. Optional: `:player-id`."
  ([client] (get-playback-queue client nil))
  ([client {:keys [player-id]}]
   (c/query client :app.rocksky.player.getPlaybackQueue
            {:playerId player-id})))

(defn play
  "Resume playback. Optional: `:player-id`."
  ([client] (play client nil))
  ([client {:keys [player-id]}]
   (c/procedure client :app.rocksky.player.play nil
                {:playerId player-id})))

(defn pause
  "Pause playback. Optional: `:player-id`."
  ([client] (pause client nil))
  ([client {:keys [player-id]}]
   (c/procedure client :app.rocksky.player.pause nil
                {:playerId player-id})))

(defn next-track
  "Skip to the next track. Optional: `:player-id`."
  ([client] (next-track client nil))
  ([client {:keys [player-id]}]
   (c/procedure client :app.rocksky.player.next nil
                {:playerId player-id})))

(defn previous-track
  "Skip to the previous track. Optional: `:player-id`."
  ([client] (previous-track client nil))
  ([client {:keys [player-id]}]
   (c/procedure client :app.rocksky.player.previous nil
                {:playerId player-id})))

(defn seek
  "Seek to `:position` (in seconds). Required: `:position`. Optional: `:player-id`."
  [client {:keys [player-id position]}]
  (c/procedure client :app.rocksky.player.seek nil
               {:playerId player-id :position position}))

(defn add-items-to-queue
  "Add items to the queue.

  Required: `:items` (collection of file IDs).
  Optional: `:player-id` `:position` `:shuffle`."
  [client {:keys [player-id items position shuffle]}]
  (c/procedure client :app.rocksky.player.addItemsToQueue nil
               {:playerId player-id
                :items    items
                :position position
                :shuffle  shuffle}))

(defn play-file
  "Play a specific file by `:file-id`.

  Required: `:file-id`. Optional: `:player-id`."
  [client {:keys [player-id file-id]}]
  (c/procedure client :app.rocksky.player.playFile nil
               {:playerId player-id :fileId file-id}))

(defn play-directory
  "Play all tracks in a directory.

  Required: `:directory-id`.
  Optional: `:player-id` `:shuffle` `:recurse` `:position`."
  [client {:keys [player-id directory-id shuffle recurse position]}]
  (c/procedure client :app.rocksky.player.playDirectory nil
               {:playerId    player-id
                :directoryId directory-id
                :shuffle     shuffle
                :recurse     recurse
                :position    position}))
