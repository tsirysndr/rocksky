(ns rocksky.rockbox
  "Endpoints under app.rocksky.rockbox.*"
  (:require [rocksky.client :as c]))

(defn get-audio-settings
  "Get the authenticated user's Rockbox audio settings."
  [client]
  (c/query client :app.rocksky.rockbox.getAudioSettings))

(defn put-audio-settings
  "Upsert Rockbox audio settings. Only provided sections are merged.

  Optional keys: `:crossfade` `:equalizer` `:replay-gain` `:tone`."
  [client {:keys [crossfade equalizer replay-gain tone]}]
  (c/procedure client :app.rocksky.rockbox.putAudioSettings
               (cond-> {}
                 (some? crossfade)    (assoc :crossfade crossfade)
                 (some? equalizer)    (assoc :equalizer equalizer)
                 (some? replay-gain)  (assoc :replayGain replay-gain)
                 (some? tone)         (assoc :tone tone))))
