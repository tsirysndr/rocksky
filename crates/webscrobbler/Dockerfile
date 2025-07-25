FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/webscrobbler ./crates/webscrobbler
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p webscrobbler

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/webscrobbler /usr/local/bin/webscrobbler

EXPOSE 7883

CMD ["webscrobbler"]
