;; Submit a scrobble — minimal authenticated POST.

(require '[rocksky.client   :as c]
         '[rocksky.scrobble :as scrobble])

(def client
  (c/client {:token (or (System/getenv "ROCKSKY_TOKEN")
                        (throw (ex-info "ROCKSKY_TOKEN not set" {})))}))

(scrobble/create-scrobble
  client
  {:title         "Karma Police"
   :artist        "Radiohead"
   :album         "OK Computer"
   :duration      262000
   :album-art     "https://i.scdn.co/image/ab67616d0000b273c8b444df094279e70d0ed856"
   :track-number  6
   :year          1997
   :spotify-link  "https://open.spotify.com/track/63OQupATfueTdZMWTxW03A"
   :timestamp     (-> (System/currentTimeMillis) (quot 1000))})
