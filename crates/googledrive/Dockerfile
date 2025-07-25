FROM rust:1.88-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libssl-dev \
  pkg-config \
  build-essential


WORKDIR /app

COPY ./crates/googledrive ./crates/googledrive
COPY Cargo.toml .
COPY Cargo.lock .

RUN cargo build --release -p googledrive

FROM debian:bookworm-slim

COPY --from=builder /app/target/release/googledrive /usr/local/bin/googledrive

EXPOSE 7880

CMD ["googledrive"]
