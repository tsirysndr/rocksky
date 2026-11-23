# Rocksky installer Worker

Proxies GET and HEAD requests to
`https://raw.githubusercontent.com/tsirysndr/rocksky/main/install.sh`, preserving
GitHub's response body, headers and status. Every path serves the same script;
request query strings and credentials are not forwarded. Other methods return
405, and upstream connection failures return 502.

```sh
cd apps/installer
bun install
bun run dev
bun run deploy
```

The Worker is named `rocksky-installer`. Once deployed, install with:

```sh
curl -fsSL https://cli.rocksky.app | sh
```

No bindings or secrets are required. Configure a custom domain in Cloudflare or
add a route to `wrangler.jsonc` if desired.
