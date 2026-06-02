(ns user
  "Auto-loaded REPL helpers. Drops every console namespace into scope
  under short aliases so you can poke around immediately.

      user=> (help)
      user=> (sync/user \"did:plc:abc\")
      user=> (lexgen/types)
      user=> (daemons/jetstream)"
  (:require [console.core    :as c]
            [console.shell   :as sh]
            [console.lexgen  :as lexgen]
            [console.db      :as db]
            [console.sync    :as sync]
            [console.daemons :as daemons]
            [console.devops  :as devops]
            [console.cron    :as cron]))

(def help c/help)
(def ls   c/ls)

(println)
(println "Rocksky Console — REPL loaded. Try (help) or (ls).")
(println "Aliases in scope: c, sh, lexgen, db, sync, daemons, devops, cron")
(println)
