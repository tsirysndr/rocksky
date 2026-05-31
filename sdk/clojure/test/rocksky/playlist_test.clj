(ns rocksky.playlist-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.playlist :as playlist]
            [rocksky.test-helpers :as h]))

(deftest playlists-paginate
  (let [[client calls] (h/mock-client {})]
    (playlist/get-playlists client {:limit 25 :offset 100})
    (is (= {"limit" "25" "offset" "100"}
           (:query-params (h/last-call calls))))))

(deftest create-playlist-uses-params
  (let [[client calls] (h/mock-client {})]
    (playlist/create-playlist client {:name "Vibes" :description "Chill"})
    (let [req (h/last-call calls)]
      (is (= :post (:method req)))
      (is (nil? (:body req)))
      (is (= {"name" "Vibes" "description" "Chill"} (:query-params req))))))

(deftest insert-files-list-param
  (let [[client calls] (h/mock-client {})]
    (playlist/insert-files client {:uri "at://pl/1" :files ["a" "b" "c"]})
    (is (= ["a" "b" "c"] (get (:query-params (h/last-call calls)) "files")))))

(deftest start-and-remove-playlist
  (let [[client calls] (h/mock-client {})]
    (playlist/start-playlist client {:uri "at://pl/1" :shuffle true})
    (playlist/remove-playlist client {:uri "at://pl/1"})
    (is (.endsWith ^String (:url (first  @calls)) "startPlaylist"))
    (is (.endsWith ^String (:url (second @calls)) "removePlaylist"))))
