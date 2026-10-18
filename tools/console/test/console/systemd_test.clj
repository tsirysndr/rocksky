(ns console.systemd-test
  (:require [clojure.test :refer [deftest is run-tests testing]]
            [clojure.string :as str]
            [console.core :as core]
            [console.remote :as remote]
            [console.shell :as sh]
            [console.systemd :as systemd]))

(defn capture [f]
  (let [calls (atom [])]
    (with-redefs [sh/sh (fn [args] (swap! calls conj args) 3)]
      (is (= 3 (f))))
    @calls))

(deftest target-and-argument-handling
  (is (= [["ssh" "--" remote/prod-host
           "'systemctl' '--no-pager' '--full' 'status' 'rocksky-gleam.service' 'rocksky-gleam-xrpc.service'"]]
         (capture #(systemd/status :gleam "rocksky-gleam-xrpc.service"))))
  (binding [systemd/*host* nil]
    (is (= [["systemctl" "--no-pager" "--full" "stop" "rocksky.service" "rocksky-scrobble-abuse-sweep.timer"]]
           (capture #(systemd/stop "rocksky" "scrobble-abuse-sweep.timer"))))
    (is (= [["systemctl" "--no-pager" "--full" "list-units" "--all" "--type=service,timer"
             "rocksky.service" "rocksky-*.service" "rocksky-*.timer"]]
           (capture systemd/list)))
    (is (= [["systemctl" "--no-pager" "--full" "enable" "rocksky-gleam.service"]]
           (capture #(systemd/enable :gleam))))
    (is (= [["systemctl" "--no-pager" "--full" "enable" "--now" "rocksky-gleam.service"]]
           (capture #(systemd/enable-now :gleam))))
    (is (= [["systemctl" "--no-pager" "--full" "disable" "--now" "rocksky-gleam.service"]]
           (capture #(systemd/disable-now :gleam))))
    (is (= [["systemctl" "--no-pager" "--full" "daemon-reload"]]
           (capture systemd/daemon-reload))))
  (is (= [["sudo" "-n" "systemctl" "--no-pager" "--full" "restart" "rocksky-gleam.service"]]
         (capture #(systemd/cli :restart "--local" "--sudo" "gleam"))))
  (is (= [["ssh" "--" "ops@staging.test"
           "'sudo' '-n' 'systemctl' '--no-pager' '--full' 'is-enabled' 'rocksky-gleam.service'"]]
         (capture #(systemd/cli :is-enabled "--host" "ops@staging.test" "--sudo" "gleam"))))
  (binding [systemd/*host* nil]
    (is (= [["journalctl" "--no-pager" "--unit" "rocksky-gleam.service" "--lines" "25" "--follow" "--boot"]]
           (capture #(systemd/logs :gleam 25 :follow :boot))))
    (is (= [["journalctl" "--no-pager" "--unit" "rocksky-gleam.service" "--lines" "25" "--follow"]]
           (capture #(systemd/cli :logs "--local" "gleam" "25" "follow"))))))

(deftest invalid-input-never-spawns-a-process
  (let [calls (atom [])]
    (with-redefs [sh/sh #(swap! calls conj %)]
      (doseq [value ["*" "rocksky-*" "gleam; touch /tmp/no" "../ssh" "--all" "gleam.service --now" :other/gleam nil "gleam.socket"]]
        (is (thrown? Exception (systemd/stop value))))
      (doseq [f [systemd/start systemd/stop systemd/restart systemd/enable systemd/disable systemd/reset-failed]]
        (is (thrown? Exception (f))))
      (is (thrown? Exception (systemd/cli :stop "--host")))
      (is (thrown? Exception (systemd/cli :stop "--host" "-oProxyCommand=bad" "gleam")))
      (is (thrown? Exception (systemd/cli :unknown "gleam")))
      (is (thrown? Exception (systemd/logs "gleam" "--unit=ssh")))
      (is (thrown? Exception (systemd/logs "gleam" -1))))
    (is (empty? @calls))))

(deftest all-registered-commands-dispatch-without-running-services
  (let [group (first (filter #(= "systemd" (:group %)) (var-get (ns-resolve 'console.core 'registry))))
        tasks (:tasks (read-string (slurp "bb.edn")))
        no-units #{:list :list-files :daemon-reload}]
    (is (= 19 (count (:cmds group))))
    (is (str/includes? (with-out-str (core/ls)) "console.systemd"))
    (doseq [[command _] (:cmds group)]
      (testing command
        (let [args (if (no-units command) [] ["gleam"])
              f (ns-resolve 'console.systemd (symbol (name command)))
              task (get tasks (symbol (str "systemd:" (name command))))]
          (is (some? f))
          (is (some? task))
          (binding [systemd/*host* nil]
            (let [direct (capture #(apply f args))]
              (is (= direct (capture #(core/dispatch {:cmd (keyword "systemd" (name command)) :args args}))))
              (is (= direct (capture #(binding [*command-line-args* (into ["--local"] args)]
                                       (eval (:task task)))))))))))))

(deftest journal-filters-and-validation
  (binding [systemd/*host* nil]
    (is (= [["journalctl" "--no-pager" "--unit" "rocksky-gleam.service" "--lines=100"
             "--since=1 hour ago" "--until=now" "--priority=warning" "--boot=-1"
             "--output=json" "--lines=200" "--follow" "--reverse"]]
           (capture #(systemd/journalctl :gleam :since "1 hour ago" :until "now"
                                        :priority "warning" :boot -1 :output "json"
                                        :lines 200 :follow :reverse))))
    (is (= (capture #(systemd/journalctl :gleam :boot 0 :lines "all" :follow))
           (capture #(systemd/cli :journalctl "--local" "gleam" "--boot" "0"
                                 "--lines" "all" "--follow")))))
  (is (= [["ssh" "--" remote/prod-host
           "'journalctl' '--no-pager' '--unit' 'rocksky-gleam.service' '--lines=100' '--since=1 hour ago'"]]
         (capture #(systemd/journalctl :gleam :since "1 hour ago"))))
  (let [calls (atom [])]
    (with-redefs [sh/sh #(swap! calls conj %)]
      (doseq [options [[:since] [:lines -1] [:lines "bad"] [:output nil]
                       [:since ""] [:since "--follow"] [:vacuum-time "1d"]
                       [:unit "ssh"] [:follow false]]]
        (is (thrown? Exception (apply systemd/journalctl :gleam options)))))
    (is (empty? @calls))))

(let [{:keys [fail error]} (run-tests 'console.systemd-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
