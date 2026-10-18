(ns console.systemd
  "Manage Rocksky systemd services and timers. Defaults to local execution on Linux.
  Bind *host* to an explicit SSH host to manage a remote Linux system. Bind *sudo* to true to use non-interactive sudo."
  (:refer-clojure :exclude [list])
  (:require [clojure.string :as str]
            [console.shell :as sh]))

(def ^:dynamic *host* nil)
(def ^:dynamic *sudo* false)

(def ^:private patterns ["rocksky.service" "rocksky-*.service" "rocksky-*.timer"])

(defn- unit [value]
  (let [value (cond
                (string? value) value
                (and (keyword? value) (nil? (namespace value))) (name value)
                :else (throw (ex-info "Use a Rocksky unit name or keyword" {})))
        value (if (or (= value "rocksky") (= value "rocksky.service")
                      (str/starts-with? value "rocksky-"))
                value (str "rocksky-" value))
        value (if (re-find #"\.(service|timer)$" value) value (str value ".service"))]
    (when-not (or (= value "rocksky.service")
                  (re-matches #"rocksky-[A-Za-z0-9][A-Za-z0-9_-]*(?:@[A-Za-z0-9_-]+)?\.(?:service|timer)" value))
      (throw (ex-info "Expected a concrete rocksky-* service or timer (no paths, options or wildcards)" {})))
    value))

(defn- shell-quote [arg]
  (str "'" (str/replace (str arg) "'" "'\"'\"'") "'"))

(defn current-os
  "Return the current JVM/Babashka operating system name."
  [] (System/getProperty "os.name"))

(defn- execute [args]
  (let [args (into (if *sudo* ["sudo" "-n"] []) args)]
    (if (nil? *host*)
      (do
        (when-not (= "linux" (str/lower-case (or (current-os) "")))
          (throw (ex-info
                   "Local systemd and journalctl commands require Linux. Use --host HOST or bind *host* to a remote Linux SSH target."
                   {:os (current-os) :target :local})))
        (sh/sh args))
      (do
        (when-not (and (string? *host*)
                       (re-matches #"[A-Za-z0-9_][A-Za-z0-9_.@:-]*" *host*))
          (throw (ex-info "Invalid SSH host" {})))
        (sh/sh ["ssh" "--" *host* (str/join " " (map shell-quote args))])))))

(defn- ctl [action args]
  (execute (into ["systemctl" "--no-pager" "--full" action] args)))

(defn- change [action flags services]
  (when (empty? services)
    (throw (ex-info "Specify at least one Rocksky unit" {:action action})))
  (ctl action (into (vec flags) (map unit services))))

(defn list
  "List loaded Rocksky services/timers, including inactive units, on the target."
  [] (ctl "list-units" (into ["--all" "--type=service,timer"] patterns)))

(defn list-files
  "List installed Rocksky unit files and their enablement state."
  [] (ctl "list-unit-files" (into ["--type=service,timer"] patterns)))

(defn status
  "Show status for named units, or all loaded Rocksky units when no names are given."
  [& services] (ctl "status" (if (seq services) (mapv unit services) patterns)))

(defn start "Start one or more named Rocksky units." [& services] (change "start" [] services))
(defn stop "Stop one or more named Rocksky units." [& services] (change "stop" [] services))
(defn restart "Restart one or more named Rocksky units." [& services] (change "restart" [] services))
(defn reload "Reload named units (requires their ExecReload support)." [& services] (change "reload" [] services))
(defn enable "Enable named units at boot; does not start them." [& services] (change "enable" [] services))
(defn disable "Disable named units at boot; does not stop them." [& services] (change "disable" [] services))
(defn enable-now "Enable named units at boot and start them now." [& services] (change "enable" ["--now"] services))
(defn disable-now "Disable named units at boot and stop them now." [& services] (change "disable" ["--now"] services))
(defn is-active "Print active state and return systemctl's exit code." [& services] (change "is-active" [] services))
(defn is-enabled "Print enablement state and return systemctl's exit code." [& services] (change "is-enabled" [] services))
(defn show "Show systemd properties for named units." [& services] (change "show" [] services))
(defn cat "Show installed unit definitions and drop-ins." [& services] (change "cat" [] services))
(defn reset-failed "Reset failed state/start limits for named units." [& services] (change "reset-failed" [] services))

(defn daemon-reload
  "Reload the target's systemd unit definitions globally; does not restart services."
  [] (ctl "daemon-reload" []))

(defn logs
  "Read one unit's journal. Optional line count (default 100), :follow and :boot.
  CLI strings follow/--follow and boot/--boot are also accepted."
  [service & options]
  (let [opts (reduce
              (fn [acc arg]
                (let [arg (if (keyword? arg) (name arg) (str arg))]
                  (cond
                    (#{"follow" "f" "--follow" "-f"} arg) (assoc acc :follow true)
                    (#{"boot" "--boot" "-b"} arg) (assoc acc :boot true)
                    (re-matches #"[0-9]+" arg) (assoc acc :lines arg)
                    :else (throw (ex-info "Log options: non-negative line count, follow, boot" {})))))
              {:lines "100"} options)]
    (execute (cond-> ["journalctl" "--no-pager" "--unit" (unit service) "--lines" (:lines opts)]
               (:follow opts) (conj "--follow")
               (:boot opts) (conj "--boot")))))

(defn journalctl
  "Query one Rocksky unit's journal (100 lines by default). Options are keyword
  or CLI flag/value pairs: :lines, :since, :until, :priority, :output, :boot
  (boot takes an offset, e.g. 0 or -1). :follow and :reverse are switches."
  [service & options]
  (let [flags {"lines" "--lines" "since" "--since" "until" "--until"
               "priority" "--priority" "output" "--output" "boot" "--boot"}
        switches #{"follow" "reverse"}]
    (loop [remaining options
           args ["journalctl" "--no-pager" "--unit" (unit service) "--lines=100"]]
      (if (empty? remaining)
        (execute args)
        (let [option (first remaining)
              option (if (keyword? option) (name option) (str option))
              option (str/replace option #"^--" "")]
          (cond
            (switches option)
            (recur (rest remaining) (conj args (str "--" option)))

            (contains? flags option)
            (let [value (second remaining)]
              (when-not (and (or (string? value) (integer? value))
                             (not (str/blank? (str value)))
                             (not (str/starts-with? (str value) "--"))
                             (or (not= option "lines")
                                 (re-matches #"[0-9]+|all" (str value))))
                (throw (ex-info "Journal option requires a valid value" {:option option})))
              (recur (nnext remaining) (conj args (str (flags option) "=" value))))

            :else (throw (ex-info "Unknown journal option" {:option option}))))))))

(defn cli
  "Babashka entry point. Leading --local or --host HOST selects a target;
  --sudo enables non-interactive sudo. Remaining arguments go to the action."
  [action & args]
  (let [commands {"list" list "list-files" list-files "status" status
                  "start" start "stop" stop "restart" restart "reload" reload
                  "enable" enable "disable" disable "enable-now" enable-now
                  "disable-now" disable-now "is-active" is-active "is-enabled" is-enabled
                  "show" show "cat" cat "reset-failed" reset-failed
                  "daemon-reload" daemon-reload "logs" logs "journalctl" journalctl}
        command (get commands (name action))]
    (when-not command (throw (ex-info "Unknown systemd command" {})))
    (loop [args args host *host* sudo *sudo*]
      (case (first args)
        "--local" (recur (rest args) nil sudo)
        "--sudo" (recur (rest args) host true)
        "--host" (if-let [host (second args)]
                   (recur (nnext args) host sudo)
                   (throw (ex-info "--host requires an SSH target" {})))
        (binding [*host* host *sudo* sudo]
          (apply command args))))))
