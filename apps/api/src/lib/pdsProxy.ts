import { consola } from "consola";
import { env } from "./env";

/**
 * Some PDS hosts are unreachable from the production server (network/geo
 * filtering on their side) even though they are perfectly reachable from
 * elsewhere. `caramelo.social.br` is one of them, which makes every OAuth login
 * from that PDS fail with:
 *
 *   Failed to resolve OAuth server metadata for resource: https://caramelo.social.br/
 *
 * For those hosts we keep the *logical* URL untouched and only swap the host we
 * physically connect to, routing through a reverse proxy that forwards the
 * request verbatim and restores the upstream `Host` (see apps/caramelo-proxy).
 *
 * The swap has to happen at the fetch layer rather than at PDS-resolution time:
 *
 *   - `@atproto/oauth-client` validates that `/.well-known/oauth-protected-resource`
 *     returns `resource === <origin it asked for>` and that the authorization
 *     server metadata `issuer` matches too. Handing it the proxy origin would
 *     fail those checks.
 *   - DPoP proofs bind `htu` to the request URL, and the PDS compares it against
 *     its own hostname. A rewritten `htu` would be rejected on every call.
 *
 * Rewriting inside `fetch` keeps `htu`, the issuer/resource identifiers and the
 * `Host` seen by the PDS as `caramelo.social.br`; only the TCP hop changes.
 *
 * Configure with `PDS_HOST_OVERRIDES="unreachable.host=proxy.host,other=proxy2"`,
 * or set it to an empty string to disable the whole mechanism.
 */
function parseOverrides(raw: string): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [from, to] = trimmed
      .split("=")
      .map((part) => part.trim().toLowerCase());
    if (!from || !to) {
      consola.warn(`Ignoring malformed PDS_HOST_OVERRIDES entry: "${trimmed}"`);
      continue;
    }
    overrides.set(from, to);
  }
  return overrides;
}

export const pdsHostOverrides = parseOverrides(env.PDS_HOST_OVERRIDES);

const overriddenHosts = [...pdsHostOverrides.keys()];

/**
 * Host to physically connect to for `target`, or `null` when it is reachable
 * directly. The substring test is only a cheap guard so that the vast majority
 * of outbound requests never pay for a `new URL()`.
 */
function overrideHostFor(target: string): string | null {
  if (!overriddenHosts.some((host) => target.includes(host))) return null;
  try {
    return pdsHostOverrides.get(new URL(target).host.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}

const originalFetch: typeof globalThis.fetch =
  globalThis.fetch.bind(globalThis);

export function createPdsProxyFetch(
  baseFetch: typeof globalThis.fetch = originalFetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const overrideHost = overrideHostFor(target);
    if (!overrideHost) return baseFetch(input, init);

    const request = new Request(input, init);
    const url = new URL(request.url);
    url.host = overrideHost;
    url.port = "";

    // `new Request(url, request)` would carry the body over as a stream, which
    // undici rejects without `duplex: "half"`. Everything we send to a PDS this
    // way is small (OAuth token/PAR calls, XRPC records), so buffer instead.
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();

    consola.debug(
      `Routing ${request.method} ${request.url} via ${overrideHost}`,
    );

    return baseFetch(url, {
      method: request.method,
      headers: request.headers,
      body,
      redirect: request.redirect,
      signal: request.signal,
    });
  };
}

/**
 * Shared instance, so passing it explicitly (e.g. to the OAuth client) after
 * `installPdsProxyFetch()` cannot double-wrap the global.
 */
export const pdsProxyFetch = createPdsProxyFetch();

let installed = false;

/** Route unreachable PDS hosts through their proxy for every `fetch` caller. */
export function installPdsProxyFetch(): void {
  if (installed || pdsHostOverrides.size === 0) return;
  installed = true;
  globalThis.fetch = pdsProxyFetch;
  consola.info(
    `PDS host overrides active: ${overriddenHosts
      .map((host) => `${host} -> ${pdsHostOverrides.get(host)}`)
      .join(", ")}`,
  );
}
