;; Quickstart — the smallest possible Rocksky SDK program.
;;
;; Run with:
;;   clojure -M -e "(load-file \"examples/01_quickstart.clj\")"
;; or from a REPL:
;;   (load-file "examples/01_quickstart.clj")

(require '[rocksky.core :as rs])

(def client (rs/client {:base-url "https://api.rocksky.app"}))

;; Public endpoints don't need a token.
(let [profile (rs/get-profile client {:did "tsiry.rocksky.app"})]
  (println "Handle:     " (:handle profile))
  (println "Followers:  " (:followersCount profile))
  (println "Scrobbles:  " (:scrobblesCount profile)))
