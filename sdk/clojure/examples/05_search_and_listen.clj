;; Search for a track, then look at its recent listeners.

(require '[rocksky.client :as c]
         '[rocksky.feed   :as feed]
         '[rocksky.song   :as song])

(let [client (c/client)
      hit    (->> (feed/search client {:query "paranoid android"})
                  :hits
                  (filter #(= "song" (:type %)))
                  first)]
  (when-let [uri (:uri hit)]
    (println "Match:" (:title hit) "by" (:artist hit))
    (->> (song/get-song-recent-listeners client {:uri uri :limit 5})
         :listeners
         (map (juxt :handle :timestamp))
         (run! (fn [[handle ts]] (println " -" handle "@" ts))))))
