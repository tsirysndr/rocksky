# Rocksky CI in PureScript with FluentCI

`fluentci.toml` registers eleven PureScript Wasm modules. All functions from the
nine portable Dagger CI modules are ported, along with the host release helpers.
`main.checks` replaces the initialized greeting and runs all portable test jobs.
`main.build` builds the production daemon and submissions worker.

| Module | Exported jobs |
| --- | --- |
| `main` | `checks`, `build` |
| `go` | `sdk`, `deezer`, `musicbrainz` |
| `typescript` | `sdk`, `cli`, `apiContracts` |
| `rust` | `sdk`, `tracklist`, `matching`, `submissions`, `riff`, `productionBinaries`, `rockskyd`, `mcpRelease`, `playerdRelease`, `bindingsRelease` |
| `elixir` | `remoteWs` |
| `ops` | `publishPostgres`, `uploadRelease`, `ensureRelease`, `packageRelease`, `desktopRelease`, `deploy`, `nixBuild` |
| `artifacts` | `archive`, `binary`, `checksums` |
| `github-release` | `upload`, `ensure` |
| `android-sdk` | `container` |
| `eas` | `android`, `toolchain`, `aab`, `apk` |
| `host` | `installDagger`, `resolveTag`, `bindings`, `packageNative`, `upload`, `stampDesktop`, `buildDesktop`, `packageDesktop`, `validate`, `productionFilters`, `buildMcp`, `buildPlayerd`, `prepareDesktop`, `nixBuild`, `flakehubPublish` |

## Run

Install FluentCI, Node/npm, PureScript, Spago, Extism's `extism-js`, Docker, and
rsync. Start Docker before calling a portable CI job. FluentCI installs each
module's npm build dependencies and builds its Wasm plugin automatically.
Run commands from the repository root. Cross-architecture images require Docker
emulation or a runner matching the requested platform; PostgreSQL publishing
requires a Docker Buildx builder supporting both Linux architectures.

```sh
# Build every module and list its real Wasm exports.
fluentci modules --json

# The default pipeline runs the portable tests.
fluentci run
# Equivalent explicit entry point:
fluentci run main checks

# Individual checks retain the original source-directory inputs.
fluentci run go sdk '{"source":"sdk/go"}'
fluentci run go deezer '{"source":"deezer","otel":"otel"}'
fluentci run typescript apiContracts '{"source":"."}'
fluentci run rust matching '{"source":"."}'
fluentci run elixir remoteWs '{"source":"remote-ws"}'

# Build and export production artifacts.
fluentci run main build '{"source":".","output":"dist/production"}'
fluentci run rust mcpRelease '{"source":".","target":"x86_64-unknown-linux-gnu","output":"dist/rocksky-mcp"}'

# Reusable deterministic packaging and checksums.
fluentci run artifacts binary '{"binary":"dist/rocksky-mcp","executableName":"rocksky-mcp","name":"rocksky-mcp-v1.0.0-linux-amd64","output":"dist/assets"}'
```

Functions accept one JSON object, using the same **camelCase** field names as
their PureScript argument records. Required fields and defaults are defined in
`shared/src/Rocksky/CI/<Module>.purs`. Directory and file inputs are host paths,
resolved relative to the invocation directory. File/directory results are copied
to `output`, or `dist/fluentci/<function>` when omitted. Each invocation owns an
isolated Docker network and temporary directory. Its containers, temporary
images, network, registry credentials, and staging files are cleaned up on normal
success or failure. Named Docker cache volumes persist across invocations.

Release, registry, SSH, and EAS secrets use environment references, for example
`"token":"env://GH_TOKEN"`, `"privateKey":"env://SSH_KEY"`, or
`"klipyKey":"env://KLIPY_API_KEY"`. The engine resolves these into secret handles;
secret values are never embedded in Docker command arguments. `privateKey` retains
the original base64 SSH-key format. Deployment preserves strict host-key checking,
commit validation, the active-service inventory, host locking, build ordering,
binary backups, and rollback. Host overrides still require matching `knownHosts`.
Supply a distinct `runId` for release, deployment, Nix, and EAS invocations.

## Android composition

Container results are reusable, tagged local Docker images. `output` selects the
image name, defaulting to `rocksky-fluentci/<function>:local`. Toolchain environment
variables and the working directory are preserved in the returned image. Pass
that image reference as the next function's `sdk` or `builder` argument:

```sh
fluentci run android-sdk container '{"output":"rocksky-ci/android-sdk:local"}'
fluentci run eas toolchain '{"sdk":"rocksky-ci/android-sdk:local","easVersion":"YOUR_EXACT_EAS_VERSION","output":"rocksky-ci/android-builder:local"}'
fluentci run eas aab '{"builder":"rocksky-ci/android-builder:local","source":".","projectDir":"apps/app","token":"env://EXPO_TOKEN","runId":"local-001","output":"dist/app.aab"}'
```

`eas.android` also composes SDK preparation and the pinned EAS toolchain in one
call. It requires `source`, `easVersion`, `token`, and `runId`; `format` defaults
to `aab`. It retains the original Android/JDK/NDK defaults, verified command-line
tools download, source exclusions, and AAB/APK content verification.

## Implementation and checks

`shared/src/Rocksky/CI/` contains the ported pipeline decisions. `shared/src/CI/`
provides typed argument decoding, artifact exports, and a PureScript Docker
executor built on `FluentCI.Plugin`. The guest uses synchronous `Effect` calls,
with literal argv, explicit stdin, private service DNS/readiness checks, and
immutable filesystem snapshots. It does not import Dagger's runtime or Node's
APIs. The host release utilities invoke native Node processes for portable OS
primitives; their release policy remains PureScript. Command exit codes and
stdout travel in a JSON envelope, preserving exact output and allowing
PureScript rollback to catch failures instead of a host-call trap. `host.installDagger` is
retained solely as the original optional bootstrap utility; no FluentCI CI job
calls it or requires Dagger.

`shared/empty-host-response.mjs` applies a narrowly checked bundling fix to the
pinned SDK's transport: Extism's offset zero represents a successful empty string.
Other missing imports and host failures retain their error handling. Review this
fix when updating the pinned SDK.

After `fluentci modules --json` builds the modules:

```sh
node --test .fluentci/tests/port.test.mjs
# Optional Docker integration checks: snapshots, argv/stdin, Redis, PostgreSQL.
node .fluentci/tests/docker.mjs
```

The behavioral tests cover deployment failures and rollback, native release tags,
archive contents and checksums, export parity, and the default pipeline. The
Docker checks use temporary containers/networks and do not access production.
Every GitHub Actions workflow now calls the FluentCI modules. The reusable
`fluentci-modules.yml` job sets up the CLI with
`fluentci-io/setup-fluentci@next`, compiles all Wasm modules
once, validates orchestration, and uploads the portable plugins. Other jobs
install the same pinned CLI and download those plugins, so native and BSD runners
do not need PureScript compilers. The original triggers, target architectures,
artifact names, deployment gates, and disabled PostgreSQL publishing remain.
The desktop job uses an Ubuntu 24.04 host for the released CLI; its actual Linux
bundles still build in the existing Ubuntu 22.04 container. The FreeBSD VM uses
14.3, matching the CLI release baseline.

`.github/actions/fluentci` invokes compiled modules with JSON arguments. Its
argument expansion resolves environment references as data, without shell
interpolation. The shared setup uses the official
`fluentci-io/setup-fluentci@next` action in install-only mode, with
`version: '2026.11.04'`, before installing source-build tools. The
checksum-verifying `.github/scripts/install-fluentci.sh` is retained for WSL
and BSD VM guests, where a GitHub JavaScript action cannot install the guest CLI.

Windows MCP releases run the Linux CLI under WSL and use native Windows Node,
Cargo, tar, and GitHub CLI through the host module. The native Windows search
path is forwarded explicitly. BSD builds install the CLI with curl inside their
VM and use the same compiled host module. Native macOS builds, desktop
preparation and signing, and Nix builds also enter through host module exports.
The FlakeHub export runs the pinned official publisher to preserve its OIDC,
rolling-version, and output-path behavior.

Run the workflow regression checks with:

```sh
node --test .fluentci/tests/workflows.test.mjs
```

Legacy Dagger sources remain available for reference; workflows no longer use
them.
