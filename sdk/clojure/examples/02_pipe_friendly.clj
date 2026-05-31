;; Pipe-friendly composition.
;;
;; Every endpoint takes the client as its first argument and a params map as
;; the second, so they thread cleanly through `->`. This lets you chain
;; client construction → auth → request → response shaping in one pipeline.

(require '[clojure.string :as str]
         '[rocksky.client   :as c]
         '[rocksky.actor    :as actor]
         '[rocksky.scrobble :as scrobble]
         '[rocksky.charts   :as charts])

;; 1) Build → authenticate → call, all in one pipe.
(-> (c/client {:base-url "https://api.rocksky.app"})
    (c/with-token (System/getenv "ROCKSKY_TOKEN"))
    (actor/get-profile {:did "tsiry.rocksky.app"})
    :handle
    println)

;; 2) Reshape a result mid-pipeline.
(->> (charts/get-top-tracks
       (c/client)
       {:limit 5})
     :tracks
     (map (juxt :title :playCount))
     (map (fn [[t n]] (format "  %4d × %s" n t)))
     (str/join "\n")
     (str "Top 5 tracks (last 6 months):\n")
     println)

;; 3) Submit a scrobble in the same pipeline that built the client.
(-> (c/client)
    (c/with-token (System/getenv "ROCKSKY_TOKEN"))
    (scrobble/create-scrobble
      {:title  "Paranoid Android"
       :artist "Radiohead"
       :album  "OK Computer"
       :timestamp (-> (System/currentTimeMillis) (quot 1000))}))
