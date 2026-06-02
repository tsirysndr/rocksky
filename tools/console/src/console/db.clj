(ns console.db
  "Database operations: Drizzle migrations, Pkl config, Postgres pull."
  (:require [console.shell :as sh]))

(defn migrate
  "Apply pending Drizzle migrations (drizzle-kit migrate)."
  []
  (sh/bun "apps/api" "db:migrate"))

(defn gen-migration
  "Generate a new Drizzle migration from current schema."
  []
  (sh/bun "apps/api" "db:gen-migration"))

(defn pkl-eval
  "Evaluate Pkl config as JSON (pkl eval -f json)."
  []
  (sh/bun "apps/api" "pkl:eval"))

(defn pkl-gen
  "Run the Pkl generation script."
  []
  (sh/bun "apps/api" "pkl:gen"))

(defn pgpull
  "Pull/replicate from Postgres via the rocksky-pgpull binary
  (invoked through `rockskyd pull`)."
  []
  (sh/cargo "rockskyd" "pull"))
