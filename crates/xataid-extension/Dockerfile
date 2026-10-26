FROM rust:1.96.0-bookworm AS builder

# Keep cargo-pgrx aligned with pgrx and pgrx-tests in Cargo.toml.
ARG PGRX_VERSION=0.15.0

RUN apt-get update && apt-get install -y --no-install-recommends \
  libreadline-dev \
  pkg-config \
  flex \
  bison \
  build-essential \
  libclang-dev \
  postgresql-server-dev-15 \
  && rm -rf /var/lib/apt/lists/*

RUN cargo install --locked --version "${PGRX_VERSION}" cargo-pgrx

# Use the system PostgreSQL 15 headers instead of building every supported major.
RUN cargo pgrx init --pg15 /usr/lib/postgresql/15/bin/pg_config --no-run

WORKDIR /app
COPY . .

RUN cargo pgrx package \
  --pg-config /usr/lib/postgresql/15/bin/pg_config \
  --no-default-features --features pg15 \
  --out-dir /out

FROM postgres:15-bookworm

COPY --from=builder /out/usr/lib/postgresql/15/lib/xataid_extension.so /usr/lib/postgresql/15/lib/xataid_extension.so
COPY --from=builder /out/usr/share/postgresql/15/extension/ /usr/share/postgresql/15/extension/
COPY sql/setup.sql /docker-entrypoint-initdb.d/
