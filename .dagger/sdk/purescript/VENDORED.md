# Vendored PureScript Dagger SDK

Source: https://github.com/tsirysndr/dagger-sdk/tree/156eb76/purescript
Commit: 156eb76d1c67e4f39d9bdbae28c76631ffe9c056 (Dagger v1.0.0-beta.21 migration).

The SDK is not published yet. This snapshot makes CI independent of a sibling
checkout or an unpublished remote commit. Tests are omitted. Keep LICENSE,
NOTICE, and schema/LICENSE with redistributions. Bootstrap Go bindings are
committed because beta module execution does not generate them automatically.

To update, copy the tracked purescript directory from a reviewed upstream
commit, excluding test/, then run `python3 .dagger/generate.py` at the Rocksky root.

Local patch: `src/Dagger/Internal/Runtime.js` uses Node's HTTP transport instead
of fetch so the configured deadline also governs delayed response headers.
Regression coverage: `.dagger/tests/transport.test.mjs`. Preserve this patch
when refreshing the vendored SDK until it is incorporated upstream.

Local patch: `runtime/main.go` uses `node:24-bookworm-slim` for the module
runtime, matching the CI containers. Preserve this when refreshing the SDK.

Local patch: `runtime/main.go` mounts Spago's global cache with LOCKED sharing
in both runtime and codegen paths. `scripts/prepare-spago-cache.mjs` initializes
missing/incomplete registry checkouts before compilation, retries failed clones
up to three times, and retains Git's stderr. Spago builds use verbose output.
This prevents concurrent module dependencies from racing on registry clones or
the registry database. Preserve both files when refreshing the SDK.
Regression coverage: `.dagger/tests/spago-cache.test.mjs` (no engine/network).
