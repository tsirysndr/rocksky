(ns rocksky.shout-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is]]
            [rocksky.shout :as shout]
            [rocksky.test-helpers :as h]))

(deftest create-shout-body
  (let [[client calls] (h/mock-client {})]
    (shout/create-shout client {:message "Hi"})
    (is (= {:message "Hi"}
           (json/parse-string (:body (h/last-call calls)) true)))))

(deftest reply-shout-camel-case
  (let [[client calls] (h/mock-client {})]
    (shout/reply-shout client {:shout-id "shout-1" :message "yes"})
    (is (= {:shoutId "shout-1" :message "yes"}
           (json/parse-string (:body (h/last-call calls)) true)))))

(deftest remove-shout-uses-params
  (let [[client calls] (h/mock-client {})]
    (shout/remove-shout client {:id "shout-1"})
    (is (nil? (:body (h/last-call calls))))
    (is (= {"id" "shout-1"} (:query-params (h/last-call calls))))))

(deftest report-shout-optional-reason
  (let [[client calls] (h/mock-client {})]
    (shout/report-shout client {:shout-id "1"})
    (shout/report-shout client {:shout-id "1" :reason "spam"})
    (let [[a b] @calls]
      (is (= {:shoutId "1"} (json/parse-string (:body a) true)))
      (is (= {:shoutId "1" :reason "spam"} (json/parse-string (:body b) true))))))

(deftest get-album-and-track-shouts
  (let [[client calls] (h/mock-client {})]
    (shout/get-album-shouts client {:uri "at://album/1" :limit 5})
    (shout/get-track-shouts client {:uri "at://track/1"})
    (is (.endsWith ^String (:url (first  @calls)) "getAlbumShouts"))
    (is (.endsWith ^String (:url (second @calls)) "getTrackShouts"))))
