(ns console.devops
  "DevOps & glue: DDB backup, raichu wasm build, local dev proxy,
  musicbrainz Go server."
  (:require [console.shell :as sh]
            [babashka.fs :as fs]))

(defn backup-ddb
  "Run backup-ddb.sh — copies DuckDB analytics+feed dbs (and WAL files)
  to Cloudflare R2. Requires CF_ACCOUNT_ID env var and an `r2` AWS profile."
  []
  (sh/sh ["bash" "backup-ddb.sh"]))

(defn build-raichu
  "wasm-pack build crates/raichu and copy the pkg/ into apps/web/src."
  []
  ;; Equivalent of the package.json script `build:raichu`.
  (let [root (sh/repo-root)
        raichu (str (fs/path root "crates/raichu"))]
    (sh/sh ["wasm-pack" "build" "--release" "--target" "web"] {:dir raichu})
    (sh/sh ["cp" "-r" "pkg" (str (fs/path root "apps/web/src"))] {:dir raichu})))

(defn local-proxy
  "Run tools/local-proxy.ts — splits :4004 (API) and :5174 (frontend) on :8081."
  []
  (sh/sh ["deno" "task" "local-proxy"]
         {:dir (str (fs/path (sh/repo-root) "tools"))}))

(defn mb
  "Run the musicbrainz Go metadata cache/proxy server."
  []
  (sh/sh ["go" "run" "main.go"]
         {:dir (str (fs/path (sh/repo-root) "musicbrainz"))}))
