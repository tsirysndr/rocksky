(ns console.shell-test
  (:require [clojure.test :refer [deftest is run-tests]]
            [console.shell :as sh])
  (:import [sun.misc Signal SignalHandler]))

(deftest restores-original-interrupt-handler
  (let [signal (Signal. "INT")
        handler (reify SignalHandler (handle [_ _]))
        previous (Signal/handle signal handler)]
    (try
      (is (= 7 (sh/sh ["sh" "-c" "exit 7"])))
      (is (identical? handler (Signal/handle signal handler)))
      (is (thrown? Exception (sh/sh ["/nonexistent/rocksky-test-command"])))
      (is (identical? handler (Signal/handle signal handler)))
      (finally (Signal/handle signal previous)))))

(let [{:keys [fail error]} (run-tests 'console.shell-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
