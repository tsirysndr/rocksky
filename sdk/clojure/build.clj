(ns build
  "Build, install, and publish the Rocksky Clojure SDK.

  Tasks:
    clojure -T:build clean
    clojure -T:build jar         ;; build the jar in target/
    clojure -T:build install     ;; install to ~/.m2 for local testing
    clojure -T:build deploy      ;; publish to Clojars (needs creds)

  Override version on the command line:
    clojure -T:build jar :version '\"0.2.0\"'"
  (:require [clojure.tools.build.api :as b]
            [deps-deploy.deps-deploy :as dd]))

(def lib         'app.rocksky/sdk)
(def version     "0.3.0-SNAPSHOT")
(def class-dir   "target/classes")
(def basis       (delay (b/create-basis {:project "deps.edn"})))
(def jar-file    (format "target/%s-%s.jar" (name lib) version))

(def scm
  {:url                 "https://github.com/tsirysndr/rocksky"
   :connection          "scm:git:git://github.com/tsirysndr/rocksky.git"
   :developerConnection "scm:git:ssh://git@github.com/tsirysndr/rocksky.git"
   :tag                 (str "sdk-clojure-v" version)})

(def pom-data
  [[:description "Idiomatic, pipe-friendly Clojure client for the Rocksky XRPC API."]
   [:url "https://github.com/tsirysndr/rocksky/tree/main/sdk/clojure"]
   [:licenses
    [:license
     [:name "MIT License"]
     [:url "https://opensource.org/licenses/MIT"]]]
   [:developers
    [:developer
     [:name "Tsiry Sandratraina"]
     [:email "tsiry.sndr@rocksky.app"]]]])

(defn clean
  "Delete the build target directory."
  [_]
  (b/delete {:path "target"}))

(defn jar
  "Build the jar in target/. Accepts optional :version override."
  [{:keys [version] :or {version version}}]
  (let [jar-file (format "target/%s-%s.jar" (name lib) version)]
    (println (format "Building %s/%s %s ..." (namespace lib) (name lib) version))
    (b/write-pom {:class-dir class-dir
                  :lib       lib
                  :version   version
                  :basis     @basis
                  :src-dirs  ["src"]
                  :scm       scm
                  :pom-data  pom-data})
    (b/copy-dir {:src-dirs   ["src" "resources"]
                 :target-dir class-dir})
    (b/jar {:class-dir class-dir
            :jar-file  jar-file})
    (println "Wrote" jar-file)))

(defn install
  "Install the jar into the local ~/.m2 repository."
  [{:keys [version] :or {version version} :as opts}]
  (jar opts)
  (b/install {:basis     @basis
              :lib       lib
              :version   version
              :jar-file  (format "target/%s-%s.jar" (name lib) version)
              :class-dir class-dir})
  (println "Installed" lib version "to ~/.m2"))

(defn deploy
  "Publish the jar to Clojars.

  Requires CLOJARS_USERNAME and CLOJARS_PASSWORD (or a deploy token) in env."
  [{:keys [version] :or {version version} :as opts}]
  (jar opts)
  (let [jar-file (format "target/%s-%s.jar" (name lib) version)]
    (dd/deploy {:installer :remote
                :artifact  (b/resolve-path jar-file)
                :pom-file  (b/pom-path {:lib lib :class-dir class-dir})})
    (println "Deployed" lib version "to Clojars")))
