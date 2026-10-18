(ns console.gleam
  "All gleam/package.json scripts. Colons become hyphens in REPL names.
  Every wrapper runs in gleam/ and forwards arguments to Bun unchanged."
  (:refer-clojure :exclude [test])
  (:require [console.shell :as sh]))

(defn build
  "Run `bun run build` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "build" args))

(defn db-generate-bindings
  "Run `bun run db:generate-bindings` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "db:generate-bindings" args))

(defn dev
  "Run `bun run dev` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "dev" args))

(defn api
  "Run `bun run api` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "api" args))

(defn xrpc
  "Run `bun run xrpc` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "xrpc" args))

(defn prod
  "Run `bun run prod` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "prod" args))

(defn prod-xrpc
  "Run `bun run prod:xrpc` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "prod:xrpc" args))

(defn test
  "Run `bun run test` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "test" args))

(defn db-migrate
  "Run `bun run db:migrate` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "db:migrate" args))

(defn sync
  "Run `bun run sync` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "sync" args))

(defn typesense-import
  "Run `bun run typesense:import` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "typesense:import" args))

(defn sync-library
  "Run `bun run sync:library` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "sync:library" args))

(defn sync-library-playlist
  "Run `bun run sync:library-playlist` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "sync:library-playlist" args))

(defn avatar
  "Run `bun run avatar` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "avatar" args))

(defn genres
  "Run `bun run genres` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "genres" args))

(defn spotify
  "Run `bun run spotify` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "spotify" args))

(defn exp
  "Run `bun run exp` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "exp" args))

(defn collections
  "Run `bun run collections` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "collections" args))

(defn feed
  "Run `bun run feed` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "feed" args))

(defn event
  "Run `bun run event` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "event" args))

(defn dedup
  "Run `bun run dedup` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "dedup" args))

(defn dedup-records
  "Run `bun run dedup:records` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "dedup:records" args))

(defn seed-feed
  "Run `bun run seed:feed` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "seed:feed" args))

(defn likes
  "Run `bun run likes` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "likes" args))

(defn backfill-likes
  "Run `bun run backfill:likes` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:likes" args))

(defn backfill-isrc-mbid
  "Run `bun run backfill:isrc-mbid` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:isrc-mbid" args))

(defn riff-backfill
  "Run `bun run riff:backfill` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "riff:backfill" args))

(defn backfill-track-uri
  "Run `bun run backfill:track-uri` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:track-uri" args))

(defn backfill-replaygain
  "Run `bun run backfill:replaygain` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:replaygain" args))

(defn backfill-analysis
  "Run `bun run backfill:analysis` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:analysis" args))

(defn backfill-discogs
  "Run `bun run backfill:discogs` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:discogs" args))

(defn backfill-fingerprint
  "Run `bun run backfill:fingerprint` in gleam/. Additional arguments are forwarded."
  [& args]
  (apply sh/bun "gleam" "backfill:fingerprint" args))

(defn dev-env
  "Generate local env; :force resets settings and secrets. Other args are forwarded."
  [& args]
  (apply sh/bun "gleam" "dev:env" (map #(if (= :force %) "--force" %) args)))

(defn db-seed
  "Seed feed generators in the local Docker Compose database."
  [& args]
  (apply sh/bun "gleam" "db:seed" args))

(defn backfill-jetstream-v2
  "Replay app.rocksky.* archives. Accepts keyword flags and numeric values, e.g. :dry-run :limit 100; strings pass through."
  [& args]
  (apply sh/bun "gleam" "backfill:jetstream-v2"
         (map #(if (keyword? %) (str "--" (name %)) (str %)) args)))
