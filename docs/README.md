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

In the Rocksky source repository, run:

```sh
node apps/api/scripts/generate-openapi.cjs
node --test apps/api/tests/openapi.test.cjs
```

The generator reads the registered XRPC handlers, current lexicons, and
known response-type exceptions. It updates `docs/api-reference/openapi.json`
without executing handlers. Use `node apps/api/scripts/generate-openapi.cjs --check`
to detect stale output.

Copy the generated spec to this documentation site's
`api-reference/openapi.json`. The **API reference** tab picks it up automatically.
Do not edit generated endpoint pages. When changing authentication behavior,
update the generator's authentication overrides too.

## Publishing

Changes pushed to `main` deploy automatically via the Mintlify GitHub app.

## Contributing

Issues and PRs welcome at
[tangled.org/@rocksky.app/rocksky](https://tangled.org/@rocksky.app/rocksky).
Chat with the team on [Discord](https://discord.gg/EVcBy2fVa3).

## License

[MIT](LICENSE) © Tsiry Sandratraina.
