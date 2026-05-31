(ns rocksky.song-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is]]
            [rocksky.song :as song]
            [rocksky.test-helpers :as h]))

(deftest get-song-by-various-ids
  (let [[client calls] (h/mock-client {})]
    (song/get-song client {:mbid "mb-123"})
    (song/get-song client {:isrc "USRC17607839"})
    (song/get-song client {:spotify-id "spotify-abc"})
    (let [[a b c] @calls]
      (is (= {"mbid" "mb-123"}            (:query-params a)))
      (is (= {"isrc" "USRC17607839"}      (:query-params b)))
      (is (= {"spotifyId" "spotify-abc"}  (:query-params c)))
      (is (every? #(.endsWith ^String (:url %) "getSong") @calls)))))

(deftest match-song-required
  (let [[client calls] (h/mock-client {})]
    (song/match-song client {:title "Creep" :artist "Radiohead" :isrc "X"})
    (is (= {"title" "Creep" "artist" "Radiohead" "isrc" "X"}
           (:query-params (h/last-call calls))))))

(deftest create-song-camel-cased-body
  (let [[client calls] (h/mock-client {})]
    (song/create-song client {:title "T" :artist "A" :album "Alb"
                              :album-artist "AA" :track-number 3 :mb-id "mb"})
    (let [body (json/parse-string (:body (h/last-call calls)) true)]
      (is (= "T" (:title body)))
      (is (= "AA" (:albumArtist body)))
      (is (= 3 (:trackNumber body)))
      (is (= "mb" (:mbId body))))))
