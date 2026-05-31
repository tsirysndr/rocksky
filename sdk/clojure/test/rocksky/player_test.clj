(ns rocksky.player-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.player :as player]
            [rocksky.test-helpers :as h]))

(deftest play-pause-no-arg
  (let [[client calls] (h/mock-client {})]
    (player/play client)
    (player/pause client)
    (is (= 2 (h/call-count calls)))
    (doseq [req @calls]
      (is (= :post (:method req)))
      (is (nil? (:body req))))))

(deftest seek-required-position
  (let [[client calls] (h/mock-client {})]
    (player/seek client {:position 42})
    (let [req (h/last-call calls)]
      (is (= :post (:method req)))
      (is (= {"position" "42"} (:query-params req))))))

(deftest add-items-to-queue
  (let [[client calls] (h/mock-client {})]
    (player/add-items-to-queue client {:items ["f1" "f2"] :shuffle true})
    (let [params (:query-params (h/last-call calls))]
      (is (= ["f1" "f2"] (get params "items")))
      (is (= "true" (get params "shuffle"))))))

(deftest currently-playing-with-actor
  (let [[client calls] (h/mock-client {})]
    (player/get-currently-playing client {:actor "alice"})
    (is (= :get (:method (h/last-call calls))))
    (is (= {"actor" "alice"} (:query-params (h/last-call calls))))))
