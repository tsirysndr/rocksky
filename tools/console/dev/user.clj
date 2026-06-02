(ns user
  "Auto-loaded REPL helpers. Drops every console namespace into scope
  under short aliases so you can poke around immediately.

      user=> (help)
      user=> (sync/user \"did:plc:abc\")
      user=> (lexgen/types)
      user=> (daemons/jetstream)"
  (:require [console.core    :as c]
            [console.shell   :as sh]
            [console.env     :as env]
            [console.lexgen  :as lexgen]
            [console.db      :as db]
            [console.sync    :as sync]
            [console.daemons :as daemons]
            [console.devops  :as devops]
            [console.cron    :as cron]))

(def help c/help)
(def ls   c/ls)

;; Auto-load <repo>/.env on REPL startup. Silent if the file is missing,
;; so a fresh clone still drops into a usable REPL.
(let [n (try (env/load!) (catch Exception _ nil))]
  (println)
  (println "Rocksky Console — REPL loaded. Try (help) or (ls).")
  (println "Aliases in scope: c, sh, env, lexgen, db, sync, daemons, devops, cron")
  (when n
    (println (str "Loaded " n " env vars from .env — `(env/show)` to inspect.")))
  (println))
