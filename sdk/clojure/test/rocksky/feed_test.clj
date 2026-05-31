(ns rocksky.feed-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.feed :as feed]
            [rocksky.test-helpers :as h]))

(deftest search-passes-query
  (let [[client calls] (h/mock-client {})]
    (feed/search client {:query "radiohead"})
    (is (= {"query" "radiohead"} (:query-params (h/last-call calls))))))

(deftest get-feed-cursor-pagination
  (let [[client calls] (h/mock-client {})]
    (feed/get-feed client {:feed "at://feed/1" :limit 20 :cursor "abc"})
    (is (= {"feed" "at://feed/1" "limit" "20" "cursor" "abc"}
           (:query-params (h/last-call calls))))))

(deftest recommendations
  (let [[client calls] (h/mock-client {})]
    (feed/get-recommendations client {:did "alice" :limit 10})
    (feed/get-artist-recommendations client {:did "alice"})
    (feed/get-album-recommendations client {:did "alice"})
    (is (.endsWith ^String (:url (nth @calls 0)) "getRecommendations"))
    (is (.endsWith ^String (:url (nth @calls 1)) "getArtistRecommendations"))
    (is (.endsWith ^String (:url (nth @calls 2)) "getAlbumRecommendations"))))

(deftest stories-zero-arg
  (let [[client calls] (h/mock-client {})]
    (feed/get-stories client)
    (let [req (h/last-call calls)]
      (is (= :get (:method req)))
      (is (.endsWith ^String (:url req) "getStories")
          "no params required for the zero-arg variant"))))
