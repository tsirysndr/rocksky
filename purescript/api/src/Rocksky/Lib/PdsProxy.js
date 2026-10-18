// The rewrite has to live in JS: it wraps the global fetch and must accept the
// same (input, init) shapes undici does.
const originalFetch = globalThis.fetch.bind(globalThis);

export const createPdsProxyFetch = (overrides) => {
  const hosts = Object.keys(overrides);
  const overrideHostFor = (target) => {
    if (!hosts.some((h) => target.includes(h))) return null;
    try {
      return overrides[new URL(target).host.toLowerCase()] ?? null;
    } catch {
      return null;
    }
  };
  return async (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const overrideHost = overrideHostFor(target);
    if (!overrideHost) return originalFetch(input, init);
    const request = new Request(input, init);
    const url = new URL(request.url);
    url.host = overrideHost;
    url.port = "";
    // `new Request(url, request)` would carry the body over as a stream, which
    // undici rejects without `duplex: "half"`. Everything sent to a PDS this
    // way is small (OAuth token/PAR calls, XRPC records), so buffer instead.
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    return originalFetch(url, {
      method: request.method,
      headers: request.headers,
      body,
      redirect: request.redirect,
      signal: request.signal,
    });
  };
};

let installed = false;
export const installFetch = (f) => () => {
  if (installed) return;
  installed = true;
  globalThis.fetch = f;
};
