import type { FetchLike } from "../src/types";

export type MockCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type MockResponse =
  | { status?: number; json?: unknown; text?: string; delayMs?: number }
  | ((call: MockCall) => {
      status?: number;
      json?: unknown;
      text?: string;
      delayMs?: number;
    });

export function mockFetch(response: MockResponse = { json: { ok: true } }) {
  const calls: MockCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    const hs = init?.headers as Record<string, string> | undefined;
    if (hs) for (const [k, v] of Object.entries(hs)) headers[k.toLowerCase()] = v;
    const call: MockCall = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const resolved =
      typeof response === "function" ? response(call) : response;
    if (resolved.delayMs) {
      await new Promise((r) => setTimeout(r, resolved.delayMs));
    }
    if (init?.signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    const status = resolved.status ?? 200;
    const text =
      resolved.text !== undefined
        ? resolved.text
        : resolved.json !== undefined
          ? JSON.stringify(resolved.json)
          : "";
    return new Response(text, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

export function lastUrl(calls: MockCall[]): URL {
  const last = calls[calls.length - 1];
  if (!last) throw new Error("no calls");
  return new URL(last.url);
}
