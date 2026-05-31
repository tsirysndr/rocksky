(ns rocksky.stats-test
  (:require [clojure.test :refer [deftest is]]
            [rocksky.stats :as stats]
            [rocksky.test-helpers :as h]))

(deftest get-stats
  (let [[client calls] (h/mock-client {})]
    (stats/get-stats client {:did "alice"})
    (is (.endsWith ^String (:url (h/last-call calls)) "getStats"))
    (is (= {"did" "alice"} (:query-params (h/last-call calls))))))

(deftest get-wrapped-with-year
  (let [[client calls] (h/mock-client {})]
    (stats/get-wrapped client {:did "alice" :year 2025})
    (is (= {"did" "alice" "year" "2025"}
           (:query-params (h/last-call calls))))))
