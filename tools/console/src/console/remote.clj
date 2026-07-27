(ns console.remote
  "Shared helpers for operating the production systemd services over SSH.

  Every rocksky service runs as a systemd unit on the Contabo prod box
  (`root@161.97.141.205`), logging to journald and listening on localhost.
  These wrap the common ops — status / restart / logs / health / deploy — so a
  service namespace (e.g. console.remote-ws, console.deezer) is just a few thin
  calls that pass their unit name and port.

  Everything streams live output (via console.shell/sh). `systemctl` and
  `journalctl` run with `--no-pager` so they work without a TTY — from the REPL
  or a `bb` one-shot alike."
  (:require [console.shell :as sh]
            [clojure.string :as str]))

(def prod-host
  "SSH target for the prod box that runs every rocksky systemd unit."
  "root@161.97.141.205")

(def repo-dir
  "The monorepo checkout on the prod box."
  "/root/github/rocksky")

(defn ssh
  "Run a shell command string on the prod host, streaming its output. `cmd` is
  handed to the remote shell verbatim (one argument), so quoting and pipelines
  work as written. No local shell is involved."
  [cmd]
  (sh/sh ["ssh" prod-host (str cmd)]))

(defn ssh-tty
  "Like `ssh` but allocates a TTY — for interactive sessions."
  [cmd]
  (sh/sh ["ssh" "-t" prod-host (str cmd)]))

(defn systemctl
  "Run `systemctl --no-pager <action> <unit>` on prod."
  [unit action]
  (ssh (str "systemctl --no-pager " action " " unit)))

(defn status  "systemctl status <unit>."  [unit] (systemctl unit "status"))
(defn restart "systemctl restart <unit>." [unit] (systemctl unit "restart"))
(defn start   "systemctl start <unit>."   [unit] (systemctl unit "start"))
(defn stop    "systemctl stop <unit>."    [unit] (systemctl unit "stop"))

(defn logs
  "Tail journald logs for `unit`. Options (any order):
    :follow / :f   stream new entries (`journalctl -f`)
    <n>            show the last n lines (default 100)"
  [unit & args]
  (let [follow? (boolean (some #{:follow :f} args))
        lines   (or (first (filter number? args)) 100)
        parts   (concat ["journalctl" "--no-pager" "-u" unit]
                        (if follow? ["-f"] ["-n" (str lines)]))]
    (ssh (str/join " " parts))))

(defn health
  "Curl the service's health endpoint on prod (it listens on localhost:<port>)."
  ([port] (health port "/health"))
  ([port path]
   (ssh (str "curl -sS -m 5 localhost:" port path " ; echo"))))

(defn deploy
  "Pull the latest monorepo on prod, then restart `unit`. The systemd unit's
  ExecStartPre recompiles on restart, so a plain pull + restart is enough."
  [unit]
  (ssh (str "cd " repo-dir " && git pull"))
  (restart unit))

(defn shell
  "Open an interactive SSH session on prod, cd'd into `dir`."
  [dir]
  (ssh-tty (str "cd " dir " && exec bash -l")))
