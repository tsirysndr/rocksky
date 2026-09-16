# The Rocksky feed generator.
#
#   docker build -f crates/feeds/Dockerfile -t rocksky-feeds .
#
# Built from the repository root, because the crate is part of the workspace.
# Needs BuildKit for the cache mounts, which every current Docker has on.

FROM rust:1.89-bookworm AS build

# No apt layer: nothing here links a system library — the TLS is rustls and
# there is no web UI to build, unlike the appview image.

WORKDIR /src

# The whole workspace, because `members = ["crates/*"]` has to resolve before
# cargo will build any one package. Only `rocksky-feeds` is compiled.
COPY Cargo.toml Cargo.lock ./
COPY crates crates

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/src/target,sharing=locked \
    cargo build --release -p rocksky-feeds && \
    cp target/release/rocksky-feeds /usr/local/bin/rocksky-feeds

FROM debian:bookworm-slim

# `ca-certificates` because the database connection is TLS in every hosted
# setup, and rustls verifies against the system roots. `curl` for the
# healthcheck below.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Not root. This service writes nothing at all — it only reads the database —
# so it needs no volume and no writable directory.
RUN useradd --system --create-home --uid 10002 feeds

COPY --from=build /usr/local/bin/rocksky-feeds /usr/local/bin/rocksky-feeds

USER feeds
EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8002/xrpc/_health || exit 1

CMD ["rocksky-feeds"]
