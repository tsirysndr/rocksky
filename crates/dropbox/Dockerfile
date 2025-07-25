FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/dropbox ./crates/dropbox
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p dropbox

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/dropbox /usr/local/bin/dropbox

EXPOSE 7881

CMD ["dropbox"]
