(ns rocksky.native
  "Resolves the native rocksky-uniffi library, downloading a prebuilt from the
  GitHub release on first use when it isn't already present locally.

  Order of preference:
    1. $ROCKSKY_NATIVE_LIB, if set.
    2. librocksky_uniffi.<ext> on the classpath (resources/) — a local
       ./build-core.sh dev build.
    3. A checksum-verified copy in the user cache, downloaded on first load (the
       published-jar path: the native lib is not bundled in the jar).

  The jar ships resources/rocksky/manifest.json (repo, release tag, one sha256
  per target triple) — filled from the release artifacts by
  sdk/scripts/gen-uniffi-manifest.sh."
  (:require [clojure.java.io :as io]
            [cheshire.core :as json])
  (:import [java.io File]
           [java.net URI]
           [java.net.http HttpClient HttpClient$Redirect HttpRequest HttpResponse$BodyHandlers]
           [java.nio.file Files StandardCopyOption]
           [java.nio.file.attribute FileAttribute]
           [java.security MessageDigest]))

(defn- os-ext []
  (let [os (.toLowerCase (System/getProperty "os.name"))]
    (cond (.contains os "mac") "dylib"
          (.contains os "win") "dll"
          :else "so")))

(defn- arch []
  (let [a (.toLowerCase (System/getProperty "os.arch"))]
    (cond (or (= a "amd64") (= a "x86_64")) "x86_64"
          (or (= a "aarch64") (= a "arm64")) "aarch64"
          :else a)))

(defn- triple []
  (let [os (.toLowerCase (System/getProperty "os.name"))]
    (cond
      (.contains os "mac") (str (arch) "-apple-darwin")
      (.contains os "linux") (str (arch) "-linux-gnu")
      (.contains os "freebsd") (str (arch) "-unknown-freebsd")
      (.contains os "netbsd") (str (arch) "-unknown-netbsd")
      (.contains os "openbsd") (str (arch) "-unknown-openbsd")
      :else (throw (ex-info (str "unsupported platform: " os) {})))))

(defn- sha256-hex [^bytes bytes]
  (let [d (.digest (MessageDigest/getInstance "SHA-256") bytes)]
    (apply str (map #(format "%02x" %) d))))

(defn- cache-dir [tag]
  (let [home (System/getProperty "user.home")
        base (or (System/getenv "XDG_CACHE_HOME") (str home "/.cache"))]
    (str base "/rocksky/" tag)))

(defn- download-verify [repo tag t ext sha ^File dest]
  (let [file (str "librocksky_uniffi-" t "." ext)
        url (str "https://github.com/" repo "/releases/download/" tag "/" file)
        ;; GitHub release download URLs 302-redirect to a signed CDN host;
        ;; the JDK client defaults to Redirect/NEVER, so follow them explicitly.
        client (.. (HttpClient/newBuilder)
                   (followRedirects HttpClient$Redirect/NORMAL)
                   (build))
        req (-> (HttpRequest/newBuilder (URI/create url)) (.GET) (.build))
        resp (.send client req (HttpResponse$BodyHandlers/ofByteArray))]
    (when-not (= 200 (.statusCode resp))
      (throw (ex-info (str "download failed (" (.statusCode resp) ") for " url) {})))
    (let [body (.body resp)
          got (sha256-hex body)]
      (when-not (= got sha)
        (throw (ex-info (str "checksum mismatch for " t ": want " sha ", got " got) {})))
      (Files/createDirectories (.toPath (.getParentFile dest)) (make-array FileAttribute 0))
      (let [tmp (File. (str (.getPath dest) ".download"))]
        (io/copy body tmp)
        (Files/move (.toPath tmp) (.toPath dest)
                    (into-array StandardCopyOption [StandardCopyOption/ATOMIC_MOVE]))))))

(defn resolve-lib
  "Absolute path to a loadable native library, fetching it if necessary."
  []
  (let [ext (os-ext)
        env (System/getenv "ROCKSKY_NATIVE_LIB")
        local (io/resource (str "librocksky_uniffi." ext))]
    (cond
      (and env (.exists (File. env)))
      env

      local
      (.getAbsolutePath (File. (.toURI local)))

      :else
      (let [m (json/parse-string (slurp (io/resource "rocksky/manifest.json")))
            t (triple)
            sha (get-in m ["checksums" t])
            _ (when-not sha
                (throw (ex-info (str "no prebuilt native lib for " t
                                     " (manifest has no checksum) — run ./build-core.sh")
                                {:triple t})))
            tag (get m "tag")
            dest (File. (str (cache-dir tag) "/librocksky_uniffi-" t "." ext))]
        (when-not (and (.exists dest)
                       (= sha (sha256-hex (Files/readAllBytes (.toPath dest)))))
          (download-verify (get m "repo") tag t ext sha dest))
        (.getAbsolutePath dest)))))
