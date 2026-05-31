(ns rocksky.stats
  "Endpoints under app.rocksky.stats.*"
  (:require [rocksky.client :as c]))

(defn get-stats
  "Get aggregate stats for a user.

  Required: `:did`."
  [client {:keys [did]}]
  (c/query client :app.rocksky.stats.getStats {:did did}))

(defn get-wrapped
  "Get a user's year-in-review Wrapped stats.

  Required: `:did`. Optional: `:year`."
  [client {:keys [did year]}]
  (c/query client :app.rocksky.stats.getWrapped {:did did :year year}))
