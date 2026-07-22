(ns rocksky.native-example
  "Read-only tour of the native Rocksky core (no auth needed).

  Run:  clojure -M:native -m rocksky.native-example
  (needs the native lib — see ./build-core.sh or set ROCKSKY_NATIVE_LIB)."
  (:require [rocksky.ffi :as core]))

(defn -main [& _]
  (println "song hash:" (core/song-hash "Chaser" "Calibro 35" "Jazzploitation"))
  (let [s (core/global-stats)]
    (println (format "global: %s scrobbles · %s users · %s tracks"
                     (get s "scrobbles") (get s "users") (get s "tracks"))))
  (println "top tracks:")
  (doseq [t (core/top-tracks 5 0)]
    (println (format "  %s — %s" (get t "artist") (get t "title"))))
  (shutdown-agents))
