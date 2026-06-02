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
            [clojure.core :as core]))

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
