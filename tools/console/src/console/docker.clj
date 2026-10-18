(ns console.docker
  "Thin wrappers around `docker compose`. Every command runs from the repo
  root so it picks up the right `compose.yaml`. Subprocess env still gets
  `@console.env/*env*` merged in (via console.shell), so compose
  substitutions like `${PG_PASSWORD}` resolve against the loaded env.

  REPL examples:

      (docker/up)                       ;; docker compose up -d
      (docker/up :foreground)           ;; without -d
      (docker/down)
      (docker/restart \"db\")
      (docker/restart \"db\" \"nats\")
      (docker/logs \"db\" :follow)
      (docker/ps)
      (docker/pull)
      (docker/exec \"db\" \"psql\" \"-U\" \"postgres\" \"rocksky\")
      (docker/compose \"top\" \"db\")     ;; escape hatch — any subcommand"
  (:refer-clojure :exclude [name])
  (:require [console.shell :as sh]
            [clojure.core :as core]
            [babashka.fs :as fs]
            [cheshire.core :as json]))

(defn- svc
  "Normalize a keyword/string/symbol service name to a string."
  [s]
  (cond
    (keyword? s) (core/name s)
    (symbol? s)  (core/name s)
    :else        (str s)))

(defn- has? [args flag]
  (some #(= flag %) args))

(defn compose
  "Run `docker compose <args...>` from the repo root.
  This is the escape hatch — anything not covered by a named wrapper
  goes here.

      (compose \"top\" \"db\")
      (compose \"config\")"
  [& args]
  (sh/sh (into ["docker" "compose"] (map svc args))))

(defn up
  "Start every service in compose.yaml.

  Detached by default (mirrors what the README tells users to run).
  Pass `:foreground` (or `:fg`) to stream logs in the current process —
  use Ctrl-C to stop.

      (up)                  ;; docker compose up -d
      (up :foreground)      ;; docker compose up
      (up \"db\" \"nats\")     ;; start only these (still detached)"
  [& args]
  (let [fg?      (or (has? args :foreground) (has? args :fg))
        services (remove #{:foreground :fg :detached :d} args)]
    (apply compose
           "up"
           (concat (when-not fg? ["-d"])
                   (map svc services)))))

(defn down
  "Stop and remove every service. Pass `:volumes` (or `:v`) to also
  remove named volumes — irreversible, kills your local data."
  [& args]
  (let [vols? (or (has? args :volumes) (has? args :v))]
    (apply compose "down" (when vols? ["--volumes"]))))

(defn stop
  "Stop all services, or only the named services, keeping containers and volumes."
  [& services]
  (apply compose "stop" (map svc services)))

(defn restart
  "Restart one or more services.

      (restart \"db\")
      (restart \"db\" \"nats\")"
  [& services]
  (apply compose "restart" (map svc services)))

(defn logs
  "Print logs for the given service(s). Pass `:follow` (or `:f`) to tail.

      (logs \"db\")
      (logs \"db\" :follow)
      (logs \"db\" \"nats\" :follow)"
  [& args]
  (let [follow?  (or (has? args :follow) (has? args :f))
        services (remove #{:follow :f} args)]
    (apply compose
           "logs"
           (concat (when follow? ["--follow"])
                   (map svc services)))))

(defn ps
  "Show running compose services."
  []
  (compose "ps"))

(defn pull
  "Pull the latest images for every service (or just the named ones)."
  [& services]
  (apply compose "pull" (map svc services)))

(defn exec
  "Run a command inside a running service.

      (exec \"db\" \"psql\" \"-U\" \"postgres\" \"rocksky\")
      (exec \"dragonfly\" \"redis-cli\")"
  [service & cmd]
  (apply compose "exec" (svc service) (map str cmd)))

(defn- local-connection [service target]
  (let [{:keys [exit out]} (sh/sh! ["docker" "compose" "config" "--format" "json"])]
    (when-not (zero? exit)
      (throw (ex-info "Could not read Docker Compose configuration" {})))
    (let [config (get-in (json/parse-string out true) [:services service])
          port (first (filter #(and (= (str target) (str (:target %)))
                                   (= "tcp" (or (:protocol %) "tcp"))) (:ports config)))]
      (when-not (and port (re-matches #"[0-9]+" (str (:published port))))
        (throw (ex-info "Compose service must publish its TCP port for a local client"
                        {:service service :port target})))
      {:config config
       :host (if (contains? #{nil "" "0.0.0.0" "::"} (:host_ip port))
               "127.0.0.1" (:host_ip port))
       :port (str (:published port))})))

(defn postgres
  "Connect to Compose db with local pgcli, then local psql, then container psql.
  Reads Compose settings; does not start services. Exit the client with \\q."
  []
  (if-let [client (or (fs/which "pgcli") (fs/which "psql"))]
    (let [{:keys [config host port]} (local-connection :db 5432)
          user (or (get-in config [:environment :POSTGRES_USER]) "postgres")
          database (or (get-in config [:environment :POSTGRES_DB]) user)
          password (get-in config [:environment :POSTGRES_PASSWORD])]
      (when-not (string? password)
        (throw (ex-info "Compose db needs POSTGRES_PASSWORD for a local client" {})))
      ;; An empty PGSERVICE still selects a named service in pgcli. Remove
      ;; service overrides after the console environment has been merged.
      (sh/sh ["env" "-u" "PGSERVICE" "-u" "PGSERVICEFILE"
              (str client) "--host" host "--port" port
              "--username" user "--dbname" database]
             {:extra-env {"PGPASSWORD" password "PGSSLMODE" "prefer"}}))
    (compose "exec" "db" "sh" "-c"
             "export PGPASSWORD=\"$POSTGRES_PASSWORD\"; exec psql -h 127.0.0.1 -U \"${POSTGRES_USER:-postgres}\" -d \"${POSTGRES_DB:-${POSTGRES_USER:-postgres}}\"")))

(defn redis
  "Connect to Compose Dragonfly using local redis-cli. Exit with quit."
  []
  (if-let [client (fs/which "redis-cli")]
    (let [{:keys [host port]} (local-connection :dragonfly 6379)]
      (sh/sh [(str client) "-h" host "-p" port]
             {:extra-env {"REDISCLI_AUTH" ""}}))
    (throw (ex-info "redis-cli is required; install the Redis command-line tools" {}))))
