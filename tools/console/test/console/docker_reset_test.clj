(ns console.docker-reset-test
  (:require [clojure.test :refer [deftest is run-tests]]
            [cheshire.core :as json]
            [console.core :as core]
            [console.docker :as docker]
            [console.shell :as sh]))
(def config {:services {:db {:ports [{:target 5432 :published "15433"}]
                            :environment {:POSTGRES_USER "test user" :POSTGRES_PASSWORD "secret"
                                          :POSTGRES_DB "test db"}}}})
(deftest reset-workflow
  (doseq [[options project] [[[:force] "gleam"] [[:force :purescript] "purescript"]]]
    (let [calls (atom [])]
      (with-redefs [sh/sh! (constantly {:exit 0 :out (json/generate-string config)})
                    sh/sh (fn [& args] (swap! calls conj args) (if (= 1 (count @calls)) 0 9))]
        (is (= 9 (apply docker/postgres-reset options))))
      (is (= 2 (count @calls)))
      (let [[reset-command] (first @calls)
            [migration-command opts] (second @calls)]
        (is (= ["docker" "compose" "exec" "-T" "db" "sh" "-c"] (take 7 reset-command)))
        (is (= ["reset-postgres" "test user" "test db"] (take-last 3 reset-command)))
        (is (= ["env" "-u" "PGSERVICE" "-u" "PGSERVICEFILE" "bun" "run" "db:migrate"] migration-command))
        (is (= (str (sh/repo-root) "/" project) (:dir opts)))
        (is (= #{"postgresql://test%20user:secret@127.0.0.1:15433/test%20db?sslmode=disable"}
               (set (vals (:extra-env opts)))))))))
(deftest invalid-options-and-failures
  (let [calls (atom [])]
    (with-redefs [sh/sh! (fn [_] (swap! calls conj :config) {:exit 0 :out (json/generate-string config)})
                  sh/sh (fn [& args] (swap! calls conj args) 7)]
      (doseq [options [[] [:purescript] [:force :unknown] [:force :gleam :purescript]]]
        (is (thrown? Exception (apply docker/postgres-reset options))))
      (is (empty? @calls))
      (is (= 7 (docker/postgres-reset :force)))
      (is (= 2 (count @calls))))))
(deftest registration-and-protected-databases
  (let [calls (atom []) tasks (:tasks (read-string (slurp "bb.edn")))]
    (with-redefs [sh/sh! (constantly {:exit 0 :out (json/generate-string config)})
                  sh/sh (fn [& args] (swap! calls conj args) 0)]
      (is (= 0 (core/dispatch {:cmd :docker/postgres-reset :args [:force]})))
      (is (= 0 (binding [*command-line-args* ["--force" "purescript"]]
                 (eval (:task (get tasks 'docker:postgres-reset)))))))
    (is (= 4 (count @calls)))
    (reset! calls [])
    (doseq [database ["postgres" "template0" "template1"]]
      (with-redefs [sh/sh! (constantly {:exit 0 :out (json/generate-string (assoc-in config [:services :db :environment :POSTGRES_DB] database))})
                    sh/sh (fn [& args] (swap! calls conj args))]
        (is (thrown? Exception (docker/postgres-reset :force)))))
    (is (empty? @calls))))
(let [{:keys [fail error]} (run-tests 'console.docker-reset-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
