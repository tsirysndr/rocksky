(ns rocksky.shout
  "Endpoints under app.rocksky.shout.*"
  (:require [rocksky.client :as c]))

(defn create-shout
  "Create a new shout. Required: `:message`."
  [client {:keys [message]}]
  (c/procedure client :app.rocksky.shout.createShout {:message message}))

(defn reply-shout
  "Reply to a shout. Required: `:shout-id` `:message`."
  [client {:keys [shout-id message]}]
  (c/procedure client :app.rocksky.shout.replyShout
               {:shoutId shout-id :message message}))

(defn remove-shout
  "Remove a shout. Required: `:id`."
  [client {:keys [id]}]
  (c/procedure client :app.rocksky.shout.removeShout nil {:id id}))

(defn report-shout
  "Report a shout. Required: `:shout-id`. Optional: `:reason`."
  [client {:keys [shout-id reason]}]
  (c/procedure client :app.rocksky.shout.reportShout
               (cond-> {:shoutId shout-id}
                 reason (assoc :reason reason))))

(defn get-album-shouts
  "Get shouts for an album.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.shout.getAlbumShouts
           {:uri uri :limit limit :offset offset}))

(defn get-artist-shouts
  "Get shouts for an artist.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.shout.getArtistShouts
           {:uri uri :limit limit :offset offset}))

(defn get-track-shouts
  "Get all shouts for a specific track. Required: `:uri`."
  [client {:keys [uri]}]
  (c/query client :app.rocksky.shout.getTrackShouts {:uri uri}))

(defn get-profile-shouts
  "Get shouts on an actor's profile.

  Required: `:did`. Optional: `:limit` `:offset`."
  [client {:keys [did limit offset]}]
  (c/query client :app.rocksky.shout.getProfileShouts
           {:did did :limit limit :offset offset}))

(defn get-shout-replies
  "Get replies to a shout.

  Required: `:uri`. Optional: `:limit` `:offset`."
  [client {:keys [uri limit offset]}]
  (c/query client :app.rocksky.shout.getShoutReplies
           {:uri uri :limit limit :offset offset}))
