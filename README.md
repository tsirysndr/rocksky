# Rocksky

A decentralized music tracking and discovery platform built on the AT Protocol 🎵

## Prerequisites

- Node.js (v22 or later)
- Rust
- Turbo
- Docker

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
   ```
3. Run the database migrations:
   ```bash
   turbo db:migrate --filter=@rocksky/api
   ```
4. Start the development server:
   ```bash
   turbo dev --filter=@rocksky/api --filter=@rocksky/web
   ```
