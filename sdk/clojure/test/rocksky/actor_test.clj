(ns rocksky.actor-test
  (:require [clojure.test :refer [deftest is testing]]
            [rocksky.actor :as actor]
            [rocksky.test-helpers :as h]))

(deftest get-profile-calls-nsid
  (let [[client calls] (h/mock-client {:response (h/json-response {:handle "alice"})})
        result (actor/get-profile client {:did "alice.rocksky.app"})
        req    (h/last-call calls)]
    (is (= {:handle "alice"} result))
    (is (= "https://api.example.com/xrpc/app.rocksky.actor.getProfile" (:url req)))
    (is (= :get (:method req)))
    (is (= {"did" "alice.rocksky.app"} (:query-params req)))))

(deftest get-actor-albums-translates-kebab-keys
  (let [[client calls] (h/mock-client {})]
    (actor/get-actor-albums client {:did   "alice"
                                    :limit 20
                                    :start-date "2026-01-01"
                                    :end-date   "2026-12-31"})
    (is (= {"did"       "alice"
            "limit"     "20"
            "startDate" "2026-01-01"
            "endDate"   "2026-12-31"}
           (:query-params (h/last-call calls)))
        ":start-date / :end-date map to startDate / endDate")))

(deftest get-actor-loved-songs
  (let [[client calls] (h/mock-client {})]
    (actor/get-actor-loved-songs client {:did "alice" :limit 10})
    (is (= "/xrpc/app.rocksky.actor.getActorLovedSongs"
           (subs (:url (h/last-call calls))
                 (count "https://api.example.com"))))))

(deftest get-actor-neighbours-and-compatibility
  (let [[client calls] (h/mock-client {})]
    (actor/get-actor-neighbours client {:did "alice"})
    (actor/get-actor-compatibility client {:did "alice"})
    (is (= 2 (h/call-count calls)))
    (is (.endsWith ^String (:url (first @calls))   "getActorNeighbours"))
    (is (.endsWith ^String (:url (second @calls))  "getActorCompatibility"))))
