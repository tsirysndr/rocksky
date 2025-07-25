FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  curl \
  wget \
  unzip \
  libssl-dev \
  pkg-config \
  build-essential \
  cmake

RUN wget https://github.com/duckdb/duckdb/releases/download/v1.3.2/libduckdb-linux-amd64.zip && \
  unzip libduckdb-linux-amd64.zip && \
  mv libduckdb.so /usr/lib && \
  mv libduckdb_static.a /usr/lib && \
  mv duckdb.h /usr/include && \
  mv duckdb.hpp /usr/include

WORKDIR /app

COPY ./crates/analytics ./crates/analytics
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p analytics

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/analytics /usr/local/bin/analytics

COPY --from=builder /usr/lib/libduckdb.so /usr/lib/libduckdb.so

EXPOSE 7879

CMD ["analytics"]
