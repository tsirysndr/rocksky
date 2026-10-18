(ns console.core
  "Rocksky console — a centralized REPL for every operational script in the repo.

  Quick start (REPL):
      (require '[console.core :as c])
      (c/help)   ;; or (c/ls)

  Or as a one-shot:
      $ bb help
      $ bb sync did:plc:abc123"
  (:require [console.shell :as sh]
            [console.purescript :as ps]
            [clojure.string :as str]))

(def ^:private registry
  "Index of every command grouped by namespace; PureScript entries are generated.
  Keeps `(help)` cheap and discoverable — namespaces are still loaded lazily."
  [{:group "lexgen" :ns 'console.lexgen
    :cmds [[:server         "Run apps/api lex gen-server"]
           [:types          "Generate SDK type bindings (TS/Go/Py/Rust/Kotlin/...)"]]}

   {:group "sdk" :ns 'console.sdk
    :cmds [[:build-native    "Build both native cores → sdk/scripts/dist. Args: [triple]"]
           [:gen-bindings    "Regenerate UniFFI bindings (Python + Kotlin)"]
           [:build-core      "Build one package's native core. Args: python|ruby|erlang|clojure|kotlin"]
           [:uniffi-manifest "Write UniFFI download manifests. Args: dir-of-libs tag"]
           [:nif-manifest    "Write NIF checksum manifest. Args: dir-of-so tag"]
           [:publish         "Publish one SDK to its registry (local-only). Args: lang [tag|--dry-run ...]"]]}

   {:group "api" :ns 'console.api
    :cmds [[:format         "Run biome format on apps/api (pass :fix to write)"]
           [:lint           "Run biome lint on apps/api (pass :fix to write)"]]}

   {:group "gleam" :ns 'console.gleam
    :cmds [[:build "Run gleam/package.json script build"]
           [:db-generate-bindings "Run gleam/package.json script db:generate-bindings"]
           [:dev "Run gleam/package.json script dev"]
           [:api "Run gleam/package.json script api"]
           [:xrpc "Run gleam/package.json script xrpc"]
           [:prod "Run gleam/package.json script prod"]
           [:prod-xrpc "Run gleam/package.json script prod:xrpc"]
           [:test "Run gleam/package.json script test"]
           [:db-migrate "Run gleam/package.json script db:migrate"]
           [:sync "Run gleam/package.json script sync"]
           [:typesense-import "Run gleam/package.json script typesense:import"]
           [:sync-library "Run gleam/package.json script sync:library"]
           [:sync-library-playlist "Run gleam/package.json script sync:library-playlist"]
           [:avatar "Run gleam/package.json script avatar"]
           [:genres "Run gleam/package.json script genres"]
           [:spotify "Run gleam/package.json script spotify"]
           [:exp "Run gleam/package.json script exp"]
           [:collections "Run gleam/package.json script collections"]
           [:feed "Run gleam/package.json script feed"]
           [:event "Run gleam/package.json script event"]
           [:dedup "Run gleam/package.json script dedup"]
           [:dedup-records "Run gleam/package.json script dedup:records"]
           [:seed-feed "Run gleam/package.json script seed:feed"]
           [:likes "Run gleam/package.json script likes"]
           [:backfill-likes "Run gleam/package.json script backfill:likes"]
           [:backfill-isrc-mbid "Run gleam/package.json script backfill:isrc-mbid"]
           [:riff-backfill "Run gleam/package.json script riff:backfill"]
           [:backfill-track-uri "Run gleam/package.json script backfill:track-uri"]
           [:backfill-replaygain "Run gleam/package.json script backfill:replaygain"]
           [:backfill-analysis "Run gleam/package.json script backfill:analysis"]
           [:backfill-discogs "Run gleam/package.json script backfill:discogs"]
           [:backfill-fingerprint "Run gleam/package.json script backfill:fingerprint"]
           [:dev-env "Run gleam/package.json script dev:env"]]}

   {:group "purescript" :ns 'console.purescript
    :cmds (mapv (fn [[command script]]
                  [command (str "bun run " script " in purescript/ (extra args forwarded)")])
                ps/script-commands)}

   {:group "db" :ns 'console.db
    :cmds [[:migrate        "Apply Drizzle migrations"]
           [:gen-migration  "Generate a new Drizzle migration"]
           [:pkl-eval       "Evaluate Pkl config as JSON"]
           [:pkl-gen        "Generate Pkl config artifacts"]
           [:pgpull         "Pull schema/data from Postgres (rocksky-pgpull)"]]}

   {:group "sync" :ns 'console.sync
    :cmds [[:user           "Sync one user's scrobbles. Args: did|handle"]
           [:library        "Sync a user's library"]
           [:backfill-isrc-mbid "Backfill ISRC/MusicBrainz IDs"]
           [:typesense-import   "Bulk-index data into Typesense"]
           [:dedup           "Deduplicate track entries"]
           [:genres          "Seed/refresh genre taxonomy"]
           [:collections     "Seed/manage curated collections"]
           [:seed-feed       "Seed initial feed entries"]
           [:feed            "Rebuild feed caches"]
           [:likes           "Process user likes"]
           [:avatar          "Generate/process user avatars"]
           [:spotify-creds   "Register Spotify app creds. Args: client-id client-secret"]
           [:exp             "Ad-hoc experimentation script"]]}

   {:group "daemons" :ns 'console.daemons
    :cmds [[:connect         "rocksky-connect"]
           [:dropbox         "rockskyd dropbox serve"]
           [:googledrive     "rockskyd googledrive serve"]
           [:jetstream       "rockskyd jetstream"]
           [:playlists       "rockskyd playlist"]
           [:scrobbler       "rockskyd scrobbler"]
           [:spotify         "rockskyd spotify"]
           [:storage         "rocksky-storage serve"]
           [:webscrobbler    "rockskyd webscrobbler"]
           [:tracklist       "rockskyd tracklist"]]}

   {:group "systemd" :ns 'console.systemd
    :cmds [[:list "List loaded Rocksky services/timers, including inactive units (local Linux by default; explicit SSH supported)"]
           [:list-files "List installed Rocksky unit files and enablement state (local Linux by default; explicit SSH supported)"]
           [:status "Show status; optional unit names (local Linux by default; explicit SSH supported)"]
           [:start "Start named units (local Linux by default; explicit SSH supported)"]
           [:stop "Stop named units (local Linux by default; explicit SSH supported)"]
           [:restart "Restart named units (local Linux by default; explicit SSH supported)"]
           [:reload "Reload named units (requires ExecReload) (local Linux by default; explicit SSH supported)"]
           [:enable "Enable at boot without starting (local Linux by default; explicit SSH supported)"]
           [:disable "Disable at boot without stopping (local Linux by default; explicit SSH supported)"]
           [:enable-now "Enable and start named units (local Linux by default; explicit SSH supported)"]
           [:disable-now "Disable and stop named units (local Linux by default; explicit SSH supported)"]
           [:is-active "Query active state (local Linux by default; explicit SSH supported)"]
           [:is-enabled "Query enablement state (local Linux by default; explicit SSH supported)"]
           [:show "Show unit properties (local Linux by default; explicit SSH supported)"]
           [:cat "Show unit files and drop-ins (local Linux by default; explicit SSH supported)"]
           [:reset-failed "Reset failure/start limits for named units (local Linux by default; explicit SSH supported)"]
           [:daemon-reload "Reload systemd definitions globally; no service restart (local Linux by default; explicit SSH supported)"]
           [:journalctl "Query unit journal with --since, --until, --boot, --priority, --output, --lines, --follow, --reverse"]
           [:logs "Read unit journal. Args: unit [lines] [follow] [boot] (local Linux by default; explicit SSH supported)"]]}

   {:group "remote-ws" :ns 'console.remote-ws
    :cmds [[:dev             "Run locally: mix phx.server"]
           [:status          "systemctl status on prod"]
           [:health          "Curl GET /health on prod (:4000)"]
           [:logs            "journald logs on prod (:follow to tail, n for line count)"]
           [:restart         "Restart the prod service"]
           [:start           "Start the prod service"]
           [:stop            "Stop the prod service"]
           [:deploy          "git pull the monorepo on prod, then restart"]
           [:ssh             "Interactive SSH shell on prod in remote-ws/"]]}

   {:group "deezer" :ns 'console.deezer
    :cmds [[:dev             "Run locally: go run main.go"]
           [:status          "systemctl status on prod"]
           [:health          "Curl GET /health on prod (:8090)"]
           [:logs            "journald logs on prod (:follow to tail, n for line count)"]
           [:restart         "Restart the prod service"]
           [:start           "Start the prod service"]
           [:stop            "Stop the prod service"]
           [:deploy          "git pull the monorepo on prod, then restart"]
           [:ssh             "Interactive SSH shell on prod in deezer/"]]}

   {:group "devops" :ns 'console.devops
    :cmds [[:backup-ddb      "Back up DuckDB analytics+feed databases to R2"]
           [:local-proxy     "Run tools/local-proxy.ts for split front/back-end dev"]
           [:mb              "Run musicbrainz Go metadata cache server"]]}

   {:group "docker" :ns 'console.docker
    :cmds [[:up              "compose up -d (pass :foreground for inline logs)"]
           [:down            "compose down (pass :volumes to wipe data)"]
           [:stop            "Stop all or named services, keeping containers and volumes"]
           [:restart         "Restart one or more services"]
           [:logs            "Print logs; pass :follow to tail"]
           [:ps              "List running services"]
           [:pull            "Pull latest images"]
           [:exec            "Run a command inside a service. Args: svc cmd [args...]"]
           [:compose         "Escape hatch: any `docker compose` subcommand"]]}

   {:group "cron" :ns 'console.cron
    :cmds [[:schedule        "Wrap a command in Deno cron. Args: interval-min cmd [args...]"]]}

   {:group "env" :ns 'console.env
    :cmds [[:load!           "Load a .env file (defaults to <repo>/.env)"]
           [:doppler!        "Pull secrets from Doppler. Args: [project config]"]
           [:reload!         "Re-pull every previously loaded source"]
           [:unload!         "Clear the loaded env back to JVM defaults"]
           [:show            "Print loaded keys. (show :unmask) for raw"]
           [:get             "Fetch one value (raw). Args: key [default]"]
           [:set!            "Set one key. Args: key value (in-memory)"]
           [:unset!          "Remove one key. Args: key (in-memory)"]
           [:merge!          "Bulk-merge a map of {k v} into the env"]
           [:save!           "Write current env to disk (default <repo>/.env.local)"]]}])

(defn- pad [s n] (let [s (str s)] (str s (apply str (repeat (max 0 (- n (count s))) " ")))))

(defn ls
  "Print every registered command, grouped by namespace, with a one-liner."
  []
  (doseq [{:keys [group ns cmds]} registry]
    (println)
    (println (str "── " group "  (" ns ") ──"))
    (doseq [[sym desc] cmds]
      (println " " (pad sym 22) "  " desc)))
  :ok)

(defn help
  "Pretty banner + ls. Use this from the REPL for a quick tour."
  []
  (println)
  (println "Rocksky Console — REPL-driven ops for the whole monorepo")
  (println "    (require '[console.sync :as sync])")
  (println "    (sync/user \"did:plc:...\")")
  (println)
  (println "Commands:")
  (ls)
  (println)
  (println "From shell:   bb <task>     (see `bb tasks`)")
  (println "Repo root:   " (sh/repo-root))
  :ok)

(defn dispatch
  "Entry point for `clj -X console.core/dispatch :cmd :sync/user :args [\"did\"]`."
  [{:keys [cmd args] :or {args []}}]
  (let [[grp sym] ((juxt namespace name) cmd)
        ns-sym    (symbol (str "console." grp))]
    (require ns-sym)
    (let [f (ns-resolve ns-sym (symbol sym))]
      (when-not f
        (throw (ex-info (str "Unknown command: " cmd) {:cmd cmd})))
      (apply f args))))
