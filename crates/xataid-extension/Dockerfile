FROM rust:1.89-bookworm AS builder

RUN apt-get update && apt-get install -y \
  libreadline-dev \
  pkg-config \
  flex \
  bison \
  build-essential

RUN cargo install --locked cargo-pgrx

RUN cargo pgrx init

RUN apt-get install -y libclang-dev

WORKDIR /app

COPY . .

RUN cargo pgrx package

FROM postgres:15

COPY --from=builder /app/target/release/xataid_extension-pg15/usr/lib/postgresql/15/lib/xataid_extension.so /usr/lib/postgresql/15/lib/xataid_extension.so

COPY --from=builder /app/target/release/xataid_extension-pg15/usr/share/postgresql/15/extension/xataid_extension--0.0.0.sql /usr/share/postgresql/15/extension/xataid_extension--0.0.0.sql

COPY --from=builder /app/target/release/xataid_extension-pg15/usr/share/postgresql/15/extension/xataid_extension.control /usr/share/postgresql/15/extension/xataid_extension.control

COPY sql/setup.sql /docker-entrypoint-initdb.d/
