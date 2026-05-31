(ns rocksky.like-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is]]
            [rocksky.like :as like]
            [rocksky.test-helpers :as h]))

(deftest like-and-dislike-song
  (let [[client calls] (h/mock-client {})]
    (like/like-song client {:uri "at://song/1"})
    (like/dislike-song client {:uri "at://song/1"})
    (is (= 2 (h/call-count calls)))
    (doseq [req @calls]
      (is (= :post (:method req)))
      (is (= {:uri "at://song/1"} (json/parse-string (:body req) true))))))

(deftest like-and-dislike-shout
  (let [[client calls] (h/mock-client {})]
    (like/like-shout client {:uri "at://shout/1"})
    (like/dislike-shout client {:uri "at://shout/1"})
    (is (.endsWith ^String (:url (first  @calls)) "likeShout"))
    (is (.endsWith ^String (:url (second @calls)) "dislikeShout"))))
