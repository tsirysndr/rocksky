export const fetchImpl = baseUrl => token => method => timeoutMs => nsid => params => body => hasBody => (onError, onSuccess) => {
  const controller = new AbortController();
  let cancelled = false;
  let timer;
  Promise.resolve().then(async () => {
    if (cancelled) return;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive integer");
    if (!/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/.test(nsid)) throw new Error("Invalid XRPC NSID");
    const url = new URL(baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("baseUrl must be an HTTP(S) URL without credentials, query or fragment");
    }
    url.pathname = url.pathname.replace(/\/+$/, "") + "/xrpc/" + nsid;
    if (params === null || typeof params !== "object" || Array.isArray(params)) throw new Error("XRPC parameters must be an object");
    for (const [key, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item == null) continue;
        if (!["string", "number", "boolean"].includes(typeof item)) throw new Error("Invalid XRPC parameter: " + key);
        url.searchParams.append(key, String(item));
      }
    }
    const headers = { accept: "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    if (hasBody) headers["content-type"] = "application/json";
    timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
    const response = await fetch(url, {
      method, headers, signal: controller.signal,
      redirect: "error",
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.text() };
  }).then(
    value => { if (!cancelled) onSuccess(value); },
    error => { if (!cancelled) onError(error instanceof Error ? error : new Error(String(error))); },
  ).finally(() => clearTimeout(timer));
  return (_error, _onError, onCancel) => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
    onCancel();
  };
};
