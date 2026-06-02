(ns console.lexgen
  "Lexicon code generation.

  Two distinct flows live in the repo:

  * `server`  — apps/api uses @atproto/lex-cli to emit *server* bindings
                from the lexicons in apps/api/lexicons + tealfm.
  * `types`   — tools/lexgen/generate.ts emits *SDK* bindings for every
                target language (TS/Go/Py/Rust/Kotlin/Ruby/Elixir/Clojure/Gleam).

  Per project convention (see [[feedback-sdk-codegen-isolation]]) the SDK
  generators only write into each `sdk/<lang>/.../generated/` subtree —
  never touch hand-written files there."
  (:require [console.shell :as sh]))

(defn server
  "Run the apps/api `lexgen` script (server bindings via @atproto/lex-cli)."
  []
  (sh/bun "apps/api" "lexgen"))

(defn types
  "Run tools/lexgen/generate.ts to regenerate every SDK's `generated/`."
  []
  (sh/sh ["bun" "run" "tools/lexgen/generate.ts"]))
