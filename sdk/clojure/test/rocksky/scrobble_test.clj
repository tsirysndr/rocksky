(ns rocksky.scrobble-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is testing]]
            [rocksky.scrobble :as scrobble]
            [rocksky.test-helpers :as h]))

(deftest create-scrobble-minimal
  (let [[client calls] (h/mock-client {:token "tok"})]
    (scrobble/create-scrobble client {:title "Song" :artist "Artist"})
    (let [req  (h/last-call calls)
          body (json/parse-string (:body req) true)]
      (is (= :post (:method req)))
      (is (.endsWith ^String (:url req) "createScrobble"))
      (is (= {:title "Song" :artist "Artist"} body)
          "only the required fields show up; everything else is dropped")
      (is (= "Bearer tok" (get-in req [:headers "Authorization"]))))))

(deftest create-scrobble-translates-camel-case-fields
  (let [[client calls] (h/mock-client {})]
    (scrobble/create-scrobble client
                              {:title             "Song"
                               :artist            "Artist"
                               :album-art         "https://img/x.jpg"
                               :track-number      4
                               :spotify-link      "https://open.spotify.com/track/1"
                               :copyright-message "(c) 2026"
                               :timestamp         1700000000})
    (let [body (json/parse-string (:body (h/last-call calls)) true)]
      (is (= "https://img/x.jpg" (:albumArt body)))
      (is (= 4                    (:trackNumber body)))
      (is (= "https://open.spotify.com/track/1" (:spotifyLink body)))
      (is (= "(c) 2026"           (:copyrightMessage body)))
      (is (= 1700000000           (:timestamp body))))))

(deftest get-scrobbles-paginates
  (let [[client calls] (h/mock-client {})]
    (scrobble/get-scrobbles client {:did "alice" :limit 100 :offset 50 :following true})
    (is (= {"did" "alice" "limit" "100" "offset" "50" "following" "true"}
           (:query-params (h/last-call calls))))))

(deftest get-scrobble-required-uri
  (let [[client calls] (h/mock-client {})]
    (scrobble/get-scrobble client {:uri "at://x"})
    (is (= {"uri" "at://x"} (:query-params (h/last-call calls))))))
