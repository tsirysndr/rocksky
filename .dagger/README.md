# Rocksky CI in PureScript

Nine PureScript Dagger modules own the portable test, build, release, container
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

You need Node 24, npm, curl, tar, and Docker (or another Dagger engine).
The runner-side PureScript module bootstraps the verified Dagger CLI. Application
build tools and services run in containers; native release jobs use their original runners.
From the Rocksky root, `bootstrap` installs dependencies, compiles the PureScript
runner, then verifies and installs Dagger. From `.dagger/host`, use `npm run bootstrap`.


```sh
npm --prefix .dagger/host run bootstrap
cd .dagger
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
function and the GitHub job. Entrypoints disable per-request deadlines because a single request can
execute a full build; each workflow’s job timeout bounds the overall run. `CI.Runtime.js` only reads the session credentials injected by Dagger;
all pipeline logic stays in PureScript.

The Go image version is read from each project's `go.mod`, as in the original
`setup-go` jobs. Debian-based Go images provide the C compiler used by the race
detector and SQLite. Both services copy `otel/` for their local replace directive.
`DEEZER_SMOKE` stays unset, so the Deezer unit tests don't hit the live API.

The TypeScript module pins Bun 1.4.3 (already used elsewhere in this workflow).
It installs from `sdk/typescript/bun.lock`, outside the root Bun workspace, and
keeps host `node_modules`, build output, and environment files out of its container.
Go module/build caches and the Bun download cache are Dagger cache volumes. They
persist with a local engine. Hosted Linux runners restore and save selected
volumes with the shared GitHub Actions cache wrapper described below.

The CLI function includes Node 24 for its `tsx` runner. It installs the CLI as a
standalone package using its own manifest and historical lockfile, retaining the
original non-frozen `bun install`. Its SDK dependency resolves from the registry.

The Rust module uses `rust:bookworm`, following stable Rust like the original
workflow. Cargo registry, Git, and per-project target directories use Dagger
caches. `tracklist` installs the original native build prerequisites, checks
`cargo fmt --all --check`, and runs `cargo test -p rocksky-tracklist`. Dagger starts
Redis 7 as a service, waits for its exposed port, and makes it available at
`redis://redis:6379`; no host Redis installation or port mapping is needed.

`rust matching` invokes Cargo directly from PureScript with release mode,
the committed Cargo lockfile, and two build jobs. Its tests use
SQLite and local mock providers; no external service is required.

`elixir remote-ws` pins Elixir 1.18.4 / OTP 27, installs Hex and Rebar, and runs
`mix deps.get` followed by `mix test`. Hex downloads, dependencies, and build
output use cache volumes; host `deps/` and `_build/` are excluded. The project's
`config/test.exs` disables external Redis, PostgreSQL, and NATS connections.

`typescript api-contracts` uses Node 24 and Bun 1.4.3, performs the root
`bun install --frozen-lockfile --ignore-scripts`, and preserves every original
audit/test command. Dagger manages an ephemeral PostgreSQL 16 service and exposes
its test-only database URL to the query tests. No production credentials are
needed. Git metadata, Dagger files, host dependencies, Rust targets, and `.env`
files are excluded from the container. Workspace manifests and patches also
trigger this job, since they affect the frozen install.

`rust submissions` runs the dashboard's frozen Bun install, tests, and
`check:dist`, then preserves the PostgreSQL/SQLite feature matrix, Jetstream
ingestion tests, default worker build, and Python HTTP/crash-recovery checks.
Node 24, Bun 1.4.3, Python, and the PostgreSQL client run inside the Rust container.
Dagger provides a fresh PostgreSQL 16 service with a `submissions_test` database.
Database environment variables are scoped to the same commands as the old workflow.

The dashboard check creates a temporary Git index containing the input `dist/`
files before rebuilding. The existing `check:dist` script then detects changed,
deleted, or newly generated assets without needing host Git metadata. In CI the
input is the checked-out commit; locally it is the supplied working tree snapshot.

`rust riff` takes only `riff/`, which is a standalone Cargo workspace. PureScript
verifies the pinned static DuckDB archive, merges its libraries, runs formatting,
Clippy and release tests, and generates fixtures. The HTTP smoke test runs the
binary as a Dagger service and checks health, the home page, track search, album
contents and audio features. Service cleanup runs on success and failure.

`rust production-binaries` builds locked Linux amd64 `rockskyd` and
`rocksky-submissions` executables and returns a directory for artifact export.
`rust rockskyd` retains its single-file interface. Both use the existing DuckDB
1.4.0 shared-library setup and the production target cache.

Production deployment is implemented in PureScript: `ops/src/Production.purs`
defines service units and change filters, `Deploy.purs` controls ordering and
recovery, and `SSH.purs` provides command execution and artifact transfer.
The workflow compiles and tests this logic without connecting to production.
`ops deploy` takes `artifacts`, a base64 `private-key` secret, `run-id`, a full
`commit` SHA, and `services` as a JSON array of inventory group names.
The default SSH destination is defined once in `SSH.purs`. Override it with
`--host user@hostname` and the matching `--known-hosts` entry. GitHub Actions
reads these from `ROCKSKY_DEPLOY_HOST` and `ROCKSKY_DEPLOY_KNOWN_HOSTS` repository
variables; empty values use the audited defaults. Host overrides require an
explicit host-key entry, and strict host verification remains enabled.

The inventory was audited on 2026-10-27 against `161.97.141.205` and deploys to
`/root/github/rocksky`. APIs, views and feeds use the four Gleam units. Rust
AppView and the retired Rust API/XRPC/feeds units are excluded. The daemon group
covers all eight `rockskyd` consumers plus standalone submissions. Other groups
cover embed, websocket, abuse sweep, MusicBrainz, Deezer, Discogs, Spotify proxy,
Phoenix remote websocket, Riff and Drift.

SSH pins the audited host key. A host lock and workflow concurrency serialize
releases. Deployment refuses tracked local changes and stale commits, checks
out the exact workflow SHA, builds before stopping services, and restarts only
selected units that were already active. Inactive groups are skipped. Failed
binary installation or health checks restore previous executables and restart
the original active units. Source checkout and source builds are not rolled back.
Existing systemd units, their startup hooks, environment and secrets are preserved.
A runner killed mid-deployment leaves `/run/lock/rocksky-ci-deploy` for operator
inspection and recovery before another deployment. No local validation deploys
to production or starts a Dagger engine.

`rust mcp-release` accepts the repository root and a required `target`:
`x86_64-unknown-linux-gnu` or `aarch64-unknown-linux-gnu`. It selects the matching
Linux container platform, strips release symbols, and returns the executable as
a `File`. Other targets fail before constructing a build. The source includes
the MCP package, its local Rust SDK dependency, and Cargo workspace metadata.
Each target has its own build cache. The release matrix keeps native Linux
runners for both architectures; macOS and Windows retain their original native
build steps. Tag selection and archive names are unchanged. Linux packaging and release
uploads use `artifacts` and `github-release`; native-platform packaging/uploads remain on their runners.

## Reusable modules

These modules accept project inputs rather than hardcoding Rocksky paths or
release metadata. Each returns a Dagger object that another module can consume.

| Module path | Functions | Inputs and output |
| --- | --- | --- |
| `github-release` | `ensure`, `upload` | Repository, tag, token and run ID; creates/releases or uploads assets |
| `artifacts` | `archive`, `binary`, `checksums` | Directory or executable; returns assets with SHA-256 sidecars |
| `android-sdk` | `container` | Android/JDK versions; returns a Linux amd64 SDK/NDK/CMake container |
| `eas` | `android`, `toolchain`, `aab`, `apk` | SDK container, pinned EAS version, project source/profile; returns a toolchain or Android artifact |

`ops` retains Rocksky's repository, release titles/notes, project/target checks,
and asset naming. Its existing release functions delegate to `github-release`
and `artifacts` for compatibility. The playerd and MCP Linux workflows now call
`artifacts binary` directly; those workflows plus desktop and bindings call
`github-release upload` directly. Release creation still uses the `ops` metadata
wrapper, which delegates to `github-release ensure`. The small
`ops/src/ReleaseClients.purs` adapters use the SDK's typed selection primitives;
the module dependencies are declared in both the workspace and module manifest.
No generated dependency bindings are needed to compile these adapters.

The build/check modules, deployment, desktop packaging, PostgreSQL publishing,
and Nix jobs still contain project-specific policy. Native macOS/Windows jobs
remain host operations. EAS jobs are new: there was no existing Dagger Android
build job to extract.

### GitHub releases and artifacts

From `.dagger`, examples for a different project:

```sh
./bin/dagger api call -m artifacts binary \
  --binary ../dist/my-cli --executable-name my-cli \
  --name my-cli-v1.2.3-linux-amd64 --output ../release-assets

./bin/dagger api call -m artifacts archive \
  --source ../dist --name my-assets-v1.2.3 --output ../release-assets

./bin/dagger api call -m artifacts checksums \
  --assets ../dist --output ../release-assets

./bin/dagger api call -m github-release ensure \
  --repository owner/project --tag v1.2.3 --commit "$COMMIT" \
  --title 'Project 1.2.3' --notes 'Release notes' \
  --token env://GH_TOKEN --run-id "$RELEASE_RUN"

./bin/dagger api call -m github-release upload \
  --repository owner/project --tag v1.2.3 --assets ../release-assets \
  --token env://GH_TOKEN --run-id "$RELEASE_RUN"
```

Use a unique `run-id` for each attempt (for Actions, run ID plus attempt).
Uploads default to refusing replacement; pass `--clobber` to replace existing
assets. The Rocksky wrapper retains its previous clobber behavior. Upload input
must contain files at the top level, with no `#` labels or newline names.
`ensure` lists releases successfully before deciding whether to create one;
authentication, network, and rate-limit failures propagate instead of being
mistaken for a missing release. Existing releases are left intact.

`archive` takes a basename without `.tar.gz`, sorts archive entries, and fixes
mtime/owner/group metadata. It preserves file modes. `binary` stages its input
with mode 0755 and retains the executable's exact top-level archive name.
`checksums` accepts a flat directory of files without existing `.sha256`
sidecars. Output uses `sha256sum --check` format. Asset basenames accept ASCII
letters, digits, dots, underscores and hyphens; `.` and `..` are rejected.

### Android SDK and local EAS builds

`.github/workflows/android-build.yml` is a manual workflow that calls
`eas android`. Choose AAB or APK, an optional profile override, and an exact
EAS CLI version; configure the repository's `EXPO_TOKEN` secret first. The job
composes `android-sdk container` with `eas toolchain` and uploads the result as
a GitHub Actions artifact. It does not publish to a release or app store.

The same composed function can be called directly from `.dagger`:

```sh
./bin/dagger api call -m eas android --source .. --project-dir apps/app \
  --format aab --eas-version "$EAS_VERSION" --token env://EXPO_TOKEN \
  --run-id "$BUILD_RUN" --output ../dist/app.aab
```


`android-sdk container` defaults to JDK 21 on Ubuntu 24.04, Android platform 36,
build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Each is configurable.
The command-line tools version and its SHA-256 are separate arguments and must
be changed together. The default download/checksum comes from Google's
[command-line tools table](https://developer.android.com/studio#command-tools).
SDK setup accepts the Android SDK licenses through `sdkmanager --licenses`.

The SDK container is deliberately Linux amd64 because the Android Linux build
tools require it; arm64 hosts require engine emulation. `jdk-image` must provide
a Debian/Ubuntu-compatible image with a JDK and `JAVA_HOME`. The module sets
`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `ANDROID_NDK_HOME`, `ANDROID_NDK_ROOT`, and
adds SDK tools to `PATH` while preserving the JDK path.

`eas toolchain` layers Node 22 and Bun 1.4.2 onto an SDK container. Override
`node-image` and `bun-image` as needed. `eas-version` is required so consumers
choose an explicit CLI version. For example, a composed Dagger shell command
from `.dagger` (replace `YOUR_PINNED_EAS_VERSION` and the run ID):

```sh
./bin/dagger -c '
  sdk=$(./android-sdk | container)
  builder=$(./eas | toolchain --sdk=$sdk --eas-version=YOUR_PINNED_EAS_VERSION)
  ./eas | aab --builder=$builder --source=.. --project-dir=apps/app \
    --token=$(secret env://EXPO_TOKEN) --run-id=local-build-001 \
    | export --path=../dist/app.aab
'
```

Use `apk` instead of `aab` and export `app.apk` for the APK profile. `aab`
defaults to `production`, `apk` defaults to `apk`, and both accept `profile`.
The profile in `eas.json` controls the actual format and signing. The job checks
ZIP contents to reject an APK renamed to `.aab` or the reverse. It runs
`eas build --local --non-interactive`; it never submits to a store or uploads a
release. Profiles may still update remote version counters, hence the run ID.

Pass the repository root as `source` for a monorepo and use `project-dir` for
the app directory. The build retains project hooks, including Rocksky's Rust
and native library preparation. The prepared builder may be customized further
with additional packages, environment variables and Dagger secret mounts.
Source excludes host dependencies/build caches, `.env*`, `credentials.json`,
and keystores. Supply secrets on the builder with `withSecretVariable` or
`withMountedSecret`. For local signing, mount `credentials.json` at the app's
`/src/<project-dir>/credentials.json` path and its referenced keystore; select a
profile with `credentialsSource: local` (Rocksky has `production-local`). The
standard `production` profile uses previously configured EAS credentials.

[Expo local build requirements](https://docs.expo.dev/build-reference/local-builds/)
apply: the token must have project access, remote signing credentials must
already exist for noninteractive builds, and secret EAS environment values must
be supplied locally. Local builds use the provided toolchain rather than cloud
`image`/`node`/`ndk` settings from `eas.json`. The EAS module also leaves request deadlines disabled; the Android workflow’s
150-minute job timeout bounds native builds.

### Reuse and verification

The four modules have no Rocksky source dependency. Install their module paths
as clients in another Dagger workspace, keeping the repository's vendored
PureScript SDK available as their runtime. Pin a repository commit when using
remote module references. Compose `Container`, `Directory`, and `File` results
instead of exporting and importing intermediate artifacts.

The committed core SDK bindings are shared with the existing modules and
copied unchanged. After changing module dependency schemas, `generate.py`
includes all nine modules. Compilation and mocked API tests require no engine:

```sh
# Run spago build in each of artifacts, github-release, android-sdk, eas and ops.
node --test --test-concurrency=1 .dagger/tests/reusable-modules.test.mjs .dagger/tests/transport.test.mjs
```

The reusable-module tests cover release API failure handling, existing releases,
archive normalization, invalid inputs, Android toolchain configuration, EAS
artifact validation and the compatibility adapters. They do not execute builds,
publish assets, or contact GitHub/Expo.

## Releases and operations

Linux playerd releases retain the default build, both playback test commands,
and the ignored MPRIS tests under `dbus-run-session`. PureScript builds and stages
the binding libraries with their original artifact names. Both architectures
use matching Linux containers on their native GitHub runners.

The desktop container preserves Ubuntu 22.04, Bun 1.4.3, the production build
mode, optional KLIPY override, version stamping, portable AppImage preparation,
permissions/dependency/startup checks, bundle names, and checksums. `Desktop.purs`
owns dependency installation, verified launcher preparation, configuration, build
sequencing and packaging. The existing Python AppImage validators remain tests.

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
cached side effect. Deployment decodes the base64 SSH key inside an ephemeral
Dagger container; it is never exported to the workflow workspace.

## Platform-specific steps retained

- macOS and Windows native builds, packaging, and uploads run on their original runners.
- BSD binding builds retain the best-effort virtual-machine action; the Linux
  outer runner uploads the resulting artifacts through Dagger.
- macOS desktop signing/DMG creation and macOS Nix/Cachix setup stay native.
- FlakeHub keeps its dedicated GitHub OIDC publishing action.
- Matrices, checkout and artifact downloads remain workflow glue. Tag resolution,
  native packaging, checksums, uploads and CLI installation live in `host/src/`.
  Its JavaScript FFI exposes only filesystem, process, environment and hashing primitives.

## Transport and validation

The vendored HTTP transport uses Node's native HTTP client so a long build can
wait for headers without a default deadline. An explicit positive `timeoutMs`
still bounds both headers and body; `0` disables the deadline, and cancellation
still closes the request. Node `fetch` previously
imposed a separate five-minute headers timeout. The patch is present in every
committed module SDK and in the vendored source used by regeneration.

```sh
node --test .dagger/tests/transport.test.mjs # from the repository root
```

PureScript compilation, host archive/tag/checksum tests, mocked deployment tests,
transport tests and workflow validation run without a Dagger engine. Full build, service, publishing, and
deployment execution is left to CI unless explicitly requested.

## SDK and generated bindings

Module compilation and codegen mount Spago's shared cache with `LOCKED` sharing
so dependency modules cannot mutate its registry checkouts/database concurrently.
Before compilation, the SDK initializes missing or incomplete registry checkouts
with up to three clone attempts. Git errors remain visible; failed initialization
stops before Spago tries to read a missing package-set directory. Healthy caches
and downloaded packages are retained. Test this bootstrap without an engine:

```sh
node --test .dagger/tests/spago-cache.test.mjs
```


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

## CI without shell scripts

There are no shell-script entry points under `.dagger/` and Dagger modules do not
invoke project shell scripts. `setup-dagger` compiles and tests the runner-side
PureScript module, then verifies and installs the CLI. Native release workflows
invoke that module directly. Shells in Actions only launch commands; conditionals,
loops, release metadata, dependency preparation and recovery live in PureScript.
The production SSH transport uses a quoted login-shell command to obtain the
host's toolchain environment; it does not generate or upload a shell script.

For local checks, run `npm test` in `.dagger/host` after compiling it, and run
`node --input-type=module -e 'import { main } from "./output/Test.Deploy/index.js"; main();'`
in `.dagger/ops` after `npm run build`. These checks do not publish or deploy.
