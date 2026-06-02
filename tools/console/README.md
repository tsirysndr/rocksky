# Rocksky Console

A **single Clojure REPL for every operational script in the monorepo.** Instead
of remembering which `package.json` script lives in which workspace, which
`cargo run -p ...` invokes which daemon, or which `bash` glue script you wrote
six months ago, you sit in one REPL and call functions:

```clojure
user=> (sync/user "did:plc:abc123")
user=> (db/migrate)
user=> (lexgen/types)
user=> (daemons/jetstream)
user=> (devops/backup-ddb)
```

Every command is a thin Clojure wrapper around the existing tool (bun, deno,
cargo, go, bash). Nothing in the underlying scripts changes — `console` is
purely a **discoverable, composable front door** with autocomplete and
docstrings.

---

## Why a console?

The repo has ~30 entry points spread across Bun, Deno, Rust (cargo), Go, and
shell. There is no single `--help` that lists them; you have to read
`package.json`, `tools/deno.json`, `crates/*/Cargo.toml`, and `*.sh` files to
know what exists.

The console gives you:

- **One catalog** — `(help)` or `bb help` prints every command, grouped.
- **REPL-driven ops** — call functions, pipe their output through `clojure.string`,
  loop over a list of DIDs, build ad-hoc one-off pipelines.
- **One-shot CLI too** — `bb sync did:plc:abc` works without booting a REPL.
- **Docstrings everywhere** — `(doc sync/user)` tells you what args it takes.
- **Versioned toolchain** — mise locks JDK + Clojure + Babashka so everyone
  runs the same versions.

---

## Layout

```
tools/console/
├── .mise.toml              # locks java=temurin-21, clojure, bb
├── deps.edn                # JVM Clojure project (nREPL via :dev alias)
├── bb.edn                  # Babashka tasks (one per command)
├── README.md               # ← you are here
├── dev/
│   └── user.clj            # auto-loaded REPL helpers
└── src/console/
    ├── core.clj            # registry, (help), (ls), dispatch
    ├── shell.clj           # process helpers (sh, sh!, sh*, cargo, bun)
    ├── lexgen.clj          # lexicon codegen wrappers
    ├── db.clj              # migrate, gen-migration, pkl, pgpull
    ├── sync.clj            # apps/api data-op scripts (12 commands)
    ├── daemons.clj         # all Rust services
    ├── devops.clj          # backup-ddb, build-raichu, local-proxy, mb
    └── cron.clj            # wraps tools/cron.ts
```

---

## Prerequisites

The project pins its own toolchain via [mise](https://mise.jdx.dev/). From this
directory:

```bash
cd tools/console
mise install     # installs JDK 21, Clojure 1.12, Babashka
```

That writes nothing outside this directory — versions are recorded in
`.mise.toml` and selected automatically whenever you `cd` here (assuming you
have mise's shell hook enabled).

You still need the **underlying toolchain** the scripts shell out to:

| Used by                                  | Tool                          |
| ---------------------------------------- | ----------------------------- |
| `lexgen`, `db`, `sync` (apps/api scripts) | `bun`                         |
| `daemons`, `db/pgpull`                   | `cargo` + Rust toolchain      |
| `cron`, `local-proxy`                    | `deno`                        |
| `mb`                                     | `go`                          |
| `backup-ddb`                             | `bash`, `aws` CLI, R2 profile |
| `build-raichu`                           | `wasm-pack`                   |

The console will surface a useful error if any of these are missing.

---

## Two ways to use it

### 1. REPL (recommended for ops sessions)

```bash
cd tools/console
clj -M:dev
```

You'll get an nREPL on `:7888` (CIDER/Calva-compatible). The `user.clj`
preloads every console namespace under short aliases:

```clojure
user=> (help)                          ;; full command catalog
user=> (ls)                            ;; same, no banner
user=> (doc sync/user)                 ;; docstring for a command
user=> (sync/user "did:plc:abc123")    ;; run it

;; Loop over many users:
user=> (doseq [did ["did:plc:a" "did:plc:b" "did:plc:c"]]
         (sync/user did))

;; Background a daemon, keep working:
user=> (def js (sh/sh* ["cargo" "run" "-p" "rockskyd" "--release" "--" "jetstream"]))
user=> (.destroyForcibly ^Process (:proc js))
```

### 2. Babashka one-shots (recommended for shell pipelines & CI)

Starts in ~50 ms, no JVM:

```bash
cd tools/console
bb help                                # list commands
bb tasks                               # list bb tasks
bb sync did:plc:abc123                 # run a command
bb d:jetstream                         # start the jetstream daemon
bb cron 5 bun run sync did:plc:abc     # schedule every 5 minutes
```

Both runtimes share the same source tree under `src/`, so a wrapper added in
`sync.clj` is immediately callable from either.

---

## Command catalog

Run `(help)` / `bb help` for the live list. Snapshot:

| Group     | Command                  | What it does                                        |
| --------- | ------------------------ | --------------------------------------------------- |
| `lexgen`  | `server`                 | apps/api lex gen-server                             |
|           | `types`                  | SDK type bindings (TS/Go/Py/Rust/Kotlin/…)          |
| `db`      | `migrate`                | drizzle-kit migrate                                 |
|           | `gen-migration`          | drizzle-kit generate                                |
|           | `pkl-eval` / `pkl-gen`   | Pkl config                                          |
|           | `pgpull`                 | rocksky-pgpull (via rockskyd)                       |
| `sync`    | `user <did>`             | sync one user's scrobbles                           |
|           | `library`                | sync user library                                   |
|           | `backfill-isrc-mbid`     | backfill ISRC + MBID                                |
|           | `typesense-import`       | bulk-index Typesense                                |
|           | `dedup`                  | remove duplicate tracks                             |
|           | `genres`, `collections`  | seed taxonomies / curated collections               |
|           | `seed-feed`, `feed`      | feed init / rebuild                                 |
|           | `likes`, `avatar`        | likes processing, avatar generation                 |
|           | `spotify-creds <id> <s>` | register Spotify app creds                          |
|           | `exp`                    | ad-hoc experimentation                              |
| `daemons` | `analytics` … `tracklist`| every `rockskyd <subcommand>`                       |
|           | `connect`, `storage`     | rocksky-connect, rocksky-storage                    |
| `devops`  | `backup-ddb`             | DuckDB → R2 backup                                  |
|           | `build-raichu`           | wasm-pack build + copy into apps/web                |
|           | `local-proxy`            | local dev split-proxy on :8081                      |
|           | `mb`                     | musicbrainz Go cache server                         |
| `cron`    | `schedule <min> <cmd>`   | wrap any command in Deno cron                       |

---

## Adding a new command

1. Pick (or create) the right namespace in `src/console/`.
2. Add a `defn` that shells out via `console.shell`:
   ```clojure
   (defn my-new-script
     "One-liner explaining what it does."
     []
     (sh/bun "apps/api" "my-new-script"))
   ```
3. Add an entry to the `registry` in `src/console/core.clj` so it shows up in
   `(help)`.
4. Optionally add a task in `bb.edn` so it has a `bb my-new-script` shortcut.

That's it — no compilation step, the REPL picks it up on next `(require … :reload)`.

---

## Design notes

- **Wrappers, not reimplementations.** Every wrapper calls the existing script.
  This means production behavior is identical and we never have two
  implementations to keep in sync.
- **Shared `src/` between clj and bb.** The source tree lives at `src/`; both
  `deps.edn` and `bb.edn` point at it. Don't import anything that Babashka
  can't load (no AOT-only libs, no native-image-incompatible deps).
- **Repo root via marker files.** `console.shell/repo-root` walks up looking
  for `turbo.json` + `package.json`, so commands work no matter where the REPL
  was started.
- **Foreground by default.** Daemons run with inherited stdio so Ctrl-C kills
  them. Use `console.shell/sh*` to background a process from the REPL.
- **Codegen isolation.** Per project policy, `lexgen/types` only writes into
  each `sdk/<lang>/.../generated/` subtree. The console does not change this;
  it only invokes the existing generator.

---

## Troubleshooting

- **`clojure: command not found`** — run `mise install` in this directory.
- **`bb: command not found`** — same; locked in `.mise.toml` as `babashka`
  (the binary it installs is still called `bb`).
- **`Could not locate rocksky repo root`** — you started the REPL outside the
  monorepo. `cd` into the repo (or any subdir) first.
- **Daemon won't stop** — JVM REPL: `(.destroyForcibly ^Process (:proc <handle>))`.
  Babashka one-shot: Ctrl-C.

---

## What this is *not*

- Not a replacement for `package.json` scripts. Those still work; the console
  just calls them.
- Not a new build system. Turbo / cargo / deno still own builds.
- Not a config layer. It does not read or write `.env` — environment is
  inherited from the calling shell.
