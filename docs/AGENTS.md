# Rocksky docs — agent instructions

## About this project

- Documentation site for [Rocksky](https://rocksky.app), built with [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- API endpoint pages are auto-generated from `api-reference/openapi.json` — do not hand-edit them
- Run `mint dev` to preview locally
- Run `mint broken-links` to validate internal links before opening a PR

## Terminology

- Use **Rocksky** (capital R) when referring to the product
- A **scrobble** is one recorded play. **Scrobbling** is the act of recording.
- Refer to the social feed as the **Stories** feed
- Bluesky / AT Protocol are separate; Rocksky is *not* affiliated with Bluesky

## Style preferences

- Active voice, second person ("you")
- Concise sentences — one idea per sentence
- Sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references
- No emojis unless explicitly requested

## Content boundaries

- The **API reference** tab is generated from `openapi.json`. Don't add hand-written endpoint pages there.
- SDK docs in `sdks/` should stay in sync with each SDK's README under `../sdk/<language>/`. When an SDK README changes, mirror the changes here.
- Don't document internal/admin features that aren't user-facing.
