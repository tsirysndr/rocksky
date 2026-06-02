(ns console.sync
  "Data operations that live as `tsx` scripts under apps/api/src/scripts.

  All of these shell out to the existing bun scripts so behavior matches
  what runs in CI / on the server."
  (:require [console.shell :as sh]))

(defn user
  "Sync one user's scrobbles. Pass a DID or handle.

      (user \"did:plc:abc123\")
      (user \"alice.bsky.social\")"
  [did-or-handle]
  (when (nil? did-or-handle)
    (throw (ex-info "user: did-or-handle is required" {})))
  (sh/bun "apps/api" "sync" did-or-handle))

(defn library
  "Sync the user's full library."
  []
  (sh/bun "apps/api" "sync:library"))

(defn backfill-isrc-mbid
  "Backfill ISRC + MusicBrainz IDs on tracks missing them."
  []
  (sh/bun "apps/api" "backfill:isrc-mbid"))

(defn typesense-import
  "Bulk-index data into Typesense for search."
  []
  (sh/bun "apps/api" "typesense:import"))

(defn dedup
  "Remove duplicate track entries."
  []
  (sh/bun "apps/api" "dedup"))

(defn genres
  "Seed/refresh the genre taxonomy."
  []
  (sh/bun "apps/api" "genres"))

(defn collections
  "Seed/manage curated collections."
  []
  (sh/bun "apps/api" "collections"))

(defn seed-feed
  "Seed initial feed entries."
  []
  (sh/bun "apps/api" "seed:feed"))

(defn feed
  "Rebuild feed caches."
  []
  (sh/bun "apps/api" "feed"))

(defn likes
  "Process user likes."
  []
  (sh/bun "apps/api" "likes"))

(defn avatar
  "Generate/process user avatars."
  []
  (sh/bun "apps/api" "avatar"))

(defn spotify-creds
  "Register Spotify app credentials.

      (spotify-creds \"client_id\" \"client_secret\")"
  [client-id client-secret]
  (sh/bun "apps/api" "spotify" client-id client-secret))

(defn exp
  "Ad-hoc experimentation script (apps/api/src/scripts/exp.ts)."
  []
  (sh/bun "apps/api" "exp"))
