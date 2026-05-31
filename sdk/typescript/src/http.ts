import {
  RockskyAuthError,
  RockskyHttpError,
  RockskyTimeoutError,
} from "./errors";
import {
  type AuthProvider,
  DEFAULT_BASE_URL,
  type FetchLike,
  type RequestOptions,
} from "./types";

export type XrpcCallOptions = RequestOptions & {
  params?: Record<string, unknown>;
  body?: unknown;
  requireAuth?: boolean;
};

export type HttpClientConfig = {
  baseUrl: string;
  auth?: AuthProvider;
  fetch: FetchLike;
  headers: Record<string, string>;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
};

export function buildConfig(opts: {
  baseUrl?: string;
  auth?: AuthProvider;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  userAgent?: string;
}): HttpClientConfig {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(opts.userAgent ? { "user-agent": opts.userAgent } : {}),
    ...(opts.headers ?? {}),
  };
  return {
    baseUrl: stripTrailingSlash(opts.baseUrl ?? DEFAULT_BASE_URL),
    auth: opts.auth,
    fetch: opts.fetch ?? globalThis.fetch.bind(globalThis),
    headers,
    timeoutMs: opts.timeoutMs ?? 30_000,
    retries: opts.retries ?? 0,
    retryDelayMs: opts.retryDelayMs ?? 300,
  };
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function resolveAuth(
  provider: AuthProvider | undefined | null,
): Promise<string | undefined> {
  if (provider == null) return undefined;
  if (typeof provider === "string") return provider;
  return await provider();
}

export function serializeParams(
  params: Record<string, unknown> | undefined,
): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item == null) continue;
        usp.append(k, String(item));
      }
    } else if (typeof v === "boolean") {
      usp.append(k, v ? "true" : "false");
    } else {
      usp.append(k, String(v));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export async function xrpcCall<T>(
  config: HttpClientConfig,
  nsid: string,
  method: "GET" | "POST",
  opts: XrpcCallOptions = {},
): Promise<T> {
  const url =
    `${config.baseUrl}/xrpc/${nsid}` + serializeParams(opts.params);

  const timeoutMs = opts.timeoutMs ?? config.timeoutMs;
  const retries = opts.retries ?? config.retries;

  const headers: Record<string, string> = {
    ...config.headers,
    ...(opts.headers ?? {}),
  };

  const authProvider = opts.auth === undefined ? config.auth : opts.auth;
  const token = await resolveAuth(authProvider);
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (opts.requireAuth) {
    throw new RockskyAuthError(
      `${nsid} requires authentication — provide an "auth" token`,
    );
  }

  const init: RequestInit = {
    method,
    headers,
    signal: opts.signal,
  };

  if (method === "POST" && opts.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await runOnce<T>(config.fetch, url, init, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === retries) throw err;
      await sleep(config.retryDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

async function runOnce<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const upstream = init.signal;
  const onAbort = () => controller.abort(upstream?.reason);
  upstream?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await res.text();
    const body = parseMaybeJson(text);
    if (!res.ok) {
      throw new RockskyHttpError({
        status: res.status,
        statusText: res.statusText,
        url,
        body,
      });
    }
    return body as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (upstream?.aborted) throw err;
      throw new RockskyTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", onAbort);
  }
}

function parseMaybeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof RockskyTimeoutError) return true;
  if (err instanceof RockskyHttpError) {
    return err.status >= 500 || err.status === 429;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
