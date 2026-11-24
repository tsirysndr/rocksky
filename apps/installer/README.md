# Rocksky installer Worker

Proxies GET and HEAD requests to fixed GitHub installer scripts, preserving
GitHub's response body, headers and status:

- `/playerd` and `/playerd/` serve `https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh`.
- Other paths retain the CLI installer at `https://raw.githubusercontent.com/tsirysndr/rocksky/main/install.sh`.

Request query strings, headers and credentials are not forwarded. Other methods
return 405, and upstream connection failures return 502.

```sh
cd apps/installer
bun install
bun run dev
bun run deploy
```

The Worker is named `rocksky-installer`. Once deployed, install with:

```sh
curl -fsSL https://cli.rocksky.app | sh

# Headless remote player
curl -fsSL https://cli.rocksky.app/playerd | sh
```

No bindings or secrets are required. Configure a custom domain in Cloudflare or
add a route to `wrangler.jsonc` if desired.
