# The self-hosted Rocksky AppView: one binary, with the web UI inside it.
#
# Built from the repository root, because the Rust workspace and the web app are
# both part of it:
#
#   docker build -f crates/appview/Dockerfile -t rocksky-appview .
#
# Or, with the rest of the stack:
#
#   docker compose -f crates/appview/docker-compose.yml up --build
#
# Needs BuildKit for the cache mounts below, which every current Docker has on
# by default. Without it, set DOCKER_BUILDKIT=1.

# ---------------------------------------------------------------- the web UI
#
# First, so a change to the Rust sources does not invalidate it — the UI build
# is the slow half and it changes far less often than the API.
FROM oven/bun:1 AS web

WORKDIR /src

# Manifests before sources, so `bun install` is cached until a dependency
# actually changes.
#
# `sdk/typescript` is here because `apps/web` depends on it as a workspace, and
# bun refuses to install a lockfile whose workspace graph is incomplete —
# leaving it out fails with "listed in bun.lock but not on disk". The other
# workspaces in the repository are not needed: nothing the web app imports
# reaches them.
COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/
COPY sdk/typescript/package.json sdk/typescript/
RUN bun install --frozen-lockfile

COPY sdk/typescript sdk/typescript
COPY apps/web apps/web

# The SDK first: `@rocksky/sdk` resolves to `dist/index.js`, which does not
# exist in a fresh checkout, so the web build would fail to resolve the import.
RUN cd sdk/typescript && bun run build
RUN cd apps/web && bun run build

# ----------------------------------------------------------------- the binary
FROM rust:1.89-bookworm AS build

# Nothing here links a system library: every TLS path in this crate is rustls,
# the S3 client is `rust-s3` with rustls, and the audio and analysis crates are
# pure Rust. So there is no apt layer — a "just in case" one would only be a
# slower build and a larger attack surface.

WORKDIR /src

# The whole workspace, because `members = ["crates/*"]` has to resolve before
# cargo will build any one package. Only `rocksky-appview`'s dependency graph
# is actually compiled.
COPY Cargo.toml Cargo.lock ./
COPY crates crates

# The UI, where `crates/appview/build.rs` looks for it. Without this the binary
# still builds and serves the API — the build script warns and the asset table
# is empty — so this COPY is what makes it a complete instance rather than a
# headless one.
COPY --from=web /src/apps/web/dist /src/apps/web/dist
ENV ROCKSKY_WEB_DIST=/src/apps/web/dist

# The cache mounts make a rebuild after a one-line change take seconds instead
# of recompiling every dependency. They are also why the binary is copied out
# in the same layer: a mounted target directory does not persist into the image.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/src/target,sharing=locked \
    cargo build --release -p rocksky-appview && \
    cp target/release/rocksky-appview /usr/local/bin/rocksky-appview

# ----------------------------------------------------------------- the runtime
FROM debian:bookworm-slim

# `ca-certificates` is the one real requirement: resolving a DID, reading a PDS
# and calling Spotify are all HTTPS, and rustls verifies against the system
# roots. Without it every outbound request fails with an opaque certificate
# error.
#
# `curl` is here only for the healthcheck below. Worth the two megabytes: the
# alternative is a check that does not actually reach the server.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Not root. The only thing the process writes is its data directory, which is a
# volume owned by this user.
RUN useradd --system --create-home --uid 10001 rocksky

COPY --from=build /usr/local/bin/rocksky-appview /usr/local/bin/rocksky-appview

# Databases, the signing key and config.toml. A volume, because losing it logs
# every user out — the OAuth sessions live here.
ENV ROCKSKY_DATA_DIR=/data
RUN mkdir -p /data && chown rocksky:rocksky /data
VOLUME ["/data"]

USER rocksky
EXPOSE 3004

# `/healthz` runs a query rather than just answering, so this reports unhealthy
# when the database is gone instead of healthy while every real request fails.
#
# The start period is generous because a first boot creates the search
# collections and fills them from the database, and on a restored database that
# is not instant.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3004/healthz || exit 1

CMD ["rocksky-appview"]
