(ns rocksky.spotify-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.spotify :as spotify]
            [rocksky.test-helpers :as h]))

(deftest spotify-transport-controls
  (let [[client calls] (h/mock-client {})]
    (spotify/play client)
    (spotify/pause client)
    (spotify/next-track client)
    (spotify/previous-track client)
    (is (= 4 (h/call-count calls)))
    (doseq [req @calls]
      (is (= :post (:method req)))
      (is (nil? (:body req)))
      (is (nil? (:query-params req))))))

(deftest spotify-seek
  (let [[client calls] (h/mock-client {})]
    (spotify/seek client {:position 30})
    (is (= {"position" "30"} (:query-params (h/last-call calls))))))

(deftest spotify-currently-playing
  (let [[client calls] (h/mock-client {})]
    (spotify/get-currently-playing client)
    (is (= :get (:method (h/last-call calls))))))
