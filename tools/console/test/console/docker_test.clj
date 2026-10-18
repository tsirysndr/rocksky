(ns console.docker-test
  (:require [clojure.test :refer [deftest is run-tests]]
            [babashka.fs :as fs]
            [cheshire.core :as json]
            [console.core :as core]
            [console.docker :as docker]
            [console.shell :as sh]))

(def config
  {:services {:db {:ports [{:target 5432 :published "15433" :host_ip "0.0.0.0"}]
                   :environment {:POSTGRES_USER "test user" :POSTGRES_PASSWORD "test secret"
                                 :POSTGRES_DB "test db"}}
              :dragonfly {:ports [{:target 6379 :published "16379" :host_ip "127.0.0.2"}]}}})

(deftest clients-and-registration
  (doseq [[available command expected]
          [[#{"pgcli" "psql"} :postgres ["/bin/pgcli" "--host" "127.0.0.1" "--port" "15433" "--username" "test user" "--dbname" "test db"]]
           [#{"psql"} :postgres ["/bin/psql" "--host" "127.0.0.1" "--port" "15433" "--username" "test user" "--dbname" "test db"]]
           [#{"redis-cli"} :redis ["/bin/redis-cli" "-h" "127.0.0.2" "-p" "16379"]]]]
    (let [calls (atom [])
          tasks (:tasks (read-string (slurp "bb.edn")))]
      (with-redefs [fs/which #(when (available %) (str "/bin/" %))
                    sh/sh! (fn [args]
                             (is (= ["docker" "compose" "config" "--format" "json"] args))
                             {:exit 0 :out (json/generate-string config)})
                    sh/sh (fn [args opts] (swap! calls conj [args opts]) 0)]
        (is (= 0 ((ns-resolve 'console.docker (symbol (name command))))))
        (is (= 0 (core/dispatch {:cmd (keyword "docker" (name command)) :args []})))
        (is (= 0 (eval (:task (get tasks (symbol (str "docker:" (name command)))))))))
      (is (= [expected expected expected] (map first @calls)))
      (when (= :postgres command)
        (is (= "test secret" (get-in (first @calls) [1 :extra-env "PGPASSWORD"])))))))

(deftest fallback-and-errors
  (let [calls (atom [])]
    (with-redefs [fs/which (constantly nil)
                  sh/sh (fn [args] (swap! calls conj args) 0)]
      (is (= 0 (docker/postgres)))
      (is (= ["docker" "compose" "exec" "db" "sh" "-c"] (take 6 (first @calls))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"redis-cli is required" (docker/redis))))
    (with-redefs [fs/which (constantly "/bin/client")
                  sh/sh (fn [& args] (swap! calls conj args))]
      (doseq [result [{:exit 1 :out ""}
                      {:exit 0 :out (json/generate-string {:services {}})}]]
        (with-redefs [sh/sh! (constantly result)]
          (is (thrown? Exception (docker/postgres)))
          (is (thrown? Exception (docker/redis))))))
    (is (= 1 (count @calls)))))

(let [{:keys [fail error]} (run-tests 'console.docker-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
