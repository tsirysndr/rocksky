FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/spotify ./crates/spotify
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p spotify

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/spotify /usr/local/bin/spotify

CMD ["spotify"]
