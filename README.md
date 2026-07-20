# Rocksky 

[![ci](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml/badge.svg)](https://github.com/tsirysndr/rocksky/actions/workflows/ci.yml)
[![build](https://github.com/tsirysndr/rocksky/actions/workflows/build.yml/badge.svg)](https://github.com/tsirysndr/rocksky/actions/workflows/build.yml)
[![discord](https://img.shields.io/discord/1103720908104929321?label=discord&logo=discord&color=5865F2)](https://discord.gg/EVcBy2fVa3)
[![FlakeHub](https://img.shields.io/endpoint?url=https://flakehub.com/f/tsirysndr/rocksky/badge)](https://flakehub.com/flake/tsirysndr/rocksky)

**A decentralized, open-source Last.fm alternative built on the AT Protocol (Bluesky).**

Rocksky automatically tracks ("scrobbles") the music you listen to from Spotify, Jellyfin, Navidrome, browsers, Android, and more — then publishes it to your decentralized identity. Own your listening history, see what friends are playing in real time, get rich stats, and discover new music — all without a central company controlling your data.

**[rocksky.app](https://rocksky.app)** • **[Docs](https://docs.rocksky.app)** • **[Discord](https://discord.gg/EVcBy2fVa3)**

![Preview](./.github/assets/preview.png)

## ✨ Key Features

### 🎵 Scrobbling
- **Last.fm Compatible API** – Works with almost any existing Last.fm scrobbler
- **ListenBrainz Compatible API** – Broad client support
- Automatic Last.fm mirroring (future scrobbles)

### 🕒 Playback & History
- Recently Played Timeline
- **Stories View** – See what others are listening to live
- Daily/weekly stats and visualizations

### 📊 Insights
- Top Artists, Tracks, and Albums
- Personalized charts
- Shoutbox & Likes for community interaction

### 🌐 Integrations
- **Spotify** – Direct "now playing" detection
- **Jellyfin** – Media server scrobbling
- **Pano Scrobbler** (Android/Linux/Windows)
- **WebScrobbler** (browser)
- More coming soon

### 🔍 Search
- Blazing-fast search powered by Typesense

## 🚧 Roadmap

- Webhooks (Discord, custom integrations)
- Personalized discovery feeds
- Rocksky Connect (remote playback across devices)
- Multi-source library support (S3, Google Drive, etc.)
- Built-in streaming + self-uploaded music
- Extensions system
- Cross-device settings sync

## Quick Start (for users)

1. Go to **[rocksky.app](https://rocksky.app)** and sign in with your Bluesky account
2. Connect your music apps (Spotify, Jellyfin, etc.)
3. Start scrobbling — your data stays under your control

**Self-hosting** and advanced usage instructions are below.

## 🚀 Self-Hosting / Development

### Prerequisites
- Node.js (v22+)
- Bun
- Docker + Docker Compose
- Rust (for some crates)
- Deno, Go, Turbo, Wasm Pack (see full docs)

### Getting Started

```bash
# 1. Clone the repo
git clone https://github.com/tsirysndr/rocksky.git
cd rocksky

# 2. Install dependencies
npm install -g turbo
bun install

# 3. Environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/feeds/.env.example apps/feeds/.env
cp .env.example .env
# Edit the .env files as needed
```

```bash
# 4. Start services
docker compose up -d

# 5. Database migrations
turbo db:migrate --filter=@rocksky/api

# 6. Spotify integration (optional but recommended)
# Set SPOTIFY_ENCRYPTION_KEY and SPOTIFY_ENCRYPTION_IV first
bun run spotify <your_client_id> <your_client_secret>
```

Then run the dev servers:

```bash
bun run dev:jetstream
bun run mb
bun run feeds
turbo dev --filter=@rocksky/api --filter=@rocksky/web
```

### Operations console (Clojure REPL)

`tools/console/` is a Clojure project that centralizes every operational script
in the monorepo — lexicon codegen, DB migrations, data sync/backfill, Rust
daemons, devops glue — behind one discoverable REPL. Instead of remembering
which `package.json` script lives in which workspace or which `cargo run -p ...`
invokes which daemon, you call functions:

```bash
cd tools/console
mise install                       # locks JDK 21, Clojure, Babashka
clj -M:rebel                       # pretty terminal REPL (try `(help)`)
clj -M:dev                         # nREPL on :7888 for CIDER / Calva / Cursive
bb help                            # or fast one-shot CLI tasks
bb sync did:plc:abc123             # e.g. sync one user's scrobbles
```

See [`tools/console/README.md`](tools/console/README.md) for the full command
catalog and design notes.

## Comparison

| Feature                 | Last.fm       | ListenBrainz     | **Rocksky**              |
|-------------------------|---------------|------------------|--------------------------|
| Open Source             | No            | Yes              | Yes                      |
| Decentralized Identity  | No            | No               | Yes (AT Protocol)        |
| Social Feed             | Limited       | Basic            | Real-time Stories        |
| Data Ownership          | Last.fm       | You (export)     | You (on your PDS)        |
| Last.fm Compatibility   | —             | Partial          | Strong                   |

## 📚 Documentation

Full documentation is available at **[docs.rocksky.app](https://docs.rocksky.app)**.

- **[Quickstart](https://docs.rocksky.app/quickstart)** – Get scrobbling in a few minutes
- **[FAQ](https://docs.rocksky.app/faq)** – Common questions answered
- **Integrations** – [Jellyfin](https://docs.rocksky.app/integrations/jellyfin), [Navidrome](https://docs.rocksky.app/integrations/navidrome), [Pano Scrobbler](https://docs.rocksky.app/integrations/pano-scrobbler), [Kodi](https://docs.rocksky.app/integrations/kodi), [Claude Desktop](https://docs.rocksky.app/integrations/claude-desktop)
- **Migrating** – [from Last.fm](https://docs.rocksky.app/migrations/from-lastfm) · [from ListenBrainz](https://docs.rocksky.app/migrations/from-listenbrainz)
- **[Rocksky CLI](https://docs.rocksky.app/cli/overview)** – Scrobble, search, and manage from the terminal
- **[SDKs](https://docs.rocksky.app/sdks/overview)** – TypeScript, Python, Rust, Go, Ruby, Kotlin, Elixir, Clojure, Gleam
- **[API reference](https://docs.rocksky.app/api-reference/introduction)** – HTTP endpoints and OpenAPI spec

## Feedback & Contributing

This repo is the central place for issues and discussions.

- Join the **[Discord](https://discord.gg/EVcBy2fVa3)**
- Open issues on [Tangled](https://tangled.org/@rocksky.app/rocksky/issues/new)
- See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup

---

**Made with ❤️ for music lovers who want control over their data.**

[rocksky.app](https://rocksky.app) • [Docs](https://docs.rocksky.app)
