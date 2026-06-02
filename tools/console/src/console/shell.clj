(ns console.shell
  "Shell-out helpers shared by every command wrapper.

  Two flavors:
    `sh`   — inherit stdio (you see live output, exit-code returned)
    `sh!`  — capture (returns {:out :err :exit}), throws on non-zero
    `sh*`  — background (returns a process handle you can deref)"
  (:require [babashka.process :as p]
            [babashka.fs :as fs]
            [clojure.java.io :as io]
            [clojure.string :as str]))

(defn repo-root
  "Walk up from *file* (or cwd) until we find the rocksky monorepo root,
  identified by a `turbo.json` next to a `package.json`."
  []
  (loop [dir (fs/absolutize (or (some-> (System/getProperty "user.dir") fs/path)
                                (fs/cwd)))]
    (cond
      (nil? dir) (throw (ex-info "Could not locate rocksky repo root" {}))
      (and (fs/exists? (fs/path dir "turbo.json"))
           (fs/exists? (fs/path dir "package.json")))
      (str dir)
      :else (recur (fs/parent dir)))))

(defn- in-repo [opts]
  (merge {:dir (repo-root) :inherit true} opts))

(defn sh
  "Run a command with inherited stdio. Returns the exit code.
  Accepts either a vector of args or a single string (which is split)."
  ([cmd] (sh cmd {}))
  ([cmd opts]
   (let [args (cond
                (vector? cmd) cmd
                (string? cmd) (str/split cmd #"\s+")
                :else (throw (ex-info "cmd must be string or vector" {:cmd cmd})))
         proc (p/process args (in-repo opts))]
     (:exit @proc))))

(defn sh!
  "Like `sh` but captures stdout/stderr and throws on non-zero exit."
  ([cmd] (sh! cmd {}))
  ([cmd opts]
   (let [args (if (vector? cmd) cmd (str/split cmd #"\s+"))
         opts (merge {:dir (repo-root) :out :string :err :string} opts)]
     @(p/process args opts))))

(defn sh*
  "Run in the background. Returns a process handle (deref for exit info)."
  ([cmd] (sh* cmd {}))
  ([cmd opts]
   (let [args (if (vector? cmd) cmd (str/split cmd #"\s+"))]
     (p/process args (in-repo opts)))))

(defn npm
  "Shortcut for `npm run <script>` from repo root."
  [script & args]
  (sh (into ["npm" "run" script "--"] args)))

(defn bun
  "Shortcut for `bun run <script>` inside `dir` (relative to repo root)."
  [dir script & args]
  (sh (into ["bun" "run" script] args)
      {:dir (str (fs/path (repo-root) dir))}))

(defn cargo
  "`cargo run -p <crate> --release -- <args>`"
  [crate & args]
  (sh (into ["cargo" "run" "-p" crate "--release" "--"] (map str args))))
