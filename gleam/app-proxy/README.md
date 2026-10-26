# Rocksky app proxy in Gleam

Independent `rocksky_app_proxy` package ported from `apps/app-proxy`. The parent
Gleam package includes it as a local path dependency, so the workspace build
compiles both the API and proxy. The proxy remains a Cloudflare Worker and does
not import the API or original TypeScript at runtime.

From `gleam/`:

```sh
bun run build:app-proxy
bun run test:app-proxy
bun run bundle:app-proxy
```

The bundle is `app-proxy/dist/worker.js`. The small `worker.mjs` entrypoint can
also be bundled directly by Wrangler, whose build hook compiles Gleam first:

```sh
bunx wrangler dev --config app-proxy/wrangler.json
bunx wrangler deploy --config app-proxy/wrangler.json
```

The configuration preserves the existing Worker name (`patient-bar-6c30`) and
compatibility date. Deploying replaces that Worker; change the name to deploy a
separate instance. Build and test commands do not deploy.

Optional Worker bindings:

- `ANDROID_PLAY_SIGNING_SHA256`: comma-separated additional SHA-256 signing
  certificates. Both existing release certificates are always included.
- `APPLE_TEAM_ID`: ten uppercase letters/digits. An absent or invalid team ID
  produces an empty iOS association detail list.

Routing, CORS, cache policy, homepage selection, asset isolation, app links,
OAuth metadata/public JWKS, and escaped social previews are implemented in
Gleam. `web_ffi.mjs` binds Fetch, URL, Request, Response, regular expressions,
and URI decoding. `cloudflare.gleam` provides typed HTMLRewriter/Element bindings
for selector handlers, removal, HTML append, and streaming transformation; the
selectors and rewrite policy remain in Gleam. Static homepage requests strip credentials and
queries; API requests retain credentials and bodies and bypass caching.

The Node regression suite includes the original behavioral cases and additional
API, CORS, preview, and outage checks adapted from the PureScript port. Network
calls are mocked and HTMLRewriter uses a test double. The stale Hello World
scaffold is excluded. Invalid preview JSON falls back to the original HTML;
otherwise upstream error behavior follows the source. Production network and
Cloudflare HTML parsing are not exercised by these unit tests.
