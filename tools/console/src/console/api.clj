(ns console.api
  "apps/api code-quality scripts (Biome).

  Thin wrappers around the `format` / `lint` package.json scripts so they're
  discoverable from the REPL alongside every other ops command. Pass `:fix`
  (or the string \"fix\") to apply Biome's `--write` autofix."
  (:refer-clojure :exclude [format])
  (:require [console.shell :as sh]))

(defn- fix?
  "Truthy when the caller passed `:fix` / `\"fix\"` / `:write` / `\"--write\"`."
  [arg]
  (contains? #{:fix "fix" :write "write" "--write"} arg))

(defn format
  "Run `biome format src` inside apps/api.
  Pass `:fix` to add `--write` and persist the formatting changes."
  ([] (format nil))
  ([arg]
   (if (fix? arg)
     (sh/bun "apps/api" "format" "--write")
     (sh/bun "apps/api" "format"))))

(defn lint
  "Run `biome lint src` inside apps/api.
  Pass `:fix` to add `--write` and apply Biome's safe autofixes."
  ([] (lint nil))
  ([arg]
   (if (fix? arg)
     (sh/bun "apps/api" "lint" "--write")
     (sh/bun "apps/api" "lint"))))
