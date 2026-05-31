(ns rocksky.album-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.album :as album]
            [rocksky.test-helpers :as h]))

(deftest get-album-passes-uri
  (let [[client calls] (h/mock-client {})
        uri "at://did:plc:abc/app.rocksky.album/123"]
    (album/get-album client {:uri uri})
    (let [req (h/last-call calls)]
      (is (.endsWith ^String (:url req) "getAlbum"))
      (is (= {"uri" uri} (:query-params req))))))

(deftest get-albums-defaults-and-filters
  (let [[client calls] (h/mock-client {})]
    (album/get-albums client {:limit 5 :genre "rock"})
    (is (= {"limit" "5" "genre" "rock"}
           (:query-params (h/last-call calls))))))

(deftest get-album-tracks
  (let [[client calls] (h/mock-client {:response (h/json-response {:tracks []})})
        result (album/get-album-tracks client {:uri "at://x"})]
    (is (= {:tracks []} result))
    (is (.endsWith ^String (:url (h/last-call calls)) "getAlbumTracks"))))
