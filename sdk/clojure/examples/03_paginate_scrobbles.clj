;; Pagination — walking offset-based endpoints with a lazy sequence.

(require '[rocksky.client   :as c]
         '[rocksky.scrobble :as scrobble])

(defn scrobble-pages
  "Lazy sequence of scrobble pages for `did`, paging via `offset`.

  Terminates when the API returns an empty page."
  [client did page-size]
  (letfn [(step [offset]
            (lazy-seq
              (let [{:keys [scrobbles]}
                    (scrobble/get-scrobbles client
                                            {:did    did
                                             :limit  page-size
                                             :offset offset})]
                (when (seq scrobbles)
                  (cons scrobbles (step (+ offset page-size)))))))]
    (step 0)))

(let [client (c/client)
      pages  (scrobble-pages client "tsiry.rocksky.app" 50)]
  ;; Stream first 200 scrobbles and print their titles.
  (->> (mapcat identity pages)
       (take 200)
       (map :title)
       (run! println)))
