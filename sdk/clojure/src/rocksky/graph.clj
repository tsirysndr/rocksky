(ns rocksky.graph
  "Endpoints under app.rocksky.graph.*"
  (:require [rocksky.client :as c]))

(defn follow-account
  "Follow an account. Required: `:account` (DID or handle)."
  [client {:keys [account]}]
  (c/procedure client :app.rocksky.graph.followAccount nil {:account account}))

(defn unfollow-account
  "Unfollow an account. Required: `:account`."
  [client {:keys [account]}]
  (c/procedure client :app.rocksky.graph.unfollowAccount nil {:account account}))

(defn get-followers
  "List followers of an actor.

  Required: `:actor`. Optional: `:limit` `:dids` `:cursor`."
  [client {:keys [actor limit dids cursor]}]
  (c/query client :app.rocksky.graph.getFollowers
           {:actor actor :limit limit :dids dids :cursor cursor}))

(defn get-follows
  "List accounts an actor follows.

  Required: `:actor`. Optional: `:limit` `:dids` `:cursor`."
  [client {:keys [actor limit dids cursor]}]
  (c/query client :app.rocksky.graph.getFollows
           {:actor actor :limit limit :dids dids :cursor cursor}))

(defn get-known-followers
  "List followers of `:actor` that the viewer also follows.

  Required: `:actor`. Optional: `:limit` `:cursor`."
  [client {:keys [actor limit cursor]}]
  (c/query client :app.rocksky.graph.getKnownFollowers
           {:actor actor :limit limit :cursor cursor}))
