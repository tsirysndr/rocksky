;; Latest scrobble per user, optionally filtered by feed generator or
;; restricted to users the viewer follows.
;;
;; Run:
;;   clojure -X:examples examples/08_stories.clj
;;   clojure -X:examples examples/08_stories.clj :mode metalcore
;;   ROCKSKY_TOKEN=... clojure -X:examples examples/08_stories.clj :mode following

(require '[rocksky.client :as c]
         '[rocksky.feed   :as feed])

(def feeds
  {"metalcore" "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore"
   "trap"      "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap"
   "synthwave" "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave"})

(let [mode    (or (System/getProperty "mode") "recent")
      token   (System/getenv "ROCKSKY_TOKEN")
      client  (cond-> (c/client)
                token (c/with-token token))
      params  (cond-> {:size 10}
                (contains? feeds mode) (assoc :feed (get feeds mode))
                (= "following" mode)   (assoc :following true))
      result  (feed/get-stories client params)]
  (doseq [s (:stories result)]
    (println (format "@%-24s %s — %s" (:handle s) (:artist s) (:title s))))
  (println)
  (println (count (:stories result)) "stories"))
