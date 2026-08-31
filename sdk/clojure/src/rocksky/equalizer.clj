(ns rocksky.equalizer
  "app.rocksky.equalizer.* — saved EQ presets (app.rocksky.equalizer records in
  the caller's repo).

  Units are rockbox's internal ones: band frequency in Hz, gain in tenths of dB
  (30 = +3.0 dB), q × 10 (7 = Q 0.7); precut in tenths of dB (-240..0)."
  (:require [rocksky.core :as core]))

(defn- prune [m] (into {} (remove (comp nil? val) m)))

;; app.rocksky.equalizer.listPresets — {"presets" [...]}. Omit :actor for the
;; authenticated viewer's own presets (auth-gated, needs :token).
(defn presets
  ([] (presets {}))
  ([{:keys [actor token base]}]
   (core/query "app.rocksky.equalizer.listPresets" (prune {:did actor}) base token)))

;; app.rocksky.equalizer.putPreset — the rkey is `name` slugified, so an
;; existing name overwrites that preset; `bands` are {:frequency :gain :q}
;; maps. Its input is a JSON body, so it rides the body-carrying library-post
;; rather than the query-string core/procedure. Returns the saved preset view.
(defn put-preset
  [name bands {:keys [token precut base]}]
  (core/library-post token "app.rocksky.equalizer.putPreset"
                     (prune {:name name :precut precut :bands bands})
                     base))

;; app.rocksky.equalizer.deletePreset — empty response
(defn delete-preset
  [rkey {:keys [token base]}]
  (core/procedure "app.rocksky.equalizer.deletePreset" {:rkey rkey} base token))
