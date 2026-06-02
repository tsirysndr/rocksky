(ns console.path
  "Repo-root discovery. Lives in its own namespace so both `console.env`
  and `console.shell` can use it without forming a cycle."
  (:require [babashka.fs :as fs]))

(defn repo-root
  "Walk up from cwd until we find the rocksky monorepo root, identified by
  a `turbo.json` next to a `package.json`."
  []
  (loop [dir (fs/absolutize (fs/cwd))]
    (cond
      (nil? dir)
      (throw (ex-info "Could not locate rocksky repo root" {:cwd (str (fs/cwd))}))

      (and (fs/exists? (fs/path dir "turbo.json"))
           (fs/exists? (fs/path dir "package.json")))
      (str dir)

      :else (recur (fs/parent dir)))))
