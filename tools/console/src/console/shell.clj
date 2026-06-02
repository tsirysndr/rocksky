(ns console.shell
  "Shell-out helpers shared by every command wrapper.

  Two flavors:
    `sh`   — inherit stdio (you see live output, exit-code returned)
    `sh!`  — capture (returns {:out :err :exit}), throws on non-zero
    `sh*`  — background (returns a process handle you can deref)

  Every subprocess automatically inherits `@console.env/*env*` via
  `:extra-env`. Pass `:extra-env {...}` in opts to override individual
  keys for one call."
  (:require [babashka.process :as p]
            [babashka.fs :as fs]
            [clojure.string :as str]
            [console.path :as path]
            [console.env  :as env]))

(defn repo-root
  "Re-exported for callers that want the repo root."
  []
  (path/repo-root))

(defn- with-env
  "Make `@env/*env*` the default `:extra-env`. Per-call `:extra-env` wins."
  [opts]
  (assoc opts :extra-env (merge (env/as-map) (:extra-env opts))))

(defn- in-repo [opts]
  (-> (merge {:dir (path/repo-root) :inherit true} opts)
      with-env))

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
         opts (-> {:dir (path/repo-root) :out :string :err :string}
                  (merge opts)
                  with-env)]
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
      {:dir (str (fs/path (path/repo-root) dir))}))

(defn cargo
  "`cargo run -p <crate> --release -- <args>`"
  [crate & args]
  (sh (into ["cargo" "run" "-p" crate "--release" "--"] (map str args))))
