(ns console.sdk
  "Rocksky multi-language SDKs over the shared Rust core.

  Two native cores are built once and reused everywhere:
    * librocksky_uniffi — Python, Ruby, Clojure, Kotlin (UniFFI / capi C ABI)
    * rocksky_nif       — Erlang, Elixir, Gleam (Rustler NIF)

  This wraps the scripts under `sdk/scripts` plus each `sdk/<lang>/build-core.sh`,
  and the per-language publishers. Publishing is LOCAL-ONLY (the publish scripts
  refuse to run in CI)."
  (:require [console.shell :as sh]
            [clojure.string :as str]))

(def ^:private core-langs
  "Packages with a per-package build-core.sh (gleam reuses the erlang NIF)."
  #{"python" "ruby" "erlang" "clojure" "kotlin"})

(def ^:private publish-langs
  #{"python" "ruby" "erlang" "elixir" "gleam" "clojure" "kotlin"})

(defn build-native
  "Build both native cores (librocksky_uniffi + rocksky_nif) into
  sdk/scripts/dist. An optional target triple only names the staged output
  (each target is built natively, not cross-compiled).
  Usage: (build-native) | (build-native \"aarch64-apple-darwin\")"
  [& [triple]]
  (sh/sh (into ["bash" "sdk/scripts/build-native.sh"] (when triple [triple]))))

(defn gen-bindings
  "Regenerate the UniFFI bindings (Python + Kotlin) from the built core.
  Run `build-native` first."
  []
  (sh/sh ["bash" "sdk/scripts/gen-bindings.sh"]))

(defn build-core
  "Build + wire one package's native core: bash sdk/<lang>/build-core.sh.
  lang ∈ python|ruby|erlang|clojure|kotlin (gleam reuses the erlang NIF)."
  [lang]
  (let [lang (name lang)]
    (when-not (core-langs lang)
      (throw (ex-info (str "build-core: unknown lang " lang
                           " (expected " (str/join "|" (sort core-langs)) ")")
                      {:lang lang})))
    (sh/sh ["bash" (str "sdk/" lang "/build-core.sh")])))

(defn uniffi-manifest
  "Write the UniFFI download manifests (python/ruby/clojure) from a dir of
  release libs. Usage: (uniffi-manifest <dir-of-libs> <tag>)"
  [dir tag]
  (sh/sh ["bash" "sdk/scripts/gen-uniffi-manifest.sh" (str dir) (str tag)]))

(defn nif-manifest
  "Write the NIF checksum manifest (erlang) from a dir of release .so files.
  Usage: (nif-manifest <dir-of-so> <tag>)"
  [dir tag]
  (sh/sh ["bash" "sdk/scripts/gen-nif-manifest.sh" (str dir) (str tag)]))

(defn publish
  "Publish one SDK to its registry: bash sdk/scripts/publish-<lang>.sh [args...].
  lang ∈ python|ruby|erlang|elixir|gleam|clojure|kotlin. LOCAL-ONLY (refuses in
  CI). Extra args pass through — for uniffi/nif langs a <tag> [dir-of-libs],
  for elixir/gleam an optional --dry-run.
  Usage: (publish \"python\" \"bindings-v0.1.0\") | (publish \"gleam\" \"--dry-run\")"
  [lang & args]
  (let [lang (name lang)]
    (when-not (publish-langs lang)
      (throw (ex-info (str "publish: unknown lang " lang
                           " (expected " (str/join "|" (sort publish-langs)) ")")
                      {:lang lang})))
    (sh/sh (into ["bash" (str "sdk/scripts/publish-" lang ".sh")] (map str args)))))
