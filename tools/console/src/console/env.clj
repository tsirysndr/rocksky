(ns console.env
  "Load env vars from `.env` files or Doppler into a Clojure atom, and have
  every console command inherit them via subprocess env injection
  (see `console.shell`).

  Quick tour:

      (env/load!)                       ; loads <repo>/.env
      (env/load! \"apps/api/.env\")       ; merges another file
      (env/doppler!)                    ; pulls secrets from Doppler
                                        ; (uses doppler.yaml in repo)
      (env/doppler! \"rocksky\" \"dev\")    ; explicit project + config
      (env/show)                        ; prints loaded keys, values masked
      (env/get \"DATABASE_URL\")          ; raw value
      (env/reload!)                     ; re-pull every loaded source
      (env/unload!)                     ; back to JVM-inherited env

  Sources are layered: each `load!` / `doppler!` call merges on top of
  whatever is already there, so later sources win. `reload!` replays
  every source in the order it was originally loaded."
  (:refer-clojure :exclude [get])
  (:require [clojure.string :as str]
            [babashka.process :as p]
            [babashka.fs :as fs]
            [console.path :as path]))

(def ^:dynamic *env*
  "Atom holding the currently loaded env map ({string -> string}).
  Read by `console.shell/sh` and friends when spawning subprocesses."
  (atom {}))

(defonce ^:private sources
  ;; Vector of {:type :file :path "..."} or {:type :doppler :project "..." :config "..."}
  (atom []))

;; ── parsing (dotenv format) ──────────────────────────────────────────

(defn- strip-quotes [s]
  (let [s (str/trim s)]
    (cond
      (and (>= (count s) 2)
           (str/starts-with? s "\"") (str/ends-with? s "\"")) (subs s 1 (dec (count s)))
      (and (>= (count s) 2)
           (str/starts-with? s "'")  (str/ends-with? s "'"))  (subs s 1 (dec (count s)))
      :else s)))

(defn parse-dotenv
  "Parse a dotenv-format string into {string -> string}. Handles
  `KEY=value`, quoted values, `export ` prefix, `# comments`, blanks."
  [text]
  (->> (str/split-lines text)
       (keep (fn [raw]
               (let [line (str/trim raw)]
                 (when-not (or (empty? line) (str/starts-with? line "#"))
                   (let [line (cond-> line
                                (str/starts-with? line "export ") (subs 7))
                         idx  (.indexOf line "=")]
                     (when (pos? idx)
                       [(str/trim (subs line 0 idx))
                        (strip-quotes (subs line (inc idx)))]))))))
       (into {})))

;; ── source management ───────────────────────────────────────────────

(defn- record-source! [src]
  (swap! sources (fn [xs] (-> xs (->> (remove #(= % src))) vec (conj src)))))

(defn- apply-source!
  "Pull the given source's vars and merge into *env*. Returns key-count
  or `nil` if nothing was loaded."
  [{:keys [type] :as src}]
  (case type
    :file    (let [path (:path src)]
               (when (fs/exists? path)
                 (let [m (parse-dotenv (slurp path))]
                   (swap! *env* merge m)
                   (count m))))
    :doppler (let [{:keys [project config]} src
                   args (cond-> ["doppler" "secrets" "download" "--no-file" "--format" "env"]
                          project (into ["--project" project])
                          config  (into ["--config" config]))
                   {:keys [out exit err]} @(p/process args
                                                      {:out :string :err :string
                                                       :dir (path/repo-root)})]
               (when-not (zero? exit)
                 (throw (ex-info "doppler secrets download failed"
                                 {:exit exit :stderr (str/trim err) :args args})))
               (let [m (parse-dotenv out)]
                 (swap! *env* merge m)
                 (count m)))))

;; ── public API ──────────────────────────────────────────────────────

(defn- resolve-path [p]
  (let [p (str p)]
    (if (fs/absolute? p) p (str (fs/path (path/repo-root) p)))))

(defn load!
  "Merge a `.env` file into `*env*`. Path is relative to repo root if not
  absolute. With no args, loads `<repo>/.env`. Returns key-count or
  `nil` if the file does not exist."
  ([] (load! ".env"))
  ([path]
   (let [src {:type :file :path (resolve-path path)}]
     (when-let [n (apply-source! src)]
       (record-source! src)
       n))))

(defn doppler!
  "Pull secrets from Doppler and merge into `*env*`.

  With no args, uses whatever `doppler.yaml` (`doppler setup`) is
  configured in the repo. With explicit args:

      (doppler! \"rocksky\" \"dev\")     ; project + config
      (doppler! nil       \"prd\")     ; just override config

  Requires the `doppler` CLI on PATH and an existing `doppler login`."
  ([] (doppler! nil nil))
  ([project config]
   (let [src (cond-> {:type :doppler}
               project (assoc :project project)
               config  (assoc :config  config))
         n   (apply-source! src)]
     (record-source! src)
     n)))

(defn unload!
  "Clear `*env*` and forget every loaded source."
  []
  (reset! *env* {})
  (reset! sources [])
  :ok)

(defn reload!
  "Re-pull every previously loaded source, in order."
  []
  (let [srcs @sources]
    (reset! *env* {})
    (reset! sources [])
    (doseq [s srcs]
      (case (:type s)
        :file    (load! (:path s))
        :doppler (doppler! (:project s) (:config s))))
    (count @*env*)))

(defn sources-list
  "Return the currently loaded source descriptors (for inspection)."
  []
  @sources)

;; ── inspection ──────────────────────────────────────────────────────

(defn- mask [v]
  (let [s (str v)]
    (cond
      (empty? s)        ""
      (<= (count s) 4)  "***"
      :else             (str (subs s 0 2) "***" (subs s (- (count s) 2))))))

(defn- source-label [{:keys [type path project config]}]
  (case type
    :file    path
    :doppler (str "doppler:"
                  (or project "<setup>") "/"
                  (or config  "<setup>"))))

(defn show
  "Print every loaded key with its value masked."
  []
  (let [m @*env*]
    (if (empty? m)
      (println "(env empty — try (env/load!) or (env/doppler!))")
      (do
        (println (str (count m) " key(s) loaded from "
                      (mapv source-label @sources) ":"))
        (doseq [[k v] (sort-by key m)]
          (println " " k "=" (mask v)))))
    :ok))

(defn get
  "Fetch one value (raw, not masked)."
  ([k] (get k nil))
  ([k default] (clojure.core/get @*env* (str k) default)))

(defn as-map
  "Return a copy of the current env map. Used by `console.shell` to seed
  every subprocess's `:extra-env`."
  []
  (into {} @*env*))
