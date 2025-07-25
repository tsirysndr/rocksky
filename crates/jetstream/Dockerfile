FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/jetstream ./crates/jetstream
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p jetstream

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/jetstream /usr/local/bin/jetstream

EXPOSE 7880

CMD ["jetstream"]
