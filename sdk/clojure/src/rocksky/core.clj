(ns rocksky.core
  "Convenience facade — pulls the most common bits to a single namespace.

  ```
  (require '[rocksky.core :as rs])

  (def c (rs/client {:token \"...\"}))
  (rs/get-profile c {:did \"alice.rocksky.app\"})
  ```

  For everything else, require the per-resource namespaces directly
  (`rocksky.actor`, `rocksky.album`, `rocksky.scrobble`, ...)."
  (:require [rocksky.actor    :as actor]
            [rocksky.client   :as client]
            [rocksky.feed     :as feed]
            [rocksky.scrobble :as scrobble]
            [rocksky.stats    :as stats]))

(def client        client/client)
(def with-token    client/with-token)
(def with-base-url client/with-base-url)
(def with-headers  client/with-headers)
(def query         client/query)
(def procedure     client/procedure)

(def get-profile        actor/get-profile)
(def create-scrobble    scrobble/create-scrobble)
(def get-scrobbles      scrobble/get-scrobbles)
(def search             feed/search)
(def get-stats          stats/get-stats)
(def get-wrapped        stats/get-wrapped)
