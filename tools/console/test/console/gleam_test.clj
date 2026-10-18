(ns console.gleam-test
  (:require [clojure.test :refer [deftest is run-tests testing]]
            [clojure.string :as str]
            [cheshire.core :as json]
            [console.gleam]
            [console.shell :as sh]))

(deftest package-script-registration
  (let [root (sh/repo-root)
        scripts (keys (get (json/parse-string (slurp (str root "/gleam/package.json"))) "scripts"))
        tasks (:tasks (read-string (slurp (str root "/tools/console/bb.edn"))))
        forms (read-string (str "[" (slurp (str root "/tools/console/src/console/core.clj")) "]"))
        registry (last (first (filter #(and (seq? %) (= 'def (first %)) (= 'registry (second %))) forms)))
        registered (:cmds (first (filter #(= "gleam" (:group %)) registry)))
        names (set (map #(str/replace % ":" "-") scripts))
        args ["did:plc:example" "name with spaces" "--dry-run"]]
    (is (= names (set (map (comp name first) registered))))
    (is (= names (set (map (comp name key) (ns-publics 'console.gleam)))))
    (is (= (set (map #(symbol (str "gleam:" %)) scripts))
           (set (filter #(str/starts-with? (str %) "gleam:") (keys tasks)))))
    (doseq [script scripts]
      (testing script
        (let [command (symbol (str/replace script ":" "-"))
              wrapper (ns-resolve 'console.gleam command)
              task (get tasks (symbol (str "gleam:" script)))
              calls (atom [])]
          (is (some? wrapper))
          (is (string? (:doc (meta wrapper))))
          (is (some? task))
          (with-redefs [sh/sh (fn [cmd opts] (swap! calls conj [cmd opts]) 17)]
            (is (= 17 (wrapper)))
            (is (= 17 (apply wrapper args)))
            (binding [*command-line-args* args]
              (is (= 17 (eval (:task task))))))
          (is (= [(vector ["bun" "run" script] {:dir (str root "/gleam")})
                  (vector (into ["bun" "run" script] args) {:dir (str root "/gleam")})
                  (vector (into ["bun" "run" script] args) {:dir (str root "/gleam")})]
                 @calls)))))))

(let [{:keys [fail error]} (run-tests 'console.gleam-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
