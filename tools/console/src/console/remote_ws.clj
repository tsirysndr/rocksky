(ns console.remote-ws
  "Ops for the Elixir remote-ws service — the player remote-control WebSocket
  relay (register / now-playing broadcast / transport commands). Prod runs it as
  the `rocksky-remote-ws` systemd unit; these wrap systemctl / journalctl /
  health over SSH (see console.remote).

  REPL examples:
      (remote-ws/status)
      (remote-ws/logs)            ;; last 100 lines
      (remote-ws/logs :follow)    ;; tail
      (remote-ws/health)          ;; GET /health on :4000
      (remote-ws/restart)
      (remote-ws/deploy)          ;; git pull + restart on prod
      (remote-ws/dev)             ;; run locally: mix phx.server"
  (:require [console.shell  :as sh]
            [console.remote :as remote]
            [babashka.fs    :as fs]))

(def ^:private unit "rocksky-remote-ws.service")
(def ^:private port 4000)
(def ^:private subdir "remote-ws")

(defn dev
  "Run the service locally with `mix phx.server` (from ./remote-ws)."
  []
  (sh/sh ["mix" "phx.server"]
         {:dir (str (fs/path (sh/repo-root) subdir))}))

(defn status  "systemctl status on prod."         [] (remote/status unit))
(defn restart "Restart the prod service."          [] (remote/restart unit))
(defn start   "Start the prod service."            [] (remote/start unit))
(defn stop    "Stop the prod service."             [] (remote/stop unit))

(defn logs
  "journald logs on prod. (logs :follow) to tail, (logs n) for the last n lines."
  [& args]
  (apply remote/logs unit args))

(defn health  "Curl GET /health on prod (:4000)."  [] (remote/health port))
(defn deploy  "git pull the monorepo on prod, then restart the service." [] (remote/deploy unit))

(defn ssh
  "Open an interactive SSH shell on prod in the remote-ws dir."
  []
  (remote/shell (str remote/repo-dir "/" subdir)))
