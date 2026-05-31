(ns rocksky.graph-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.graph :as graph]
            [rocksky.test-helpers :as h]))

(deftest follow-and-unfollow-use-query-params
  (let [[client calls] (h/mock-client {})]
    (graph/follow-account client {:account "bob.rocksky.app"})
    (graph/unfollow-account client {:account "bob.rocksky.app"})
    (doseq [req @calls]
      (is (= :post (:method req)))
      (is (nil? (:body req)) "follow/unfollow take params, not a JSON body")
      (is (= {"account" "bob.rocksky.app"} (:query-params req))))))

(deftest get-followers-includes-dids-array
  (let [[client calls] (h/mock-client {})]
    (graph/get-followers client {:actor "alice" :dids ["did:1" "did:2"] :limit 10})
    (let [params (:query-params (h/last-call calls))]
      (is (= "alice" (get params "actor")))
      (is (= ["did:1" "did:2"] (get params "dids")))
      (is (= "10" (get params "limit"))))))

(deftest get-follows-and-known-followers
  (let [[client calls] (h/mock-client {})]
    (graph/get-follows client {:actor "alice"})
    (graph/get-known-followers client {:actor "alice"})
    (is (.endsWith ^String (:url (first  @calls)) "getFollows"))
    (is (.endsWith ^String (:url (second @calls)) "getKnownFollowers"))))
