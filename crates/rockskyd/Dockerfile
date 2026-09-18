# The Rocksky daemon: one image, every music service.
#
#   docker build -f crates/rockskyd/Dockerfile -t rocksky-services .
#
# Built from the repository root, because the crate is part of the workspace.
# Needs BuildKit for the cache mounts, which every current Docker has on.
#
# # Why one image and not six
#
# `rockskyd` is a single binary with a subcommand per service — `rockskyd
# navidrome`, `rockskyd spotify`, and so on — so the six per-service
# Dockerfiles in this repository differ only in their `CMD`. Each of them
# compiles the whole workspace, which means six identical builds to start one
# stack.
#
# This is that build, once. The entrypoint is the binary and the subcommand is
# the container's `command`, so `compose.yml` runs six services off one image.
# The older per-crate Dockerfiles still work and are still what the hosted
# deployment uses; nothing here replaces them.
#
# # Sharing the appview's data directory
#
# These services join a `rocksky-appview` instance through `/data`: the SQLite
# database when there is no Postgres, and the secrets in
# `rocksky_db::keys` either way. So this image runs as *the same uid as the
# appview image* — 10001. A different uid cannot write the database file and
# cannot read `jwt.secret` (mode 0600), which presents as a Subsonic client
# being told its password is wrong.

FROM rust:1.98-trixie AS build

# DuckDB, for `rocksky-playlists` — in this binary's dependency graph via the
# `playlists` subcommand, so it links whether or not that service is run.
#
# The prebuilt library rather than the crate's `bundled` feature: bundling
# compiles DuckDB's amalgamation, which is many minutes and several gigabytes
# of RAM per build.
ARG TARGETARCH
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*
# `TARGETARCH` is `amd64` or `arm64`, which are exactly DuckDB's asset names —
# so this builds on an Apple Silicon machine as well as on a CI runner.
RUN curl -fsSLO "https://github.com/duckdb/duckdb/releases/download/v1.3.2/libduckdb-linux-${TARGETARCH}.zip" \
 && unzip -q "libduckdb-linux-${TARGETARCH}.zip" \
 && mv libduckdb.so /usr/lib/ \
 && mv duckdb.h duckdb.hpp /usr/include/ \
 && rm -f "libduckdb-linux-${TARGETARCH}.zip" libduckdb_static.a

WORKDIR /src

# The whole workspace, because `members = ["crates/*"]` has to resolve before
# cargo will build any one package. Only `rockskyd`'s graph is compiled.
COPY Cargo.toml Cargo.lock ./
COPY crates crates

# The binary is copied out in the same layer as the build: a mounted target
# directory does not persist into the image.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/src/target,sharing=locked \
    cargo build --release -p rockskyd && \
    cp target/release/rockskyd /usr/local/bin/rockskyd

FROM debian:trixie-slim

# `ca-certificates` is the real requirement: resolving a DID, reading a PDS and
# calling Spotify, Deezer, Last.fm and MusicBrainz are all HTTPS, and rustls
# verifies against the system roots. Without it every outbound request fails
# with an opaque certificate error.
#
# `curl` is for `docker exec` debugging only. None of these services serves a
# health route, so there is no HEALTHCHECK below to justify it — see the note
# at the bottom.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/lib/libduckdb.so /usr/lib/libduckdb.so
COPY --from=build /usr/local/bin/rockskyd /usr/local/bin/rockskyd

# The same uid as `crates/appview/Dockerfile`, deliberately: see the header.
RUN useradd --system --create-home --uid 10001 rocksky

# Where the shared database and the shared secrets are. Not a VOLUME: this
# image mounts the *appview's* volume rather than owning one, and declaring it
# here would give a service started on its own an anonymous volume and an empty
# library.
ENV ROCKSKY_DATA_DIR=/data
RUN mkdir -p /data && chown rocksky:rocksky /data

USER rocksky

# Documentation only — `compose.yml` publishes what it needs. Subsonic (4533)
# and Jellyfin (8096) keep the ports their clients expect by default; the two
# scrobble endpoints are Rocksky's own.
EXPOSE 4533 7882 7883 8096

# No HEALTHCHECK: none of these services serves a health route, and a check
# that only proves the port is open would report a service healthy while every
# request it answers fails. `compose.yml` therefore depends on them by
# `service_started`.

ENTRYPOINT ["rockskyd"]
# Overridden per service in `compose.yml`. Alone, this prints the help.
CMD ["--help"]
