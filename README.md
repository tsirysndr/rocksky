# Rocksky

[![ci](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml/badge.svg)](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml)
[![discord](https://img.shields.io/discord/1103720908104929321?label=discord&logo=discord&color=5865F2)](https://discord.gg/EVcBy2fVa3)

A decentralized music tracking and discovery platform built on the AT Protocol 🎵

## 📦 Prerequisites

- Node.js (v22 or later)
- Rust
- Turbo
- Docker
- Wasm Pack https://rustwasm.github.io/wasm-pack/installer/
- DuckDB https://duckdb.org/docs/installation

## 🚀 Getting Started

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
    cp .env.example .env
    # Edit the .env files to add your configurations
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
7. Start jetstream:
   ```bash
   turbo dev:jetstream
   ```
8. Start the development server:
   ```bash
   turbo dev --filter=@rocksky/api --filter=@rocksky/web
   ```

## 📚 Documentation
[View the full documentation](https://docs.rocksky.app)

## ✍️ Feedback
This repository is the central place to collect feedback and issues related to [Rocksky](https://rocksky.app).

Please [**open an issue**](https://github.com/tsirysndr/rocksky/issues/new) if you want to leave feedback. Feel free to also join our [**Discord server**](https://discord.gg/EVcBy2fVa3)

## 🤝 Contributing
We would love to hear your feedback or suggestions. The best way to reach us is on [Discord](https://discord.gg/EVcBy2fVa3).

We also welcome pull requests into this repo. See [CONTRIBUTING.md](CONTRIBUTING.md)  for information on setting up this repo locally.