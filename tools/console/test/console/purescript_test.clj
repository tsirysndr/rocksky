(ns console.purescript-test
  (:require [clojure.test :refer [deftest is testing run-tests]]
            [clojure.string :as str]
            [console.core :as core]
            [console.purescript :as ps]
            [console.shell :as sh]))

(deftest registered-entry-points
  (let [tasks (:tasks (binding [*read-eval* false] (read-string (slurp "bb.edn"))))
        args ["--option" "argument with spaces" "$(literal);value"]
        calls (atom [])
        directory (str (sh/repo-root) "/purescript")]
    (with-redefs [sh/sh (fn [cmd opts] (swap! calls conj [cmd opts]) 17)]
      (doseq [[command script] ps/script-commands]
        (testing script
          (let [f (ns-resolve 'console.purescript (symbol (name command)))
                task (get tasks (symbol (str "ps:" script)))
                expected [(into ["bun" "run" script] args) {:dir directory}]]
            (is (some? f))
            (is (string? (:doc (meta f))))
            (is (some? task))
            (reset! calls [])
            (is (= 17 (apply f args)))
            (is (= 17 (core/dispatch {:cmd (keyword "purescript" (name command))
                                      :args args})))
            (is (= 17 (binding [*command-line-args* args] (eval (:task task)))))
            (is (= [expected expected expected] @calls))))))))

(deftest discoverable-in-help
  (let [output (with-out-str (core/ls))]
    (is (str/includes? output "console.purescript"))
    (doseq [[command script] ps/script-commands]
      (is (str/includes? output (str command)))
      (is (str/includes? output (str "bun run " script " in purescript/"))))))

(deftest force-keyword-forwarding
  (let [calls (atom [])]
    (with-redefs [sh/bun (fn [& args] (swap! calls conj args) 0)]
      (ps/env-generate :force "--help")
      (ps/env-generate "--force")
      (ps/env-generate))
    (is (= [["purescript" "env:generate" "--force" "--help"]
            ["purescript" "env:generate" "--force"]
            ["purescript" "env:generate"]]
           @calls))))

(defn -main [& _]
  (let [{:keys [fail error]} (run-tests 'console.purescript-test)]
    (when (pos? (+ fail error)) (System/exit 1))))
