;; Fan out independent calls in parallel with `pmap`.
;;
;; A client is just an immutable map — share one across threads freely.

(require '[rocksky.client :as c]
         '[rocksky.actor  :as actor])

(def client (c/client))

(def handles
  ["tsiry.rocksky.app"
   "alice.rocksky.app"
   "bob.rocksky.app"])

(let [profiles (->> handles
                    (pmap (fn [did]
                            (try
                              (actor/get-profile client {:did did})
                              (catch Exception _ {:handle did :error true})))))]
  (doseq [{:keys [handle followersCount error]} profiles]
    (if error
      (println handle ": (not found)")
      (println handle ":" followersCount "followers"))))
