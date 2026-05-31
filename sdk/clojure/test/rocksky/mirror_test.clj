(ns rocksky.mirror-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is]]
            [rocksky.mirror :as mirror]
            [rocksky.test-helpers :as h]))

(deftest get-mirror-sources
  (let [[client calls] (h/mock-client
                         {:response (h/json-response {:sources []})
                          :token    "tok"})]
    (is (= {:sources []} (mirror/get-mirror-sources client)))
    (is (= "Bearer tok"
           (get-in (h/last-call calls) [:headers "Authorization"])))))

(deftest put-mirror-source-minimal
  (let [[client calls] (h/mock-client {})]
    (mirror/put-mirror-source client {:provider "tealfm"})
    (is (= {:provider "tealfm"}
           (json/parse-string (:body (h/last-call calls)) true))
        "fields with no value are omitted entirely")))

(deftest put-mirror-source-with-false-and-empty-string
  (let [[client calls] (h/mock-client {})]
    (mirror/put-mirror-source client {:provider "lastfm"
                                      :enabled false
                                      :api-key ""})
    (let [body (json/parse-string (:body (h/last-call calls)) true)]
      (is (= false (:enabled body))
          "`:enabled false` must round-trip — it's a real toggle, not nil")
      (is (= "" (:apiKey body))
          "empty string clears the existing key, per the lexicon"))))
