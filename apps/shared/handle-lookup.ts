const APPVIEW = "https://public.api.bsky.app";

export const normalizeHandle = (value: string) =>
  value.trim().replace(/^@/, "").toLowerCase();

export function isValidHandle(handle: string): boolean {
  const reserved = new Set([
    "alt",
    "arpa",
    "example",
    "internal",
    "invalid",
    "local",
    "localhost",
    "onion",
    "test",
  ]);
  return (
    handle.length <= 253 &&
    /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/.test(
      handle,
    ) &&
    !reserved.has(handle.split(".").at(-1) ?? "")
  );
}

export type HandleSuggestion = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};
export type HandleResolution = { handle: string; did: string | null };

async function request(path: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${APPVIEW}/xrpc/${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function resolveSignInHandle(
  input: string,
  signal?: AbortSignal,
): Promise<HandleResolution> {
  const handle = normalizeHandle(input);
  if (!isValidHandle(handle)) return { handle, did: null };
  const { response, data } = await request(
    `com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
    signal,
  );
  if (!response.ok) {
    if (
      response.status === 400 &&
      ["InvalidRequest", "InvalidHandle", "HandleNotFound"].includes(
        data?.error,
      )
    ) {
      return { handle, did: null };
    }
    throw new Error("Handle lookup unavailable");
  }
  if (
    typeof data?.did !== "string" ||
    !/^did:[a-z0-9]+:[^\s]+$/.test(data.did)
  ) {
    throw new Error("Invalid handle lookup response");
  }
  return { handle, did: data.did };
}

export async function searchHandleSuggestions(
  input: string,
  signal?: AbortSignal,
): Promise<HandleSuggestion[]> {
  const query = normalizeHandle(input);
  if (query.length < 2) return [];
  const { response, data } = await request(
    `app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(query)}&limit=5`,
    signal,
  );
  if (!response.ok || !Array.isArray(data?.actors))
    throw new Error("Suggestions unavailable");
  const seen = new Set<string>();
  return (data.actors as HandleSuggestion[])
    .filter((actor) => {
      if (
        typeof actor.handle !== "string" ||
        typeof actor.did !== "string" ||
        !isValidHandle(actor.handle) ||
        seen.has(actor.did)
      )
        return false;
      seen.add(actor.did);
      return true;
    })
    .slice(0, 5);
}
