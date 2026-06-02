# Contributing to the Rocksky docs

Thanks for helping make the [Rocksky](https://rocksky.app) documentation
better. Pages live at [docs.rocksky.app](https://docs.rocksky.app) and are
built from this directory with [Mintlify](https://mintlify.com).

## How to contribute

### Option 1: Edit on Tangled

1. Open the page you want to edit on
   [tangled.org/@rocksky.app/rocksky](https://tangled.org/@rocksky.app/rocksky),
   under `docs/`.
2. Edit the MDX file and open a pull request.

### Option 2: Local development

1. Fork and clone the repo.
2. Install the Mintlify CLI:

   ```bash
   npm i -g mint
   ```

3. Create a branch.
4. From `docs/`, run `mint dev` and preview at `http://localhost:3000`.
5. Validate links: `mint broken-links`.
6. Commit and open a pull request.

## Writing guidelines

- **Active voice.** "Run the command", not "The command should be run".
- **Second person.** Address the reader as **you**.
- **One idea per sentence.** Keep sentences concise.
- **Lead with the goal.** Start instructions with what the reader wants to do.
- **Consistent terminology.** Use **Rocksky**, **scrobble**, and **Stories**
  the same way each time (see [AGENTS.md](./AGENTS.md)).
- **Show, don't tell.** Include code examples for every command and endpoint.

## What lives where

- `index.mdx`, `quickstart.mdx`, `faq.mdx` — top-level user-facing pages
- `integrations/` — one page per supported player or client
- `migrations/` — Last.fm and ListenBrainz migration guides
- `cli/` — one page per `rocksky` CLI command (mirror `rocksky help <cmd>`)
- `sdks/` — one page per language SDK, kept in sync with
  `../sdk/<language>/README.md`
- `api-reference/openapi.json` — the production OpenAPI spec; endpoint pages
  are auto-generated from it (don't write them by hand)
- `docs.json` — navigation, theme, anchors

## SDK pages

The SDK pages mirror the READMEs under `../sdk/<language>/`. When you update
an SDK README, please update its docs page in the same PR so they don't
drift.

## Style

- Sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- No emojis unless the user asks for them

## Reporting issues

Open an issue on
[tangled.org/@rocksky.app/rocksky](https://tangled.org/@rocksky.app/rocksky/issues/new)
or chat with the team on [Discord](https://discord.gg/EVcBy2fVa3).
