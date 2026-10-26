# Rocksky CI in PureScript

Five PureScript Dagger modules own the portable test, build, release, container
publishing, and deployment steps. GitHub Actions retains triggers, change
detection, matrix scheduling, artifact handoffs, and native platform tooling.

| Module | Function | Original job | What it runs |
| --- | --- | --- | --- |
| `go` | `sdk` | `go-sdk` | `go test ./...` in `sdk/go` |
| `go` | `deezer` | `deezer` | `go test ./...` in `deezer`, with `otel` beside it |
| `go` | `musicbrainz` | `musicbrainz` | `go test -race ./...`, then builds the proxy |
| `typescript` | `sdk` | `typescript-sdk` | `bun install --frozen-lockfile`, then `bun test` |
| `typescript` | `cli` | `tests.yml: cli` | `bun install`, then `bun run test` |
| `rust` | `sdk` | `tests.yml: rust-sdk` | `cargo test` with stable Rust |
| `rust` | `tracklist` | `ci.yml: tests` | Workspace formatting and tracklist tests with Redis |
| `elixir` | `remote-ws` | `tests.yml: remote-ws` | Elixir 1.18 / OTP 27 relay tests |
| `rust` | `matching` | `tests.yml: matching` | Locked release-mode matching regression suite |
| `typescript` | `api-contracts` | `tests.yml: api-contracts` | Contract audits and API tests with PostgreSQL 16 |
| `rust` | `submissions` | `tests.yml: submissions` | Dashboard checks, backend matrix, ingestion, and crash recovery |
| `rust` | `riff` | `riff.yml: test` | Formatting, Clippy, tests, and real HTTP smoke checks |
| `rust` | `rockskyd` | `build.yml: rockskyd` | Linux amd64 release binary returned as a Dagger File |
| `rust` | `mcp-release` | `rocksky-mcp-release.yml: build` (Linux targets) | Stripped amd64/arm64 binary returned as a Dagger File |
| `rust` | `playerd-release` | `playerd-release.yml` (Linux) | Build, playback tests, and isolated D-Bus/MPRIS tests |
| `rust` | `bindings-release` | `bindings-release.yml` (Linux) | Native SDK libraries with original target suffixes |
| `ops` | `desktop-release` | `desktop-release.yml` (Linux) | Ubuntu 22.04 bundles, AppImage smoke checks, checksums |
| `ops` | `nix-build` | `nix-build.yml` (Linux) | Flake packages and optional Cachix uploads |
| `ops` | `publish-postgres` | Postgres image workflow | Both Linux architectures to Docker Hub and GHCR |
| `ops` | `ensure-release`, `package-release`, `upload-release` | Release workflows | Release creation, Linux archives/checksums, uploads |
| `ops` | `deploy` | `build.yml: deploy` | Existing SSH deployment and selected service restarts |

All test jobs in `tests.yml` now call PureScript Dagger functions. GitHub Actions
still owns change detection and job scheduling.

## Run locally

You need Docker (or another Dagger engine), Bash, curl, tar, and a SHA-256 utility.
PureScript, Spago, Go, Bun, Node, Rust, Elixir/OTP, Redis, and PostgreSQL run
inside containers; you do not need them on the host.
From the Rocksky root:

```sh
cd .dagger
./install-dagger.sh
./bin/dagger api call -m go sdk --source ../sdk/go
./bin/dagger api call -m go deezer --source ../deezer --otel ../otel
./bin/dagger api call -m go musicbrainz --source ../musicbrainz --otel ../otel
./bin/dagger api call -m typescript sdk --source ../sdk/typescript
./bin/dagger api call -m typescript cli --source ../apps/cli
./bin/dagger api call -m rust sdk --source ../sdk/rust
./bin/dagger api call -m rust tracklist --source ..
./bin/dagger api call -m rust matching --source ..
./bin/dagger api call -m rust submissions --source ..
./bin/dagger api call -m rust riff --source ../riff
mkdir -p ../target/release
./bin/dagger api call -m rust rockskyd --source .. --output ../target/release/rockskyd
mkdir -p ../rocksky-mcp/target/x86_64-unknown-linux-gnu/release
./bin/dagger api call -m rust mcp-release --source .. \
  --target x86_64-unknown-linux-gnu \
  --output ../rocksky-mcp/target/x86_64-unknown-linux-gnu/release/rocksky-mcp
./bin/dagger api call -m elixir remote-ws --source ../remote-ws
./bin/dagger api call -m typescript api-contracts --source ..
```

Run from `.dagger`: its deliberately empty `.env` stops the beta CLI from reading
application credentials in the repository's `.env`. Do not put secrets in this
file. `source` is the selected project directory; services also take `otel` explicitly.
Most functions accept a narrow project directory. `rust tracklist`,
`rust matching`, `rust submissions`, and `rust rockskyd` take the repository root because Cargo resolves every workspace
member; only `Cargo.toml`, `Cargo.lock`, and `crates/` enter their build containers.
`typescript api-contracts` also takes the root to retain the complete Bun workspace,
patches, and shared fixtures. Root inputs can upload more data; use a clean checkout.

The installer verifies platform-specific release checksums and pins
**Dagger v1.0.0-beta.21**. It installs only into the ignored `.dagger/bin` directory
and adds that directory to `GITHUB_PATH` when running in GitHub Actions.

## Implementation

Edit the relevant module’s `src/Main.purs` under `go/`, `typescript/`, `rust/`,
`elixir/`, or `ops/`. Each module exposes typed
`Aff String`, `Aff File`, or `Aff Directory` handlers with typed inputs. A successful call returns a short result;
container output appears in Dagger's trace. Nonzero test or build exits fail the
function and the GitHub job. The entrypoint uses a 25-minute engine request
timeout for cold downloads and compilation, below the workflow’s 30-minute
job limit. `CI.Runtime.js` only reads the session credentials injected by Dagger;
all pipeline logic stays in PureScript.

The Go image version is read from each project's `go.mod`, as in the original
`setup-go` jobs. Debian-based Go images provide the C compiler used by the race
detector and SQLite. Both services copy `otel/` for their local replace directive.
`DEEZER_SMOKE` stays unset, so the Deezer unit tests don't hit the live API.

The TypeScript module pins Bun 1.4.2 (already used elsewhere in this workflow).
It installs from `sdk/typescript/bun.lock`, outside the root Bun workspace, and
keeps host `node_modules`, build output, and environment files out of its container.
Go module/build caches and the Bun download cache are Dagger cache volumes. They
persist with a local engine. Hosted Linux runners restore and save selected
volumes with the shared GitHub Actions cache wrapper described below.

The CLI function includes Node 22 for its `tsx` runner. It installs the CLI as a
standalone package using its own manifest and historical lockfile, retaining the
original non-frozen `bun install`. Its SDK dependency resolves from the registry.

The Rust module uses `rust:bookworm`, following stable Rust like the original
workflow. Cargo registry, Git, and per-project target directories use Dagger
caches. `tracklist` installs the original native build prerequisites, checks
`cargo fmt --all --check`, and runs `cargo test -p rocksky-tracklist`. Dagger starts
Redis 7 as a service, waits for its exposed port, and makes it available at
`redis://redis:6379`; no host Redis installation or port mapping is needed.

`rust matching` runs the existing `crates/matching/scripts/validate.sh` unchanged:
release mode, the committed Cargo lockfile, and two build jobs. Its tests use
SQLite and local mock providers; no external service is required.

`elixir remote-ws` pins Elixir 1.18.4 / OTP 27, installs Hex and Rebar, and runs
`mix deps.get` followed by `mix test`. Hex downloads, dependencies, and build
output use cache volumes; host `deps/` and `_build/` are excluded. The project's
`config/test.exs` disables external Redis, PostgreSQL, and NATS connections.

`typescript api-contracts` uses Node 22 and Bun 1.4.2, performs the root
`bun install --frozen-lockfile --ignore-scripts`, and preserves every original
audit/test command. Dagger manages an ephemeral PostgreSQL 16 service and exposes
its test-only database URL to the query tests. No production credentials are
needed. Git metadata, Dagger files, host dependencies, Rust targets, and `.env`
files are excluded from the container. Workspace manifests and patches also
trigger this job, since they affect the frozen install.

`rust submissions` runs the dashboard's frozen Bun install, tests, and
`check:dist`, then preserves the PostgreSQL/SQLite feature matrix, Jetstream
ingestion tests, default worker build, and Python HTTP/crash-recovery checks.
Node 22, Bun 1.4.2, Python, and the PostgreSQL client run inside the Rust container.
Dagger provides a fresh PostgreSQL 16 service with a `submissions_test` database.
Database environment variables are scoped to the same commands as the old workflow.

The dashboard check creates a temporary Git index containing the input `dist/`
files before rebuilding. The existing `check:dist` script then detects changed,
deleted, or newly generated assets without needing host Git metadata. In CI the
input is the checked-out commit; locally it is the supplied working tree snapshot.

`rust riff` takes only `riff/`, which is a standalone Cargo workspace. It runs
formatting, Clippy with warnings denied, release tests, and `scripts/ci-smoke.sh`.
The smoke script retains the workflow's fixture generation and checks health,
the home page, track search, album contents, and audio features against a real
background process. Its exit trap stops that process. The existing `cargo.sh`
verifies the static DuckDB release; its download and Rust outputs share the
Riff-specific target cache. Python, curl, and jq are installed in the container.

`rust rockskyd` returns a typed Dagger `File` rather than a success message. Use
`--output` to export it. The build explicitly targets Linux amd64, retains the
DuckDB 1.4.0 shared-library setup and native prerequisites, and runs the original
`cargo build -p rockskyd --release`. Its target cache is separate from test builds.
The binary is copied out of that cache before export. Optional `apps/web/dist/`
assets are included when present, matching the application build script.
GitHub Actions uploads the same `rockskyd` artifact from `target/release/rockskyd`;
the deployment job downloads the artifact, then `ops deploy` handles SSH and
service restarts with the original selection flags and commands.

`rust mcp-release` accepts the repository root and a required `target`:
`x86_64-unknown-linux-gnu` or `aarch64-unknown-linux-gnu`. It selects the matching
Linux container platform, strips release symbols, and returns the executable as
a `File`. Other targets fail before constructing a build. The source includes
the MCP package, its local Rust SDK dependency, and Cargo workspace metadata.
Each target has its own build cache. The release matrix keeps native Linux
runners for both architectures; macOS and Windows retain their original native
build steps. Tag selection and archive names are unchanged. Linux packaging and release
uploads now use `ops`; native-platform packaging/uploads remain on their runners.

## Persistent GitHub Actions caches

`.github/actions/dagger/action.yml` restores a GitHub Actions cache, imports it
into the owning module's named Dagger volumes, runs the pipeline, snapshots the
updated volumes, and saves them through `actions/cache`. The key includes the
engine/cache format version, OS, architecture, pipeline, dependency-lock hash,
and workflow run/attempt; fallback keys reuse the pipeline's previous snapshot.
Snapshots are attempted after failed builds too, but not after cancellation.
A failed snapshot does not replace a successful build result.

Cache volumes are namespaced by Dagger module. Each module therefore exposes
`save-caches` and `restore-caches` through its identical `CI.Cache` helper;
calling those functions on another module would address different volumes.
A unique run ID prevents a cached copy operation from returning an older snapshot.
The wrapper selects Cargo, Go, Bun, Hex, build-output, Tauri, or Nix volumes for
the job. It does not archive the engine, repository checkout, or credential files.
SDK bootstrap layers are rebuilt by a fresh engine.

For manual cache transfer, use the same module for both operations:

```sh
./bin/dagger api call -m rust save-caches \
  --volumes rocksky-cargo-registry,rocksky-cargo-git \
  --run-id manual-save-1 --output /tmp/rocksky-cargo-cache
./bin/dagger api call -m rust restore-caches --source /tmp/rocksky-cargo-cache \
  --volumes rocksky-cargo-registry,rocksky-cargo-git --run-id manual-restore-1
```

## Releases and operations

Linux playerd releases retain the default build, both playback test commands,
and the ignored MPRIS tests under `dbus-run-session`. Linux bindings keep
`sdk/scripts/build-native.sh` and its original artifact names. Both architectures
use matching Linux containers on their native GitHub runners.

The desktop container preserves Ubuntu 22.04, Bun 1.2.15, the production build
mode, optional KLIPY override, version stamping, portable AppImage preparation,
permissions/dependency/startup checks, bundle names, and checksums. Its shell
checks live under `ops/scripts/`; PureScript owns the container and inputs.

Linux Nix builds use Nix 2.28.5 with an isolated, cached `/nix` store. A fresh store
is seeded from the image before it is mounted. Nix's nested sandbox is disabled
inside the Dagger container. All original package builds remain, including the
best-effort Linux desktop build. Cachix is resolved from the repository's locked
Nixpkgs input; empty credentials allow PR builds without uploads.

Postgres publishing builds the existing Dockerfile for `linux/amd64` and
`linux/arm64` and publishes the same two-architecture manifest to Docker Hub and
GHCR. The previous GHCR pull/tag step only copied the runner's architecture.
Registry passwords, GitHub tokens, SSH keys, and the optional desktop key are
Dagger `Secret` arguments passed with `env://VARIABLE`, never command-line values.
Release uploads and deployment use the GitHub run/attempt ID to avoid reusing a
cached side effect. Deployment decodes the existing base64 SSH inputs in a single
execution and removes the temporary key files on exit.

## Platform-specific steps retained

- macOS and Windows native builds, packaging, and uploads run on their original runners.
- BSD binding builds retain the best-effort virtual-machine action; the Linux
  outer runner uploads the resulting artifacts through Dagger.
- macOS desktop signing/DMG creation and macOS Nix/Cachix setup stay native.
- FlakeHub keeps its dedicated GitHub OIDC publishing action.
- GitHub tag resolution, matrices, checkout, and artifact downloads remain workflow glue.

## Transport and validation

The vendored HTTP transport uses Node's native HTTP client so a long build can
wait for headers up to the configured request deadline. Node `fetch` previously
imposed a separate five-minute headers timeout. The patch is present in every
committed module SDK and in the vendored source used by regeneration.

```sh
node --test .dagger/tests/transport.test.mjs # from the repository root
```

PureScript compilation, transport tests, workflow validation, and shell syntax
checks can run without a Dagger engine. Full build, service, publishing, and
deployment execution is left to CI unless explicitly requested.

## SDK and generated bindings

`sdk/purescript` vendors the reviewed beta SDK from `tsirysndr/dagger-sdk` at
commit `156eb76`. This avoids relying on a sibling checkout or an unpublished
remote commit. See `sdk/purescript/VENDORED.md` for provenance and updating it.
The small Go adapter bootstraps PureScript; the CI functions themselves are PureScript.

Each module's `dagger-sdk/` contains generated bindings. Commit those files:
Dagger beta uses committed code during execution. After updating the SDK or
adding dependencies, regenerate from this directory (Python 3 and Git required):

```sh
python3 generate.py
```

The generator stages only `.dagger` in a temporary workspace, avoiding a full
application-tree upload. It copies generated bindings back only after success
and leaves handwritten module source intact.

Commit `dagger.toml`, `dagger.lock`, module manifests, and generated bindings with
the change. Do not edit generated SDK code directly. The vendored SDK preserves
its MIT license and upstream Apache-2.0 notices.
