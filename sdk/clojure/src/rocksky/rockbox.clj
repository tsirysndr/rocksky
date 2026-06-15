(ns rocksky.rockbox
  "Endpoints under app.rocksky.rockbox.*"
  (:require [rocksky.client :as c]))

(defn get-audio-settings
  "Get Rockbox audio settings.

  Pass `:did` to fetch any user's settings publicly (no auth needed).
  Omit `:did` to fetch the authenticated caller's own settings (auth required)."
  ([client] (c/query client :app.rocksky.rockbox.getAudioSettings))
  ([client {:keys [did]}]
   (c/query client :app.rocksky.rockbox.getAudioSettings
            (cond-> {} (some? did) (assoc :did did)))))

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
