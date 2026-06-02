(ns console.cron
  "Thin wrapper around tools/cron.ts (Deno --unstable-cron).

  Example:
      (schedule \"5\" \"bun\" \"run\" \"sync\" \"did:plc:abc\")
      ;; runs every 5 minutes"
  (:require [console.shell :as sh]
            [babashka.fs :as fs]))

(defn schedule
  "Wrap a command in Deno's cron scheduler.
  First arg = interval in minutes, remaining args = the command to run."
  [interval-min & cmd]
  (when (or (nil? interval-min) (empty? cmd))
    (throw (ex-info "Usage: (schedule interval-min cmd & args)"
                    {:given (cons interval-min cmd)})))
  (sh/sh (into ["deno" "run" "--unstable-cron" "-A" "cron.ts"
                (str interval-min)]
               cmd)
         {:dir (str (fs/path (sh/repo-root) "tools"))}))
