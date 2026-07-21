(ns rocksky.native
  "Resolves the native Rocksky core library (librocksky_uniffi), built from the
  shared Rust core by ../build-core.sh.

  Order of preference:
    1. $ROCKSKY_NATIVE_LIB, if set.
    2. librocksky_uniffi.<ext> on the classpath (e.g. a native/ dir or resources/)
       — a local dev build."
  (:require [clojure.java.io :as io])
  (:import [java.io File]))

(defn- os-ext []
  (let [os (.toLowerCase (System/getProperty "os.name"))]
    (cond (.contains os "mac") "dylib"
          (.contains os "win") "dll"
          :else "so")))

(defn resolve-lib
  "Absolute path to a loadable native library."
  []
  (let [env (System/getenv "ROCKSKY_NATIVE_LIB")]
    (cond
      (and env (.exists (File. env)))
      env

      :else
      (let [res (io/resource (str "librocksky_uniffi." (os-ext)))]
        (if res
          (.getAbsolutePath (File. (.toURI res)))
          (throw (ex-info "native lib not found — run ../build-core.sh or set ROCKSKY_NATIVE_LIB"
                          {})))))))
