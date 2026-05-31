(ns rocksky.mirror
  "Endpoints under app.rocksky.mirror.*"
  (:require [rocksky.client :as c]))

(defn get-mirror-sources
  "Get the authenticated user's scrobble mirror sources
  (Last.fm, ListenBrainz, Teal.fm)."
  [client]
  (c/query client :app.rocksky.mirror.getMirrorSources))

(defn put-mirror-source
  "Upsert a mirror source for the authenticated user.

  Required: `:provider` (`\"lastfm\"`, `\"listenbrainz\"`, `\"tealfm\"`).
  Optional: `:enabled` `:external-username` `:api-key`."
  [client {:keys [provider enabled external-username api-key]}]
  (c/procedure client :app.rocksky.mirror.putMirrorSource
               (cond-> {:provider provider}
                 (some? enabled)           (assoc :enabled enabled)
                 (some? external-username) (assoc :externalUsername external-username)
                 (some? api-key)           (assoc :apiKey api-key))))
