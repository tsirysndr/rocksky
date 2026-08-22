(ns rocksky.rsql-test
  "Canonical RSQL builder vectors — identical across every Rocksky SDK.
  Pure: requires only rocksky.rsql, never the native-backed rocksky.core."
  (:require [clojure.test :refer [deftest is testing]]
            [rocksky.rsql :as rsql]))

(deftest comparisons
  (is (= "artist==Radiohead" (rsql/build (rsql/eq :artist "Radiohead"))))
  (is (= "artist==\"Daft Punk\"" (rsql/build (rsql/eq :artist "Daft Punk"))))
  (is (= "title==\"He said \\\"hi\\\"\""
         (rsql/build (rsql/eq :title "He said \"hi\""))))
  (is (= "artist==Daft*" (rsql/build (rsql/eq :artist "Daft*"))))
  (is (= "artist!=Eminem" (rsql/build (rsql/ne :artist "Eminem"))))
  (is (= "duration=gt=200000" (rsql/build (rsql/gt :duration 200000))))
  (is (= "year=ge=2000" (rsql/build (rsql/ge :year 2000))))
  (is (= "trackNumber=lt=5" (rsql/build (rsql/lt :trackNumber 5))))
  (is (= "year=le=1999" (rsql/build (rsql/le :year 1999))))
  (is (= "genre=in=(house,electro)"
         (rsql/build (rsql/in :genre ["house" "electro"]))))
  (is (= "genre=out=(\"hip hop\")" (rsql/build (rsql/out :genre ["hip hop"]))))
  (is (= "uri==null" (rsql/build (rsql/is-null :uri))))
  (is (= "uri!=null" (rsql/build (rsql/is-not-null :uri))))
  (is (= "liked==true" (rsql/build (rsql/eq :liked true)))))

(deftest combinators
  (let [a (rsql/eq :artist "Radiohead")]
    (is (= "artist==Radiohead;duration=gt=200000"
           (rsql/build (-> a (rsql/and (rsql/gt :duration 200000))))))
    (is (= "artist==Radiohead,artist==Muse"
           (rsql/build (-> a (rsql/or (rsql/eq :artist "Muse"))))))
    (testing "an :or operand is parenthesized inside AND"
      (is (= "(artist==Radiohead,artist==Muse);duration=gt=200000"
             (rsql/build (-> a
                             (rsql/or (rsql/eq :artist "Muse"))
                             (rsql/and (rsql/gt :duration 200000))))))
      (is (= "artist==Radiohead;(genre==house,genre==electro)"
             (rsql/build (-> a
                             (rsql/and (-> (rsql/eq :genre "house")
                                           (rsql/or (rsql/eq :genre "electro")))))))))
    (testing "OR never parenthesizes an AND operand"
      (is (= "artist==Radiohead;duration=gt=200000,genre==house"
             (rsql/build (-> a
                             (rsql/and (rsql/gt :duration 200000))
                             (rsql/or (rsql/eq :genre "house")))))))))

(deftest dotted-and-string-fields
  (testing ":track.artist reads as a plain keyword whose name keeps the dot"
    (is (nil? (namespace :track.artist)))
    (is (= "track.artist" (name :track.artist))))
  (is (= "track.artist==\"Daft Punk\""
         (rsql/build (rsql/eq :track.artist "Daft Punk"))))
  (testing "a namespaced keyword joins namespace and name with a dot"
    (is (= "track.artist==\"Daft Punk\""
           (rsql/build (rsql/eq :track/artist "Daft Punk")))))
  (testing "string fields are equivalent to keywords"
    (is (= (rsql/build (rsql/eq :artist "Radiohead"))
           (rsql/build (rsql/eq "artist" "Radiohead"))))
    (is (= (rsql/build (rsql/eq :track.artist "Daft Punk"))
           (rsql/build (rsql/eq "track.artist" "Daft Punk"))))))

(deftest empty-in-out-throws
  (is (thrown? clojure.lang.ExceptionInfo (rsql/in :genre [])))
  (is (thrown? clojure.lang.ExceptionInfo (rsql/out :genre []))))

(deftest build-accepts-strings
  (is (= "artist==Radiohead" (rsql/build "artist==Radiohead"))))
