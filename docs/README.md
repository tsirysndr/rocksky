# Rocksky Docs

The source for [docs.rocksky.app](https://docs.rocksky.app) — the documentation
site for [Rocksky](https://rocksky.app), a decentralized, open-source music
scrobbling network built on the [AT Protocol](https://atproto.com).

Built with [Mintlify](https://mintlify.com).

## Structure

```
docs/
├── docs.json                # Mintlify config (navigation, theme, anchors)
├── index.mdx                # Landing page
├── quickstart.mdx           # 5-minute onboarding
├── faq.mdx
├── integrations/            # Jellyfin, Navidrome, Pano Scrobbler, Kodi, …
├── migrations/              # from-lastfm, from-listenbrainz
├── cli/                     # `rocksky` CLI reference (one page per command)
├── sdks/                    # TypeScript, Python, Rust, Go, Ruby, Kotlin,
│                            #   Elixir, Clojure, Gleam
└── api-reference/
    ├── introduction.mdx
    └── openapi.json         # Production OpenAPI spec (auto-generates endpoints)
```

The API reference endpoint pages are generated from `openapi.json` at build
time — don't edit them by hand.

## Local development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint):

```bash
npm i -g mint
```

From this directory:

```bash
mint dev              # preview at http://localhost:3000
mint broken-links     # validate internal links
```

## Updating the API reference

Replace `api-reference/openapi.json` with a regenerated spec — the endpoint
tree under the **API reference** tab will pick it up automatically.

## Publishing

Changes pushed to `main` deploy automatically via the Mintlify GitHub app.

## Contributing

Issues and PRs welcome at
[tangled.org/@rocksky.app/rocksky](https://tangled.org/@rocksky.app/rocksky).
Chat with the team on [Discord](https://discord.gg/EVcBy2fVa3).

## License

[MIT](LICENSE) © Tsiry Sandratraina.
