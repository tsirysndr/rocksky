import { afterEach, expect, mock, test } from "bun:test";
import {
  isValidHandle,
  normalizeHandle,
  resolveSignInHandle,
  searchHandleSuggestions,
} from "../src/api/handleLookup";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const reply = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });

test("handles accept custom domains and normalize a pasted @handle", () => {
  expect(normalizeHandle(" @Alice.BSKY.SOCIAL ")).toBe("alice.bsky.social");
  for (const value of [
    "alice.bsky.social",
    "artist.music",
    "8.cn",
    "my-name.com",
  ])
    expect(isValidHandle(value)).toBe(true);
  for (const value of [
    "",
    "alice",
    "alice..social",
    "-alice.social",
    "alice-.social",
    "alice social",
    "https://alice.social",
    "127.0.0.1",
    "handle.invalid",
    "a.local",
    "a.test",
    `${"a".repeat(64)}.com`,
  ])
    expect(isValidHandle(value)).toBe(false);
});

test("invalid handles are blocked without making a network request", async () => {
  const fetcher = mock(() => Promise.resolve(reply({})));
  globalThis.fetch = fetcher;
  expect(await resolveSignInHandle("not a handle")).toEqual({
    handle: "not a handle",
    did: null,
  });
  expect(fetcher).not.toHaveBeenCalled();
});

test("full handles resolve independently of autocomplete availability", async () => {
  globalThis.fetch = mock(async () =>
    reply({ did: "did:plc:abcdefghijklmnopqrstuvwx" }),
  );
  expect(await resolveSignInHandle(" @Artist.Music ")).toEqual({
    handle: "artist.music",
    did: "did:plc:abcdefghijklmnopqrstuvwx",
  });
  expect(globalThis.fetch.mock.calls[0][0]).toContain("handle=artist.music");
});

test("nonexistent accounts are distinct from network and service failures", async () => {
  globalThis.fetch = mock(async () =>
    reply(
      { error: "InvalidRequest", message: "Unable to resolve handle" },
      400,
    ),
  );
  expect((await resolveSignInHandle("missing.bsky.social")).did).toBeNull();
  globalThis.fetch = mock(async () => reply({ error: "InternalError" }, 503));
  await expect(resolveSignInHandle("alice.bsky.social")).rejects.toThrow(
    "unavailable",
  );
  globalThis.fetch = mock(async () => {
    throw new Error("offline");
  });
  await expect(resolveSignInHandle("alice.bsky.social")).rejects.toThrow(
    "offline",
  );
});

test("suggestions omit invalid handles and duplicate identities", async () => {
  const actor = {
    did: "did:plc:alice",
    handle: "alice.bsky.social",
    displayName: "Alice",
    avatar: "https://cdn.example/a.jpg",
  };
  globalThis.fetch = mock(async () =>
    reply({
      actors: [
        actor,
        actor,
        { did: "did:plc:invalid", handle: "handle.invalid" },
      ],
    }),
  );
  expect(await searchHandleSuggestions("@alice")).toEqual([actor]);
});

test("cancelled lookups propagate cancellation to fetch", async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = mock(async (_url, { signal }) => {
    expect(signal.aborted).toBe(true);
    throw new Error("aborted");
  });
  await expect(
    resolveSignInHandle("alice.bsky.social", controller.signal),
  ).rejects.toThrow("aborted");
});
