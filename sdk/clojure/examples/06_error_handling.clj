;; Error handling — the SDK throws `ex-info` on non-2xx responses, with
;; `:status`, `:nsid`, `:method`, and the parsed `:body` in the ex-data.

(require '[rocksky.client :as c]
         '[rocksky.album  :as album])

(def client (c/client))

(try
  (album/get-album client {:uri "at://did:plc:doesnotexist/app.rocksky.album/x"})
  (catch clojure.lang.ExceptionInfo e
    (let [{:keys [status nsid body]} (ex-data e)]
      (println "Request failed:")
      (println "  nsid   :" nsid)
      (println "  status :" status)
      (println "  body   :" body))))
