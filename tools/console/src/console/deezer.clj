(ns console.deezer
  "Ops for the Deezer metadata microservice (Go / Echo). Fills missing track
  metadata when Spotify search fails (wired into matchSong + the Rust
  scrobbler). Prod runs it as the `rocksky-deezer` systemd unit; these wrap
  systemctl / journalctl / health over SSH (see console.remote).

  REPL examples:
      (deezer/status)
      (deezer/logs :follow)
      (deezer/health)             ;; GET /health on :8090
      (deezer/restart)
      (deezer/deploy)             ;; git pull + restart on prod
      (deezer/dev)                ;; run locally: go run main.go"
  (:require [console.shell  :as sh]
            [console.remote :as remote]
            [babashka.fs    :as fs]))

(def ^:private unit "rocksky-deezer.service")
(def ^:private port 8090)
(def ^:private subdir "deezer")

(defn dev
  "Run the service locally (`go run main.go` in ./deezer)."
  []
  (sh/sh ["go" "run" "main.go"]
         {:dir (str (fs/path (sh/repo-root) subdir))}))

(defn status  "systemctl status on prod."         [] (remote/status unit))
(defn restart "Restart the prod service."          [] (remote/restart unit))
(defn start   "Start the prod service."            [] (remote/start unit))
(defn stop    "Stop the prod service."             [] (remote/stop unit))

(defn logs
  "journald logs on prod. (logs :follow) to tail, (logs n) for the last n lines."
  [& args]
  (apply remote/logs unit args))

(defn health  "Curl GET /health on prod (:8090)."  [] (remote/health port))
(defn deploy  "git pull the monorepo on prod, then restart the service." [] (remote/deploy unit))

(defn ssh
  "Open an interactive SSH shell on prod in the deezer dir."
  []
  (remote/shell (str remote/repo-dir "/" subdir)))
