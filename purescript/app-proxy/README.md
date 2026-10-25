# Rocksky app proxy

PureScript port of `../../apps/app-proxy`, packaged as `rocksky-app-proxy` in
this Spago workspace. It remains a Cloudflare Worker; it does not start a Node
server or depend on the `rocksky-api` package.

Run from the PureScript workspace root:

```sh
bun run build:app-proxy
bun run test:app-proxy
bun run bundle:app-proxy
```

The bundle is written to `app-proxy/dist/worker.js`. The minimal `worker.js`
entrypoint adapts `Rocksky.AppProxy.Index.fetch` to Cloudflare's Worker handler.
Wrangler can also bundle that entrypoint directly, building PureScript first:

```sh
bunx wrangler dev --config app-proxy/wrangler.json
bunx wrangler deploy --config app-proxy/wrangler.json
```

The Wrangler configuration retains the source Worker name (`patient-bar-6c30`)
and compatibility date. Deployment replaces that Worker; use a different name
for a separate deployment. No deployment is performed by the build or tests.

Optional Worker environment bindings:

- `ANDROID_PLAY_SIGNING_SHA256`: comma-separated additional SHA-256 signing
  fingerprints. Both existing release fingerprints are always included.
- `APPLE_TEAM_ID`: ten uppercase letters/digits for iOS app associations.
  Without a valid team ID, the association contains no app details.

## Modules

- `Rocksky.AppProxy.Index`: Worker handler, CORS, API and application routing.
- `Routing`: mobile detection, session hints, auth handoffs, and route predicates.
- `Homepage`: selects the guest landing or application shell, strips credentials,
  and prevents personalized shell selection from being cached.
- `LandingAssets`: isolates `/_landing/` assets, preserving cache validators and
  rejecting redirects or HTML fallback responses.
- `AppLinks`: Android and iOS association responses.
- `Metadata`: OAuth client metadata and public JWKS, preserving the source values.
- `HtmlRewriter`: OG lookup, target matching, escaped social metadata generation.
- `Web`: small bindings for Fetch, Request, Response, URL, and HTMLRewriter.

Routing and response policy live in PureScript. The bindings require standard
Web APIs plus Cloudflare's `HTMLRewriter` for successful preview responses.
The package has no imports from the original TypeScript implementation.

The Node regression suite ports the source's relevant tests (the stale
Hello World scaffold is excluded) and adds coverage for API forwarding,
preflight, OAuth metadata, public keys, rockbox assets, preview escaping,
and outages. Network calls are mocked; the Node preview tests verify the
HTMLRewriter integration through a test double, without contacting production.
The Android association fixture is copied from the mobile site's public file.
