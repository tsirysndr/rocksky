# Rocksky

[![ci](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml/badge.svg)](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml)

A decentralized music tracking and discovery platform built on the AT Protocol 🎵

## Prerequisites

- Node.js (v22 or later)
- Rust
- Turbo
- Docker
- Wasm Pack https://rustwasm.github.io/wasm-pack/installer/
- DuckDB https://duckdb.org/docs/installation

## Getting Started

1. Clone the repository:
  ```bash
   git clone https://github.com/tsirysndr/rocksky
   cd rocksky
  ```
2. Install dependencies:
   ```bash
   npm install -g turbo
   bun install
   bun run build:raichu
   ```
3. Set up the environment variables:
  ```bash
    cp apps/api/.env.example apps/api/.env
  ```
4. Start the Docker containers:
   ```bash
   docker compose up
   ```
5. Run the database migrations:
   ```bash
   turbo db:migrate --filter=@rocksky/api
   ```
6. Start Analytics API:
   ```bash
   turbo dev:analytics
   ```
7. Start the development server:
   ```bash
   turbo dev --filter=@rocksky/api --filter=@rocksky/web
   ```
