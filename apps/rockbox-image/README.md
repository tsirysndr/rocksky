# rockbox-image

The Docker image that each per-user Fly machine runs.

```
tsiry/rockbox:latest              ← upstream rockbox + CMAF on :7882
        +
container_src/main.go             ← Go reverse proxy on :8080
        │   /hls/, /seg/, /dash/, /init.mp4  → :7882 (CMAF)
        │   /                                 → :6062 (rockbox HTTP / GraphQL)
        │   rewrites manifest segment paths   → /${X-Rockbox-Id}/seg/...
        ▼
registry.fly.io/rockbox:latest    ← what the router spawns
```

The proxy is necessary for two reasons:
- Fly machines expose a single port (8080) and rockbox listens on several. The proxy demuxes paths to the right rockbox port.
- HLS manifests reference segments as `/seg/N.m4s`. The browser fetches segments at `rockbox.rocksky.app/${did}/seg/...`, so the proxy rewrites manifest URIs to include the `/${did}/` prefix (read from `X-Rockbox-Id`, which the CF Worker sets per request).

## Push

```
cd apps/rockbox-image
./deploy.sh
# or, manually:
fly deploy --app rockbox --build-only --push --image-label latest
```

This builds the image and uploads it to `registry.fly.io/rockbox:latest`. It does NOT create a Fly release — the `rockbox` app intentionally has no default machine; the router spawns one per DID on demand.

## Rotating an existing machine

Pushing a new image does not automatically restart already-running machines. To roll a single user's machine:

```
fly machine list -a rockbox
fly machine destroy --force <id> -a rockbox
# router will re-provision on the next request to that DID
```

To roll everyone at once (only do this in a maintenance window):

```
fly machine list -a rockbox -j | jq -r '.[].id' \
  | xargs -I{} fly machine destroy --force {} -a rockbox
```

## What lives where

```
apps/rockbox-image/   ← THIS — Dockerfile + Go proxy, pushed as registry.fly.io/rockbox
apps/rockbox-router/  ← Fly app that allocates one machine per DID
apps/rockbox/         ← CF Worker (public hostname, CORS, forwards to router)
```
