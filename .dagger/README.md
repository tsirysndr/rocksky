# Rocksky CI in PureScript

Three Dagger modules port seven jobs from `.github/workflows/tests.yml` and
`.github/workflows/ci.yml`. The workflows retain their triggers and job names;
`tests.yml` retains its path filters and concurrency. PureScript owns the
container setup and commands.

| Module | Function | Original job | What it runs |
| --- | --- | --- | --- |
| `go` | `sdk` | `go-sdk` | `go test ./...` in `sdk/go` |
| `go` | `deezer` | `deezer` | `go test ./...` in `deezer`, with `otel` beside it |
| `go` | `musicbrainz` | `musicbrainz` | `go test -race ./...`, then builds the proxy |
| `typescript` | `sdk` | `typescript-sdk` | `bun install --frozen-lockfile`, then `bun test` |
| `typescript` | `cli` | `tests.yml: cli` | `bun install`, then `bun run test` |
| `rust` | `sdk` | `tests.yml: rust-sdk` | `cargo test` with stable Rust |
| `rust` | `tracklist` | `ci.yml: tests` | Workspace formatting and tracklist tests with Redis |

## Run locally

You need Docker (or another Dagger engine), Bash, curl, tar, and a SHA-256 utility.
PureScript, Spago, Go, Bun, Node, Rust, and Redis run inside containers; you do not need them on the host.
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
```

Run from `.dagger`: its deliberately empty `.env` stops the beta CLI from reading
application credentials in the repository's `.env`. Do not put secrets in this
file. `source` is the selected project directory; services also take `otel` explicitly.
Most functions accept a narrow project directory. `rust tracklist` takes the
repository root because Cargo resolves every workspace member; only `Cargo.toml`,
`Cargo.lock`, and `crates/` are copied into its build container. A root input can
upload more data, so use a clean checkout for that function.

The installer verifies platform-specific release checksums and pins
**Dagger v1.0.0-beta.21**. It installs only into the ignored `.dagger/bin` directory
and adds that directory to `GITHUB_PATH` when running in GitHub Actions.

## Implementation

Edit `go/src/Main.purs`, `typescript/src/Main.purs`, or `rust/src/Main.purs`. Each module exposes typed
`Aff String` handlers with typed directory inputs. A successful call returns a short result;
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
persist with a local engine; hosted GitHub runners start with a fresh engine.

The CLI function includes Node 22 for its `tsx` runner. It installs the CLI as a
standalone package using its own manifest and historical lockfile, retaining the
original non-frozen `bun install`. Its SDK dependency resolves from the registry.

The Rust module uses `rust:bookworm`, following stable Rust like the original
workflow. Cargo registry, Git, and per-project target directories use Dagger
caches. `tracklist` installs the original native build prerequisites, checks
`cargo fmt --all --check`, and runs `cargo test -p rocksky-tracklist`. Dagger starts
Redis 7 as a service, waits for its exposed port, and makes it available at
`redis://redis:6379`; no host Redis installation or port mapping is needed.

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
