FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/scrobbler ./crates/scrobbler
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p scrobbler

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/scrobbler /usr/local/bin/scrobbler

EXPOSE 7882

CMD ["scrobbler"]
