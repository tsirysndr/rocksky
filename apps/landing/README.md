# Rocksky landing page

A responsive landing page using React 19, HeroUI v3, Tailwind CSS 4, TanStack Query, Jotai, and the local Rocksky TypeScript SDK. It reuses the web app's dark palette and Rockford fonts.

## Development

From this directory:

```sh
bun install
bun run dev
```

The development server uses http://127.0.0.1:5175. Build with `bun run build` and serve the production build with `bun run preview`.

This is a standalone app with its own Bun lockfile. The repository's existing React 18 workspaces are unchanged. The SDK is a local file dependency on `../../sdk/typescript`; its `dist` output must exist (run `bun run build` from that SDK directory if needed).

## Live data

`src/data.ts` uses `RockskyClient.globalStats()` every 30 seconds and `RockskyClient.scrobbleFeed()` every 15 seconds. This is polling, not a WebSocket subscription. TanStack Query stops polling in background tabs and refreshes on focus/reconnection. The Jotai auto-refresh toggle pauses both intervals; normal reconnect/focus refresh remains enabled. No mock counts or listens are substituted on failure.

Optional build-time settings are listed in `.env.example`. Application links default to `https://rocksky.app`. Mirror and import links point to the guides at `https://docs.rocksky.app/mirroring/overview` and `https://docs.rocksky.app/cli/import`.

## Design and accessibility

Responsive navigation, keyboard focus styles, a skip link, loading/empty/error states, artwork fallbacks, and reduced-motion support are included. The record illustration and feature graphics are decorative; album artwork is supplied by the live API. The listening chart is illustrative, not a user's statistics.

## Sign-in and search

Sign in and Get started open `/#sign-in`, a responsive login screen with Atmosphere handle validation. OAuth follows the web app's existing flow through `https://rocksky.pages.dev/loading?handle=…`; account creation uses `?prompt=create`. The callback and session remain owned by the existing web app. Override `VITE_ROCKSKY_AUTH_URL` for a different gateway. The form also offers Password Login using the same `POST /login` contract as the web app. On success it stores the session token and routing hint, then opens the app. Passwords are sent only in the request body and are never persisted. Switching between OAuth and Password Login only changes the form and never navigates. Submitting password login from the standalone Pages preview moves to the configured app origin (`VITE_ROCKSKY_APP_URL`) so the session belongs to the app; credentials must be entered there. Deploy the updated landing and homepage proxy there to use this flow. Account creation always uses the OAuth gateway, including when Password Login is selected.

The topbar search opens with its icon, Command/Control+K, or `/`. It uses the Rocksky SDK with a 300 ms debounce, category filters, arrow-key navigation, and native dialog focus management. Result normalization and auth handoff checks run with `bun test`.

Spotify and Last.fm marks are sourced from the repository's installed Simple Icons assets. ListenBrainz's logo comes from https://listenbrainz.org/static/img/listenbrainz-logo.svg. Marks belong to their respective owners.

## Formatting

```sh
bun run format
bun run format:check
```

## Production assets behind the app proxy

Production builds reference assets under `/_landing/`; development stays at `/`.
The app proxy strips that prefix and fetches files from `https://rocksky-landing.pages.dev`, independently of authentication or device type. `public/_redirects` lets the standalone Pages URL resolve the same prefixed asset URLs.

Redeploy this app's `dist` output to the existing `rocksky-landing` Pages project, then deploy `apps/app-proxy` with `bun run deploy`. Verify `https://rocksky.app/_landing/spotify.svg` returns the SVG and a hashed `/_landing/assets/…js` URL from the built HTML returns JavaScript. Homepage selection is implemented by `apps/app-proxy/src/homepage.ts`; deploy the session and service-worker changes below before enabling it.

Run the isolated asset proxy tests from this directory with:

```sh
bun test ../app-proxy/test/landing-assets.bun.ts
```

## Logged-out homepage rollout

The proxy serves the landing page for guest `GET /` and `HEAD /` requests. A
host-only `rocksky_session_hint=1` cookie selects the desktop or mobile app shell.
It contains no token and grants no access: API authentication still validates the
existing token. Both apps set the hint when storing a session and clear it on
logout or an invalid session. It expires after 30 days and refreshes on app load.

Existing users with only a localStorage token are migrated by the landing entry
point before React renders. It sets the hint and reloads with `__rocksky_app=1`,
a public app-shell bypass that also works with cookies disabled. A stale hint
without a stored token is cleared by the app and the homepage reloads once.
These redirects only run on `rocksky.app`; standalone Pages previews remain usable.

OAuth `?did=…`, CLI handoffs, and `?session=expired` continue to load the existing
app so token exchange and expiry notifications work. Deep links, API endpoints,
and app assets keep their existing routes. Root HTML is fetched and returned
with caching disabled so one visitor's shell is never reused for another.
`/index.html` always returns the app shell directly, including for guests. This
protects older desktop service workers from caching the landing page after
Cloudflare Pages redirects `/index.html` to `/`.

Deploy in this order:

1. Deploy `apps/web` and `apps/web-mobile` to their existing origins. Both include
   session-hint synchronization and updated service workers. The workers exclude
   HTML from precaching and disable navigation fallback and the precache
   directory-index shortcut. All page navigation now reaches the proxy and
   needs the network; static app assets remain cached.
2. Redeploy `apps/landing` to `rocksky-landing.pages.dev` with the session migration
   helper. Keep the repository's `apps/shared` directory available during all
   builds; all three apps and the proxy import it.
3. Deploy `apps/app-proxy` last with `bun run deploy` from that directory.

After deployment, verify a private window gets the landing, an existing session
gets the app, sign-in returns to the app, and sign-out returns to the landing.
Also open several public profile and song links in the same private window
after the service worker activates: each must retain its URL and show the app.
Check desktop and mobile. Existing tabs may need a reload after their service
worker updates; clearing local storage would sign users out and is unnecessary.
If Cloudflare has a custom Cache Everything rule for the hostname, exclude `/`
and purge any previously cached root HTML before enabling routing.

Run the routing and session regression checks from `apps/landing`:

```sh
bun test tests ../app-proxy/test/landing-assets.bun.ts ../app-proxy/test/homepage.bun.ts
```

To roll back homepage selection, remove the `proxyHomepage` call in the proxy
and redeploy it. The asset namespace and browser session hints can remain.

## AtPassport sign-in

The login screen offers **Login with @atpassport** using the official
`@atpassport/client/core` native handle chooser (FedCM) in supported Chrome/Chromium
browsers. The request starts directly from the button press to preserve user
activation. Dismissing the chooser returns to the form without redirecting.
Unsupported browsers and provider network failures use the existing
[redirect integration](https://atpassport.net/en/developers/guide). AtPassport
selects a saved handle, then Rocksky starts its existing OAuth flow. The returned
DID, PDS URL, and any token are never used to establish a session.

A random state is stored in sessionStorage, expires after ten minutes, and is
consumed once at `/atpassport/callback`. Invalid or cancelled callbacks leave the
normal login form available. Callback query parameters are removed from browser
history before OAuth starts. The callback stays on the initiating origin, so
standalone Pages previews use their own sessionStorage too.

Deploy the updated desktop and mobile service workers, the landing, and the
app proxy. The proxy must serve landing HTML at `/atpassport/callback` even when
a session cookie or `did` parameter is present. Both service workers exclude
this route from SPA fallback. No API auth changes or AtPassport client secret
are needed.

Verify `rocksky.app` through the [AtPassport developer portal](https://atpassport.net/en/developers/verify)
to enable production FedCM and avoid the redirect flow’s unverified-domain warning.
The native chooser uses `https://rocksky.app` as its client ID. Preview domains
have separate verification. HTTPS and browser permission for
`identity-credentials-get` are required. Native chooser support depends on the
browser and its settings. After the earlier callback rollout, this native-chooser
upgrade only requires redeploying the landing app.
The provider supplies the domain verification instructions and proof; none has
been registered by this implementation.
