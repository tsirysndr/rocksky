(ns console.systemd-test
  (:require [clojure.test :refer [deftest is run-tests testing use-fixtures]]
            [clojure.string :as str]
            [console.core :as core]
            [console.remote :as remote]
            [console.shell :as sh]
            [console.systemd :as systemd]))

(use-fixtures :each
  (fn [f] (with-redefs [systemd/current-os (constantly "Linux")] (f))))

(defn capture [f]
  (let [calls (atom [])]
    (with-redefs [sh/sh (fn [args] (swap! calls conj args) 3)]
      (is (= 3 (f))))
    @calls))

(deftest target-and-argument-handling
  (is (= [["ssh" "--" remote/prod-host
           "'systemctl' '--no-pager' '--full' 'status' 'rocksky-gleam.service' 'rocksky-gleam-xrpc.service'"]]
         (capture #(binding [systemd/*host* remote/prod-host]
                     (systemd/status :gleam "rocksky-gleam-xrpc.service")))))
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
    (is (= 20 (count (:cmds group))))
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
         (capture #(binding [systemd/*host* remote/prod-host]
                     (systemd/journalctl :gleam :since "1 hour ago")))))
  (let [calls (atom [])]
    (with-redefs [sh/sh #(swap! calls conj %)]
      (doseq [options [[:since] [:lines -1] [:lines "bad"] [:output nil]
                       [:since ""] [:since "--follow"] [:vacuum-time "1d"]
                       [:unit "ssh"] [:follow false]]]
        (is (thrown? Exception (apply systemd/journalctl :gleam options)))))
    (is (empty? @calls))))

(deftest local-default-and-os-gating
  (is (nil? systemd/*host*))
  (is (= [["systemctl" "--no-pager" "--full" "status" "rocksky-gleam.service"]]
         (capture #(systemd/status :gleam))))
  (doseq [os ["Mac OS X" "Windows 11" "FreeBSD"]]
    (with-redefs [systemd/current-os (constantly os)]
      (let [calls (atom [])
            group (first (filter #(= "systemd" (:group %))
                                 (var-get (ns-resolve 'console.core 'registry))))]
        (with-redefs [sh/sh #(swap! calls conj %)]
          (doseq [[command _] (:cmds group)]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require Linux"
                  (apply systemd/cli command
                         (if (#{:list :list-files :daemon-reload} command) [] ["gleam"]))))))
        (is (empty? @calls)))
      (is (= [["ssh" "--" "ops@linux.test"
               "'journalctl' '--no-pager' '--unit' 'rocksky-gleam.service' '--lines=100'"]]
             (capture #(systemd/cli :journalctl "--host" "ops@linux.test" "gleam")))))))

(deftest switch-api-variants
  (let [all-units ["rocksky.service" "rocksky-xrpc.service" "rocksky-gleam.service"
                   "rocksky-gleam-xrpc.service" "rocksky-purescript.service"]
        prefix ["systemctl" "--no-pager" "--full"]]
    (doseq [[variant selected] [[:typescript ["rocksky.service" "rocksky-xrpc.service"]]
                               [:purescript ["rocksky-purescript.service"]]
                               [:gleam ["rocksky-gleam.service" "rocksky-gleam-xrpc.service"]]]]
      (let [calls (atom [])]
        (with-redefs [sh/sh (fn [args] (swap! calls conj args) 0)]
          (is (= 0 (systemd/switch variant))))
        (is (= [(into (into prefix ["disable" "--now"]) all-units)
                (into (into prefix ["enable" "--now"]) selected)] @calls))))
    (doseq [exit [1 5 130 255]]
      (let [calls (atom [])]
        (with-redefs [sh/sh (fn [args] (swap! calls conj args) exit)]
          (is (= exit (systemd/switch :gleam))))
        (is (= [(into (into prefix ["disable" "--now"]) all-units)] @calls))))
    (let [calls (atom [])]
      (with-redefs [sh/sh (fn [args] (swap! calls conj args)
                           (if (= "enable" (nth args 3)) 7 0))]
        (is (= 7 (systemd/switch "typescript"))))
      (is (= 2 (count @calls))))
    (let [calls (atom [])]
      (with-redefs [sh/sh #(swap! calls conj %)]
        (doseq [value [nil :unknown :other/gleam "gleam; reboot" "--all" 1]]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Select"
                (systemd/switch value)))))
      (is (empty? @calls)))))

(deftest switch-remote-target-and-sudo
  (let [calls (atom [])]
    (with-redefs [systemd/current-os (constantly "Mac OS X")
                  sh/sh (fn [args] (swap! calls conj args) 0)]
      (is (= 0 (systemd/cli :switch "--host" "ops@linux.test" "--sudo" "purescript"))))
    (is (= [["ssh" "--" "ops@linux.test"
             "'sudo' '-n' 'systemctl' '--no-pager' '--full' 'disable' '--now' 'rocksky.service' 'rocksky-xrpc.service' 'rocksky-gleam.service' 'rocksky-gleam-xrpc.service' 'rocksky-purescript.service'"]
            ["ssh" "--" "ops@linux.test"
             "'sudo' '-n' 'systemctl' '--no-pager' '--full' 'enable' '--now' 'rocksky-purescript.service'"]]
           @calls))))

(let [{:keys [fail error]} (run-tests 'console.systemd-test)]
  (System/exit (if (zero? (+ fail error)) 0 1)))
